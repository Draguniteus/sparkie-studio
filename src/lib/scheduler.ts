import { query } from '@/lib/db'
import { writeWorklog } from '@/lib/worklog'
import { runAuthHealthSweep } from '@/lib/authHealth'
import { classifyHeartbeatSignal } from '@/lib/signalQueue'
import { pruneToolCache } from '@/lib/toolCallWrapper'
import { loadReadyDeferredIntents, markDeferredIntentSurfaced } from '@/lib/timeModel'
import { runTTLDecaySweep } from '@/lib/knowledgeTTL'
import { computeUserModel } from '@/lib/userModel'
import { runConfidenceDecay } from '@/lib/behaviorRules'
import { runSelfReflection } from '@/lib/selfReflection'
import { seedStarterGoals, escalateStaleGoals } from '@/lib/goalEngine'

// ── Notification Policy Engine ────────────────────────────────────────────────
// Enforces topic-level notification policies at runtime.
// immediate → push via SSE immediately
// defer      → queue for batch digest (no push, log only)
// auto       → L4 urgency judgment from sparkie_user_model

interface SurfacedSignal {
  userId: string
  topicId: string
  topicName: string
  notificationPolicy: 'immediate' | 'defer' | 'auto'
  signalType: string
  content: string
  priority: 'P1' | 'P2' | 'P3'
  metadata?: Record<string, unknown>
}

// Push a proactive signal to the user's SSE stream via the proactive-sse endpoint
async function pushProactiveSignal(signal: SurfacedSignal): Promise<void> {
  try {
    await fetch(`${INTERNAL_BASE}/api/proactive-sse?userId=${signal.userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'proactive_signal',
        signal_type: signal.signalType,
        topic_id: signal.topicId,
        topic_name: signal.topicName,
        content: signal.content,
        priority: signal.priority,
        metadata: signal.metadata ?? {},
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {}) // non-fatal — SSE may not be connected
  } catch { /* non-fatal */ }
}

// Evaluate urgency via L4 user model for 'auto' policy signals
async function evaluateAutoUrgency(userId: string, signal: SurfacedSignal): Promise<'immediate' | 'defer'> {
  try {
    // Fetch L4 emotional/behavioral state to determine if signal warrants push
    const userModelRows = await query<{ emotional_state: string; behavioral_tags: string[] }>(
      `SELECT emotional_state, behavioral_tags FROM sparkie_user_model WHERE user_id = $1 LIMIT 1`,
      [userId]
    )
    if (userModelRows.rows.length === 0) return 'defer'

    const { emotional_state, behavioral_tags } = userModelRows.rows[0]
    const state = typeof emotional_state === 'string' ? JSON.parse(emotional_state) : (emotional_state ?? {})
    const tags: string[] = Array.isArray(behavioral_tags) ? behavioral_tags : []

    // High urgency signals always get immediate treatment
    if (signal.priority === 'P1') return 'immediate'

    // If user is in 'focus' mode, defer non-critical signals
    const focusMode = state.focus_mode ?? false
    if (focusMode && signal.priority === 'P3') return 'defer'

    // Check if signal topic matches user's current active interests (behavioral tags)
    const topicLower = signal.topicName.toLowerCase()
    const matchesInterest = tags.some(tag => topicLower.includes(tag.toLowerCase()))
    if (matchesInterest && signal.priority === 'P2') return 'immediate'

    return 'defer'
  } catch {
    return 'defer' // fail safe
  }
}

// Main policy engine — call this whenever a signal surfaces from any source
export async function notificationPolicyEngine(signal: SurfacedSignal): Promise<void> {
  switch (signal.notificationPolicy) {
    case 'immediate':
      // Always push immediately
      await pushProactiveSignal(signal)
      await writeWorklog(signal.userId, 'proactive_signal', signal.content, {
        decision_type: 'proactive',
        reasoning: `Topic "${signal.topicName}" has immediate notification policy. Pushing now.`,
        signal_priority: signal.priority,
        topic_id: signal.topicId,
        conclusion: `Immediate notification sent for: ${signal.content.slice(0, 60)}`,
        ...(signal.metadata ?? {}),
      })
      break

    case 'defer':
      // Log silently, no push — will surface in digest
      await writeWorklog(signal.userId, 'proactive_signal', signal.content, {
        decision_type: 'skip',
        reasoning: `Topic "${signal.topicName}" has defer policy. Silently queued for digest.`,
        signal_priority: 'P3',
        topic_id: signal.topicId,
        conclusion: `Deferred — queued for batch digest: ${signal.content.slice(0, 60)}`,
        ...(signal.metadata ?? {}),
      })
      break

    case 'auto':
      // L4 judgment: evaluate urgency, then push or defer
      const resolved = await evaluateAutoUrgency(signal.userId, signal)
      if (resolved === 'immediate') {
        await pushProactiveSignal(signal)
        await writeWorklog(signal.userId, 'proactive_signal', signal.content, {
          decision_type: 'proactive',
          reasoning: `Topic "${signal.topicName}" has auto policy — L4 judgment: immediate (high urgency detected).`,
          signal_priority: 'P1',
          topic_id: signal.topicId,
          conclusion: `Auto-immediate notification sent: ${signal.content.slice(0, 60)}`,
          ...(signal.metadata ?? {}),
        })
      }
      // 'defer' → silent log, nothing pushed
      break
  }
}

// Also export pushProactiveSignal for use by other schedulers/tasks
export { pushProactiveSignal }
const COMPOSIO_BASE = 'https://backend.composio.dev/api/v3'
const COMPOSIO_KEY  = process.env.COMPOSIO_API_KEY ?? ''
const INTERNAL_BASE = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'

// ── Phase 4: Topic Routing ─────────────────────────────────────────────────
// Classifies incoming emails and routes them to matching sparkie_topics by fingerprint/aliases.
// Honors each topic's notification_policy (immediate/defer/auto).

async function routeEmailToTopic(
  userId: string,
  emailId: string,
  subject: string,
  fromEmail: string,
  snippet: string
): Promise<string | null> {
  try {
    // Fetch all active topics for this user
    const topics = await query<{
      id: string
      name: string
      fingerprint: string
      aliases: string[]
      notification_policy: string
    }>(
      `SELECT id, name, fingerprint, aliases, notification_policy
       FROM sparkie_topics
       WHERE user_id = $1 AND status = 'active'
       ORDER BY updated_at DESC LIMIT 50`,
      [userId]
    )

    if (topics.rows.length === 0) return null

    const emailText = `${subject} ${fromEmail} ${snippet}`.toLowerCase()

    // Score each topic by keyword overlap
    let bestMatch: { id: string; name: string; score: number; policy: string } | null = null

    for (const topic of topics.rows) {
      let score = 0
      const fp = (topic.fingerprint ?? '').toLowerCase()
      const aliases: string[] = Array.isArray(topic.aliases) ? topic.aliases : []

      // Fingerprint match — split on spaces and check each word
      for (const word of fp.split(/\s+/).filter(w => w.length > 3)) {
        if (emailText.includes(word)) score += 2
      }

      // Alias match
      for (const alias of aliases) {
        const al = alias.toLowerCase()
        if (emailText.includes(al)) score += 3
      }

      // Topic name match
      for (const word of topic.name.toLowerCase().split(/\s+/).filter(w => w.length > 3)) {
        if (emailText.includes(word)) score += 1
      }

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { id: topic.id, name: topic.name, score, policy: topic.notification_policy ?? 'auto' }
      }
    }

    if (!bestMatch || bestMatch.score < 2) return null

    // Check if already linked
    const existing = await query<{ id: string }>(
      `SELECT id FROM sparkie_topic_threads
       WHERE topic_id = $1 AND source_type = 'email' AND source_id = $2 LIMIT 1`,
      [bestMatch.id, emailId]
    )
    if (existing.rows.length > 0) return bestMatch.id

    // Link the email to the topic
    await query(
      `INSERT INTO sparkie_topic_threads (topic_id, source_type, source_id, summary, created_at)
       VALUES ($1, 'email', $2, $3, NOW())
       ON CONFLICT DO NOTHING`,
      [bestMatch.id, emailId, `Auto-routed: ${subject.slice(0, 120)}`]
    )

    // Update topic's updated_at
    await query(
      `UPDATE sparkie_topics SET updated_at = NOW() WHERE id = $1`,
      [bestMatch.id]
    )

    // Log based on notification policy
    const logPriority = bestMatch.policy === 'immediate' ? 'P1'
                       : bestMatch.policy === 'defer'     ? 'P3'
                       : 'P2'

    // For 'defer' policy: write deferred worklog entry but do NOT surface SSE notification
    if (bestMatch.policy === 'defer') {
      await writeWorklog(userId, 'email_deferred', `📬 Email deferred — routed to "${bestMatch.name}" silently: ${subject.slice(0, 80)}`, {
        decision_type: 'skip',
        reasoning: `Topic "${bestMatch.name}" has defer policy. Email silently linked without notification.`,
        signal_priority: 'P3',
        topic_id: bestMatch.id,
        email_id: emailId,
        status: 'done',
        conclusion: `Email deferred — linked without notification`,
      })
      return bestMatch.id
    }

    await notificationPolicyEngine({
      userId,
      topicId: bestMatch.id,
      topicName: bestMatch.name,
      notificationPolicy: bestMatch.policy as 'immediate' | 'defer' | 'auto',
      signalType: 'email_routed',
      content: `📎 Email routed to topic "${bestMatch.name}": ${subject.slice(0, 80)}`,
      priority: logPriority as 'P1' | 'P2' | 'P3',
      metadata: { email_id: emailId, match_score: bestMatch.score },
    })

    return bestMatch.id
  } catch (e) {
    console.error('[scheduler] routeEmailToTopic error:', e)
    return null
  }
}


// Deploy failure email detection patterns for watchdog
const DEPLOY_FAIL_PATTERNS = [
  /deploy.*(fail|error|failed|rejected)/i,
  /build.*(fail|error|failed)/i,
  /vercel.*(fail|error|failed)/i,
  /render.*(fail|error|failed)/i,
  /netlify.*(fail|error|failed)/i,
  /error.*deployment/i,
  /deployment.*error/i,
]

// Check if a message is a deploy failure notification
function isDeployFailureEmail(msg: { subject: string; from: string; snippet: string }): boolean {
  const text = `${msg.subject} ${msg.from} ${msg.snippet}`
  return DEPLOY_FAIL_PATTERNS.some(p => p.test(text))
}

// Fetch and diagnose build logs from deploy-monitor
async function diagnoseDeploymentFailure(): Promise<{
  errorType: string
  details: string
  suggestedFix: string
  buildLog: string
} | null> {
  try {
    const res = await fetch(`${INTERNAL_BASE}/api/deploy-monitor`, {
      headers: { 'x-cron-secret': process.env.AGENT_CRON_SECRET ?? '' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    const data = await res.json() as {
      status: string
      failed: boolean
      buildLog?: string
      diagnosis?: { errorType: string; details: string; suggestedFix: string }
    }
    if (!data.failed) return null
    return {
      errorType: data.diagnosis?.errorType ?? 'Unknown',
      details: data.diagnosis?.details ?? '',
      suggestedFix: data.diagnosis?.suggestedFix ?? '',
      buildLog: data.buildLog ?? '',
    }
  } catch { return null }
}

async function proactiveInboxSweep(userId: string): Promise<void> {
  if (!COMPOSIO_KEY) return

  // 1. Fetch last 5 unread emails via Composio Gmail connector
  let emailsJson: string
  let messages: Array<{ subject: string; from: string; snippet: string; id: string }> = []
  try {
    const entityId = `sparkie_user_${userId}`
    // Exclude trash, spam, and promotions from sweep — Block 10 inbox scoring
    const emailRes = await fetch(`${COMPOSIO_BASE}/tools/execute/GMAIL_FETCH_EMAILS`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': COMPOSIO_KEY },
      body: JSON.stringify({
        entity_id: entityId,
        arguments: { query: 'is:unread -in:trash -in:spam -in:promotions -label:SPAM -label:TRASH -label:DELETED', max_results: 10 },
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!emailRes.ok) return
    const emailData = await emailRes.json() as { data?: { messages?: Array<{ subject: string; from: string; snippet: string; id: string; labelIds?: string[] }> } }
    const rawMessages = emailData?.data?.messages ?? []

    // ── Inbox scoring — skip obvious marketing/newsletters ────────────────────
    const SKIP_PATTERNS = [
      /unsubscribe/i, /newsletter/i, /no[_-]?reply@/i, /noreply@/i,
      /marketing@/i, /promo@/i, /offers@/i, /deals@/i, /weekly digest/i,
      /daily digest/i, /monthly update/i, /account notification/i,
      /your (weekly|monthly|daily) (summary|report|update)/i,
      /don't want these emails/i, /manage (your )?preferences/i,
    ]
    const SKIP_LABELS = new Set(['CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_SOCIAL', 'SPAM', 'TRASH'])

    const triageResults: Array<{ msg: { subject: string; from: string; snippet: string; id: string }; decision: 'process' | 'skip'; reason?: string }> = []

    for (const m of rawMessages.slice(0, 10)) {
      const subject = m.subject ?? ''
      const from = m.from ?? ''
      const snippet = m.snippet ?? ''
      const text = `${subject} ${from} ${snippet}`

      // ── Deployment Watchdog: detect deploy failure emails first ─────────────
      if (isDeployFailureEmail(m)) {
        triageResults.push({
          msg: m,
          decision: 'process',
          reason: 'Deploy failure detected — will run watchdog diagnosis',
        })
        continue
      }

      const isMarketing = SKIP_PATTERNS.some(p => p.test(text)) || m.labelIds?.some(l => SKIP_LABELS.has(l))
      const isEngagement = /\b(linkedin|add.*network|endorse|puzzle|quiz|follow.*up|connection.*request)\b/i.test(text)

      if (isMarketing || isEngagement) {
        triageResults.push({
          msg: m,
          decision: 'skip',
          reason: isMarketing
            ? `${from.split('@')[0] || from} is sending marketing fluff. Not worth Michael's attention.`
            : `${from.split('@')[0] || from} is trying engagement bait. Skip.`,
        })
      } else {
        triageResults.push({ msg: m, decision: 'process' })
      }
    }

    // Write worklog entries for skipped emails (personality-injected triage)
    for (const result of triageResults) {
      if (result.decision === 'skip' && result.msg.id) {
        const senderName = result.msg.from.split('@')[0] || result.msg.from
        await writeWorklog(userId, 'email_triage',
          `Just received an email from ${senderName}`,
          {
            reasoning: result.reason,
            status: 'skipped',
            decision_type: 'skip',
            metadata: { emailId: result.msg.id, subject: result.msg.subject, from: result.msg.from, tag: 'marketing' },
          }
        ).catch(() => {})
      }
    }

    messages = triageResults.filter(r => r.decision === 'process').map(r => r.msg).slice(0, 5)

    // ── Issue 5: Email deduplication — skip emails already in worklog (last 30 min) ──
    if (messages.length > 0) {
      try {
        const recentEmailWorklogs = await query<{ email_id: string }>(
          `SELECT metadata->>'email_id' as email_id FROM sparkie_worklog
           WHERE user_id = $1 AND type IN ('email_triage', 'decision', 'proactive_signal', 'task_executed')
           AND created_at > NOW() - INTERVAL '30 minutes'
           AND metadata ? 'email_id'`,
          [userId]
        ).catch(() => ({ rows: [] as { email_id: string }[] }))
        const recentEmailIds = new Set(recentEmailWorklogs.rows.map(r => r.email_id).filter(Boolean))
        const prevCount = messages.length
        messages = messages.filter(m => !recentEmailIds.has(m.id))
        if (messages.length < prevCount) {
          console.log(`[scheduler] proactiveInboxSweep: deduped ${prevCount - messages.length} already-processed emails`)
        }
      } catch (e) {
        console.error('[scheduler] email dedup error:', e)
      }
    }

    emailsJson = JSON.stringify(messages)
    // Write a proactive entry even when inbox is empty — the act of checking IS proactive
    if (messages.length === 0) {
      await writeWorklog(userId, 'proactive_signal', '📬 Inbox checked — no unread emails', {
        status: 'done', decision_type: 'proactive',
        reasoning: 'Proactive inbox sweep ran: inbox clear',
        signal_priority: 'P3',
        conclusion: 'Inbox sweep complete — no unread emails found',
      }).catch(() => {})
      return
    }
  } catch (e) { console.error('[scheduler] proactiveInboxSweep fetch error:', e); return }

  // Phase 4: Route each email to matching topic
  await Promise.all(messages.slice(0, 5).map(async (msg) => {
    if (msg.id && msg.subject) {
      try {
        await routeEmailToTopic(userId, msg.id, msg.subject, msg.from ?? '', msg.snippet ?? '')
      } catch (e) {
        console.error('[scheduler] routeEmailToTopic error:', e)
      }
    }
  }))

  // ── Deployment Watchdog: detect deploy failure emails ────────────────────────
  // messages = filtered inbox emails already computed above (line 385)
  const deployFailEmails = messages.filter(m => isDeployFailureEmail(m))

  if (deployFailEmails.length > 0) {
    // Run watchdog diagnosis — pull build logs and diagnose root cause
    const diagnosis = await diagnoseDeploymentFailure()
    if (diagnosis) {
      await writeWorklog(userId, 'error', `🐕 Deployment Watchdog: ${diagnosis.errorType}`, {
        status: 'anomaly',
        decision_type: 'escalate',
        reasoning: `Deploy failure detected from inbox. ${diagnosis.details} Fix: ${diagnosis.suggestedFix}`,
        signal_priority: 'P1',
        conclusion: `Watchdog diagnosis complete — ${diagnosis.errorType}: ${diagnosis.details.slice(0, 100)}`,
        build_log_excerpt: diagnosis.buildLog.slice(-500),
        suggested_fix: diagnosis.suggestedFix,
      }).catch(() => {})

      // Push immediate notification via SSE so Michael sees the alert right away
      await pushProactiveSignal({
        userId,
        topicId: 'deployment-watchdog',
        topicName: 'Deployment Watchdog',
        notificationPolicy: 'immediate',
        signalType: 'deploy_failure',
        content: `🐕 Deployment Watchdog: ${diagnosis.errorType} — ${diagnosis.details.slice(0, 80)}`,
        priority: 'P1',
      }).catch(() => {})

      console.log(`[watchdog] Deploy failure detected for user ${userId}: ${diagnosis.errorType} — ${diagnosis.suggestedFix.slice(0, 60)}`)
    }
  }

  // 2. Check if we already have a pending inbox task for this user (debounce)
  try {
    const existing = await query<{ id: string }>(
      `SELECT id FROM sparkie_tasks WHERE user_id = $1 AND label LIKE 'Inbox sweep%' AND status = 'pending' AND created_at > NOW() - INTERVAL '30 minutes'`,
      [userId]
    )
    if (existing.rows.length > 0) return // already queued

    // 3. Create autonomous task to draft responses to urgent emails
    const taskId = `proactive_inbox_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    await query(
      `INSERT INTO sparkie_tasks (id, user_id, action, label, payload, status, executor, trigger_type, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', 'ai', 'manual', NOW())`,
      [taskId, userId,
        `Review these unread emails and take appropriate action: ${emailsJson}. For each email, first share your inner monologue: "I'm looking at [subject] from [sender]. This feels [urgent/routine/informational] because [reason]. My plan: [action]." Then: (1) if urgent or requires response, draft a reply using GMAIL_CREATE_EMAIL_DRAFT and use update_worklog to log with signal_priority P1. (2) if informational/important, log a worklog summary with decision_type=proactive. (3) if low-priority or promotional, skip and log a brief note. Always log each email you process.`,
        'Inbox sweep — autonomous email review',
        JSON.stringify({ email_count: JSON.parse(emailsJson).length, source: 'proactive_scheduler' })
      ]
    )

    await writeWorklog(userId, 'proactive_signal', `📬 Found ${JSON.parse(emailsJson).length} unread emails — queued autonomous review`, {
      status: 'running',
      decision_type: 'proactive',
      reasoning: 'Proactive inbox sweep found unread messages; autonomous draft task created',
      signal_priority: 'P2',
      conclusion: `Found ${JSON.parse(emailsJson).length} unread email(s) — autonomous review task queued`,
    })
  } catch (e) { console.error('[scheduler] proactiveInboxSweep task error:', e) }
}

async function proactiveCalendarSweep(userId: string): Promise<void> {
  if (!COMPOSIO_KEY) return
  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  try {
    const entityId = `sparkie_user_${userId}`
    const calRes = await fetch(`${COMPOSIO_BASE}/tools/execute/GOOGLECALENDAR_LIST_EVENTS`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': COMPOSIO_KEY },
      body: JSON.stringify({
        entity_id: entityId,
        arguments: { timeMin: now.toISOString(), timeMax: in24h.toISOString(), maxResults: 5 },
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!calRes.ok) return
    const calData = await calRes.json() as { data?: { items?: Array<{ summary: string; start?: { dateTime?: string }; attendees?: unknown[] }> } }
    const events = calData?.data?.items ?? []
    // Write a proactive entry even when calendar is clear — the act of checking IS proactive
    if (events.length === 0) {
      await writeWorklog(userId, 'proactive_signal', '📅 Calendar checked — clear for next 24h', {
        status: 'done', decision_type: 'proactive',
        reasoning: 'Proactive calendar sweep ran: no upcoming events',
        signal_priority: 'P3',
        conclusion: 'Calendar sweep complete — schedule is clear for the next 24 hours',
      }).catch(() => {})
      return
    }

    // Surface calendar events to worklog (no task creation needed — just awareness)
    const eventSummary = events.slice(0, 3).map(e => `${e.summary} at ${e.start?.dateTime ?? 'TBD'}`).join('; ')
    await writeWorklog(userId, 'proactive_signal', `📅 ${events.length} upcoming event${events.length > 1 ? 's' : ''} in next 24h: ${eventSummary}`, {
      status: 'done',
      decision_type: 'proactive',
      reasoning: 'Proactive calendar sweep surfaced upcoming events',
      signal_priority: 'P3',
      conclusion: `Calendar sweep surfaced ${events.length} upcoming event${events.length > 1 ? 's' : ''} in the next 24 hours`,
    })
  } catch (e) { console.error('[scheduler] proactiveCalendarSweep error:', e) }
}


// ── Deployment health sweep ───────────────────────────────────────────────────
// Runs every ~10 ticks (~10 min). Detects failed DO builds and auto-retries transient failures.
const DO_TOKEN = process.env.DO_API_TOKEN ?? ''
const DO_APP_ID_DEPLOY = 'fb3d58ac-f1b5-4e65-89b5-c12834d8119a'

interface DODeployment {
  id: string
  phase: string
  cause: string
  progress?: { steps?: Array<{ name: string; status: string; reason?: string }> }
}

async function deploymentHealthSweep(userId: string): Promise<void> {
  if (!DO_TOKEN) return
  try {
    const res = await fetch(
      `https://api.digitalocean.com/v2/apps/${DO_APP_ID_DEPLOY}/deployments?page=1&per_page=3`,
      {
        headers: { Authorization: `Bearer ${DO_TOKEN}` },
        signal: AbortSignal.timeout(15000),
      }
    )
    if (!res.ok) return
    const data = await res.json() as { deployments?: DODeployment[] }
    const deployments = data.deployments ?? []
    if (deployments.length === 0) return

    const latest = deployments[0]

    if (latest.phase === 'ERROR' || latest.phase === 'FAILED') {
      // Avoid duplicate handling
      const existing = await query<{ id: string }>(
        `SELECT id FROM sparkie_worklog WHERE user_id = $1 AND type = 'error'
         AND metadata::text LIKE $2 LIMIT 1`,
        [userId, `%${latest.id}%`]
      ).catch(() => ({ rows: [] as { id: string }[] }))
      if (existing.rows.length > 0) return

      const failReason = latest.progress?.steps?.find(s => s.status === 'ERROR')?.reason ?? 'Unknown error'
      await writeWorklog(userId, 'error', `🚨 Deployment failed: ${failReason}`, {
        status: 'anomaly',
        decision_type: 'escalate',
        deployment_id: latest.id,
        reasoning: `DO deployment phase=${latest.phase} cause=${latest.cause}`,
        signal_priority: 'P1',
        conclusion: `Deployment ${latest.id.slice(0, 8)} failed — reason: ${failReason.slice(0, 80)}`,
      })

      // Auto-retry only if previous deployment was healthy (transient failure heuristic)
      const prevPhase = deployments[1]?.phase
      if (prevPhase && prevPhase !== 'ERROR' && prevPhase !== 'FAILED') {
        await fetch(
          `https://api.digitalocean.com/v2/apps/${DO_APP_ID_DEPLOY}/deployments`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${DO_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ force_build: true }),
            signal: AbortSignal.timeout(15000),
          }
        )
        await writeWorklog(userId, 'task_executed', `🔁 Auto-retried deployment after transient build failure`, {
          status: 'done',
          decision_type: 'action',
          deployment_id: latest.id,
          reasoning: 'Previous deployment healthy — auto-redeploy triggered for transient failure',
          signal_priority: 'P1',
          conclusion: 'Auto-retry deployment triggered after detecting a transient build failure',
        })
      }
    } else if (latest.phase === 'ACTIVE') {
      const prevPhase = deployments[1]?.phase
      if (prevPhase === 'ERROR' || prevPhase === 'FAILED') {
        const existing = await query<{ id: string }>(
          `SELECT id FROM sparkie_worklog WHERE user_id = $1 AND type = 'task_executed'
           AND metadata::text LIKE $2 AND content LIKE '%recovered%' LIMIT 1`,
          [userId, `%${latest.id}%`]
        ).catch(() => ({ rows: [] as { id: string }[] }))
        if (existing.rows.length === 0) {
          await writeWorklog(userId, 'task_executed', `✅ Deployment recovered — now ACTIVE`, {
            status: 'done',
            decision_type: 'proactive',
            deployment_id: latest.id,
            reasoning: 'Deployment phase transitioned from ERROR/FAILED to ACTIVE',
            signal_priority: 'P2',
            conclusion: `Deployment ${latest.id.slice(0, 8)} recovered and is now ACTIVE after a previous failure`,
          })
        }
      }
    }
  } catch (e) { console.error('[scheduler] deploymentHealthSweep error:', e) }
}



const INTERNAL_SECRET = process.env.SPARKIE_INTERNAL_SECRET ?? ''
const SCHEDULER_INTERVAL_MS = 60_000 // 1 minute

// ── Cron expression parser ────────────────────────────────────────────────────
function nextCronTime(expression: string, after: Date = new Date()): Date {
  const parts = expression.trim().split(/\s+/)
  if (parts.length < 5) return new Date(after.getTime() + 24 * 60 * 60 * 1000)
  const [minExpr, hourExpr, domExpr, monthExpr, dowExpr] = parts

  function matchField(expr: string, value: number, min: number, max: number): boolean {
    if (expr === '*') return true
    for (const segment of expr.split(',')) {
      if (segment.includes('/')) {
        const [rangeStr, stepStr] = segment.split('/')
        const step = parseInt(stepStr)
        const rangeStart = rangeStr === '*' ? min : parseInt(rangeStr.split('-')[0])
        const rangeEnd   = rangeStr === '*' ? max : (rangeStr.includes('-') ? parseInt(rangeStr.split('-')[1]) : max)
        for (let v = rangeStart; v <= rangeEnd; v += step) {
          if (v === value) return true
        }
      } else if (segment.includes('-')) {
        const [lo, hi] = segment.split('-').map(Number)
        if (value >= lo && value <= hi) return true
      } else {
        if (parseInt(segment) === value) return true
      }
    }
    return false
  }

  const candidate = new Date(after.getTime() + 60_000)
  candidate.setSeconds(0, 0)
  const limit = new Date(after.getTime() + 365 * 24 * 60 * 60 * 1000)

  while (candidate < limit) {
    if (
      matchField(monthExpr, candidate.getMonth() + 1, 1, 12) &&
      matchField(domExpr,   candidate.getDate(),        1, 31) &&
      matchField(dowExpr,   candidate.getDay(),          0, 6)  &&
      matchField(hourExpr,  candidate.getHours(),        0, 23) &&
      matchField(minExpr,   candidate.getMinutes(),      0, 59)
    ) {
      return new Date(candidate)
    }
    candidate.setTime(candidate.getTime() + 60_000)
  }
  return new Date(after.getTime() + 24 * 60 * 60 * 1000)
}

// ── Advisory lock: only one server instance runs each heartbeat tick ──────────
async function withHeartbeatLock(fn: () => Promise<void>): Promise<void> {
  const LOCK_KEY = 7_463_289_412
  try {
    const lockRes = await query<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock($1) AS locked`, [LOCK_KEY]
    )
    if (!lockRes.rows[0]?.locked) return
    try {
      await fn()
    } finally {
      await query(`SELECT pg_advisory_unlock($1)`, [LOCK_KEY])
    }
  } catch (e) {
    console.error('[scheduler] lock error:', e)
  }
}

// ── Loop detection: prevent infinite retry loops ──────────────────────────────
interface LoopTracker {
  tool: string
  argsHash: string
  count: number
  lastSeen: number
}
const loopTracker = new Map<string, LoopTracker>()

function detectLoop(taskId: string, tool: string, args: string): boolean {
  const key = `${taskId}:${tool}`
  const existing = loopTracker.get(key)
  const now = Date.now()

  if (existing && existing.argsHash === args && now - existing.lastSeen < 120_000) {
    existing.count++
    existing.lastSeen = now
    if (existing.count >= 3) {
      console.warn(`[scheduler] Loop detected: ${tool} called ${existing.count}x for task ${taskId}`)
      return true
    }
  } else {
    loopTracker.set(key, { tool, argsHash: args, count: 1, lastSeen: now })
  }
  return false
}

function clearLoopTracker(taskId: string): void {
  for (const key of loopTracker.keys()) {
    if (key.startsWith(taskId + ':')) loopTracker.delete(key)
  }
}

// ── Execute due AI tasks for a single user ────────────────────────────────────
async function executeUserTasks(
  userId: string,
  baseUrl: string
): Promise<Array<{ id: string; label: string; result: string }>> {
  const dueTasks = await query<{
    id: string; label: string; action: string; trigger_type: string; trigger_config: Record<string, unknown>; depends_on: string | null
  }>(
    `SELECT id, label, action, trigger_type, trigger_config, depends_on FROM sparkie_tasks
     WHERE user_id = $1 AND executor = 'ai' AND status = 'pending'
     AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()
     ORDER BY scheduled_at ASC LIMIT 5`,
    [userId]
  )

  if (dueTasks.rows.length === 0) return []

  const executed: Array<{ id: string; label: string; result: string }> = []

  // Execute tasks in parallel batches of 3 for speed
  const runTask = async (task: typeof dueTasks.rows[0]) => {
    // Loop detection: check if this task has been retried too many times recently
    if (detectLoop(task.id, 'task_execution', task.label.slice(0, 50))) {
      await writeWorklog(userId, 'error', `⏸ Task paused: "${task.label}" — loop detected (3+ retries in 2 min). Holding for review.`, {
        taskLabel: task.label,
        taskId: task.id,
        status: 'blocked',
        decision_type: 'hold',
        reasoning: 'Same task attempted 3+ times in quick succession — pausing to prevent infinite loop',
        conclusion: `Task "${task.label.slice(0, 60)}" blocked — infinite loop detected after 3+ retries`,
      })
      await query(`UPDATE sparkie_tasks SET status = 'failed' WHERE id = $1`, [task.id])
      return undefined
    }

    // depends_on enforcement: skip if dependency is not yet resolved
    if (task.depends_on) {
      const depRes = await query<{ status: string }>(
        `SELECT status FROM sparkie_tasks WHERE id = $1 AND user_id = $2`,
        [task.depends_on, userId]
      )
      const depTask = depRes.rows[0]
      const terminalStatuses = ['completed', 'failed', 'skipped', 'cancelled']
      if (!depTask || !terminalStatuses.includes(depTask.status)) {
        // Dependency not met — re-queue for 60s later
        await query(
          `UPDATE sparkie_tasks SET scheduled_at = NOW() + INTERVAL '60 seconds' WHERE id = $1`,
          [task.id]
        )
        return undefined
      }
    }

    try {
      await query(`UPDATE sparkie_tasks SET status = 'in_progress' WHERE id = $1`, [task.id])

      let result = 'Task executed (chat API unavailable)'

      if (INTERNAL_SECRET) {
        const taskPrompt = [
          '[AUTONOMOUS TASK EXECUTION — PROACTIVE HEARTBEAT]',
          `Task: ${task.label}`,
          `Runbook: ${task.action}`,
          '',
          'Execute this task now. Be thorough and specific. Report exactly what was done.',
        ].join('\n')

        try {
          const chatRes = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-user-id': userId,
              'x-internal-secret': INTERNAL_SECRET,
            },
            body: JSON.stringify({
              messages: [{ role: 'user', content: taskPrompt }],
              // model field omitted — chat/route.ts uses server-side selectModel() and ignores client model param
            }),
            signal: AbortSignal.timeout(45_000),
          })

          if (chatRes.ok) {
            const text = await chatRes.text()
            const lines = text.split('\n').filter(
              (l: string) => l.startsWith('data: ') && l !== 'data: [DONE]'
            )
            const chunks = lines.map((l: string) => {
              try { return JSON.parse(l.slice(6)).choices?.[0]?.delta?.content ?? '' }
              catch { return '' }
            })
            result = chunks.join('').trim().slice(0, 800) || 'Task completed'
          }
        } catch (e) {
          console.error(`[scheduler] chat call failed for task ${task.id}:`, e)
          result = 'Task execution error — chat call failed'
        }
      }

      // Re-queue cron tasks; reset event tasks to pending (fire on next event); complete one-shot tasks
      if (task.trigger_type === 'cron') {
        const expr = (task.trigger_config as { expression?: string }).expression ?? '0 9 * * 1'
        const nextTime = nextCronTime(expr)
        await query(
          `UPDATE sparkie_tasks SET status = 'pending', scheduled_at = $2 WHERE id = $1`,
          [task.id, nextTime.toISOString()]
        )
      } else if (task.trigger_type === 'event') {
        // Event tasks stay pending — they are re-triggered by external event listeners
        // Do NOT mark completed; reset to pending for next event trigger
        await query(
          `UPDATE sparkie_tasks SET status = 'pending', scheduled_at = NULL WHERE id = $1`,
          [task.id]
        )
      } else {
        // manual, immediate, delay — one-shot, mark completed after execution
        await query(
          `UPDATE sparkie_tasks SET status = 'completed', resolved_at = NOW() WHERE id = $1`,
          [task.id]
        )
      }

      clearLoopTracker(task.id)

      // Classify signal priority for worklog
      const priority = classifyHeartbeatSignal('task_complete', { label: task.label })

      await writeWorklog(userId, 'task_executed', result, {
        taskLabel: task.label,
        taskId: task.id,
        trigger: task.trigger_type,
        status: 'done',
        decision_type: 'action',
        signal_priority: priority,
        conclusion: `Task "${task.label.slice(0, 60)}" executed successfully via ${task.trigger_type} trigger`,
      })

      return { id: task.id, label: task.label, result }
    } catch (e) {
      await query(`UPDATE sparkie_tasks SET status = 'failed' WHERE id = $1`, [task.id])
      await writeWorklog(userId, 'error', `Task failed: ${task.label}`, {
        taskLabel: task.label, taskId: task.id,
        status: 'anomaly',
        decision_type: 'escalate',
        reasoning: e instanceof Error ? e.message : String(e),
        conclusion: `Task "${task.label.slice(0, 60)}" failed with error — marked as failed and requires attention`,
      })
      console.error(`[scheduler] Task ${task.id} failed:`, e)
    }
  }

  // Batch execution — 3 tasks at a time
  for (let i = 0; i < dueTasks.rows.length; i += 3) {
    const batch = dueTasks.rows.slice(i, i + 3)
    const results = await Promise.allSettled(batch.map(t => runTask(t)))
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) executed.push(r.value)
    }
  }

  return executed
}

// ── Heartbeat tick ────────────────────────────────────────────────────────────
async function heartbeatTick(baseUrl: string): Promise<void> {
  await withHeartbeatLock(async () => {
    try {
      // ── Stale in_progress recovery: tasks stuck > 5 min → reset to pending ──────
      await query(
        `UPDATE sparkie_tasks SET status = 'pending'
         WHERE status = 'in_progress'
           AND created_at < NOW() - INTERVAL '5 minutes'`
      ).catch(() => {})

      const dueUsers = await query<{ user_id: string }>(

        `SELECT DISTINCT user_id FROM sparkie_tasks
         WHERE executor = 'ai' AND status = 'pending'
         AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()`
      )

      // Auth health sweep — once every 10 ticks (10 minutes) per user
      const authCheckUsers = await query<{ user_id: string }>(
        `SELECT DISTINCT user_id FROM sparkie_tasks WHERE executor = 'ai' LIMIT 20`
      )
      const shouldRunAuthCheck = Math.floor(Date.now() / 1000) % 600 < 60 // true once per ~10 min
      if (shouldRunAuthCheck && authCheckUsers.rows.length > 0) {
        for (const { user_id } of authCheckUsers.rows.slice(0, 3)) {
          runAuthHealthSweep(user_id).catch(() => {})
        }
      }

      // Prune expired tool cache entries
      pruneToolCache()
      // Deployment health sweep — once every ~10 ticks (10 min)
      if (shouldRunAuthCheck) {
        const sweepUser = dueUsers.rows[0]?.user_id ?? authCheckUsers.rows[0]?.user_id
        if (sweepUser) deploymentHealthSweep(sweepUser).catch(() => {})
      }


      // ── Proactive inbox + calendar sweeps ──────────────────────────────────
      // Run once every 5 ticks (~5 min) for all active users to avoid hammering APIs
      const activeUsers = await query<{ user_id: string }>(
        `SELECT DISTINCT user_id FROM user_sessions WHERE last_seen_at > NOW() - INTERVAL '7 days'`
      ).catch(() => ({ rows: [] as { user_id: string }[] }))

      const shouldRunProactive = Math.floor(Date.now() / 1000) % 300 < 60
      if (shouldRunProactive) {
        // Run for active users independently of whether they have pending tasks
        // (proactive = acting WITHOUT being asked — never gate on task queue)
        const sweepTargets = activeUsers.rows.length > 0
          ? activeUsers.rows.slice(0, 2)
          : dueUsers.rows.slice(0, 2)
        for (const { user_id } of sweepTargets) {
          proactiveInboxSweep(user_id).catch(() => {})
          proactiveCalendarSweep(user_id).catch(() => {})
        }
      }

      // ── Surface ready deferred intents ─────────────────────────────────────
      // Check all active users for deferred intents that are now ready

      for (const { user_id } of activeUsers.rows.slice(0, 10)) {
        const readyIntents = await loadReadyDeferredIntents(user_id)
        for (const intent of readyIntents) {
          const intentPriority = intent.dueAt && intent.dueAt < new Date() ? 'P1' : 'P2'
          await notificationPolicyEngine({
            userId: user_id,
            topicId: 'deferred',
            topicName: 'Deferred Intent',
            notificationPolicy: 'auto',
            signalType: 'deferred_intent_surfaced',
            content: intent.intent,
            priority: intentPriority,
            metadata: {
              source_msg: intent.sourceMsg.slice(0, 200),
              created_at: intent.createdAt.toISOString(),
              due_at: intent.dueAt?.toISOString() ?? null,
            },
          })
          await markDeferredIntentSurfaced(intent.id)
        }
      }

      // ── TTL decay sweep — flag stale self-memory entries ────────────────────
      const staleFlagged = await runTTLDecaySweep().catch(() => 0)
      if (staleFlagged > 0) {
        console.log(`[scheduler] TTL sweep: ${staleFlagged} stale memories flagged`)
      }

      // ── Morning brief sweep (daily 12:00-13:00 UTC = 7-8am EST) ─────────────
      // Triggers proactive morning_brief via /api/agent for all active users
      const now = new Date()
      const isMorningBriefWindow = now.getUTCHours() === 12 && Math.floor(Date.now() / 1000) % 300 < 60
      if (isMorningBriefWindow) {
        for (const { user_id } of activeUsers.rows.slice(0, 3)) {
          writeWorklog(user_id, 'proactive_signal', '☀️ Morning brief fired — preparing your daily summary', {
            decision_type: 'proactive', signal_priority: 'P1',
            reasoning: 'Daily 12:00 UTC morning brief window',
            conclusion: 'Morning brief dispatched to agent for delivery',
          }).catch(() => {})
          // Fire proactive outreach check via agent route to trigger morning_brief
          fetch(`${baseUrl}/api/agent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
            body: JSON.stringify({ currentHour: 8, userId: user_id, force_morning_brief: true }),
          }).catch(() => {})
        }
      }

      // ── Communications health sweep (daily 06:00 UTC) ──────────────────────
      const isCommHealthWindow = now.getUTCHours() === 6 && Math.floor(Date.now() / 1000) % 300 < 60
      if (isCommHealthWindow) {
        for (const { user_id } of activeUsers.rows.slice(0, 3)) {
          runAuthHealthSweep(user_id).catch(() => {})
          writeWorklog(user_id, 'auth_check', 'Communications health sweep ran', { decision_type: 'proactive', reasoning: 'Daily 06:00 UTC sweep', signal_priority: 'P3', conclusion: 'Daily 06:00 UTC communications health sweep completed' }).catch(() => {})
        }
      }

      // ── Weekly self-assessment (Sunday 23:00 UTC) ─────────────────────────────
      const isSundayNight = now.getUTCDay() === 0 && now.getUTCHours() === 23
      if (isSundayNight) {
        for (const { user_id } of activeUsers.rows.slice(0, 5)) {
          fetch(`${baseUrl}/api/self-assessment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
            body: JSON.stringify({ userId: user_id }),
          }).catch(() => {})
        }
      }

      // ── Behavioral model compute (weekly, Saturday 02:00 UTC) ─────────────────
      const isSaturdayEarly = now.getUTCDay() === 6 && now.getUTCHours() === 2
      if (isSaturdayEarly) {
        for (const { user_id } of activeUsers.rows.slice(0, 10)) {
          computeUserModel(user_id).catch(() => {})
        }
      }

      if (dueUsers.rows.length === 0) return

      console.log(`[scheduler] Tick: ${dueUsers.rows.length} user(s) with due tasks`)

      for (const { user_id } of dueUsers.rows) {
        const results = await executeUserTasks(user_id, baseUrl)
        if (results.length > 0) {
          console.log(`[scheduler] Executed ${results.length} task(s) for user ${user_id}`)
        }
      }
    } catch (e) {
      console.error('[scheduler] tick error:', e)
    }
  })
}

// ── Exports for external cron handler ─────────────────────────────────────────
// The GET /api/agent cron endpoint calls these directly so it can run all sweeps
// for every active user without needing the in-process scheduler to be running.
export { proactiveInboxSweep, proactiveCalendarSweep, deploymentHealthSweep }

// ── Bootstrap ─────────────────────────────────────────────────────────────────
let _started = false

export function startScheduler(baseUrl: string): void {
  if (_started) return
  _started = true

  console.log(`[scheduler] Heartbeat scheduler started — ${SCHEDULER_INTERVAL_MS / 1000}s interval, base: ${baseUrl}`)

  // ── Startup auth self-check ────────────────────────────────────────────────
  // Verifies all critical env vars and internal auth are wired correctly.
  // Results logged to server console; failures are non-fatal (scheduler continues).
  setTimeout(async () => {
    const checks: Array<{ name: string; ok: boolean; note?: string }> = []

    // 1. SPARKIE_INTERNAL_SECRET set?
    const hasSecret = !!process.env.SPARKIE_INTERNAL_SECRET
    checks.push({ name: 'SPARKIE_INTERNAL_SECRET', ok: hasSecret, note: hasSecret ? 'set' : 'MISSING — internal auth broken' })

    // 2. MINIMAX_API_KEY set?
    checks.push({ name: 'MINIMAX_API_KEY', ok: !!process.env.MINIMAX_API_KEY, note: process.env.MINIMAX_API_KEY ? 'set' : 'MISSING — build/chat broken' })

    // 3. COMPOSIO_API_KEY set?
    checks.push({ name: 'COMPOSIO_API_KEY', ok: !!COMPOSIO_KEY, note: COMPOSIO_KEY ? 'set' : 'MISSING — Gmail/Calendar broken' })

    // 4. SUPERMEMORY_API_KEY set?
    checks.push({ name: 'SUPERMEMORY_API_KEY', ok: !!process.env.SUPERMEMORY_API_KEY, note: process.env.SUPERMEMORY_API_KEY ? 'set' : 'MISSING — memory disabled' })

    // 5. Test internal worklog POST (proves x-internal-secret auth works end-to-end)
    if (hasSecret) {
      try {
        const wlRes = await fetch(`${baseUrl}/api/worklog`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.SPARKIE_INTERNAL_SECRET! },
          body: JSON.stringify({ type: 'action', content: 'Startup auth self-check passed ✓', user_id: 'system', metadata: { source: 'scheduler_startup' } }),
        })
        checks.push({ name: 'internal /api/worklog POST', ok: wlRes.ok, note: `HTTP ${wlRes.status}` })
      } catch (e) {
        checks.push({ name: 'internal /api/worklog POST', ok: false, note: String(e) })
      }
    }

    // 6. Test internal /api/admin/deploy GET (proves requireRole bypass works)
    if (hasSecret) {
      try {
        const depRes = await fetch(`${baseUrl}/api/admin/deploy`, {
          headers: { 'x-internal-secret': process.env.SPARKIE_INTERNAL_SECRET! },
        })
        checks.push({ name: 'internal /api/admin/deploy GET', ok: depRes.ok, note: `HTTP ${depRes.status}` })
      } catch (e) {
        checks.push({ name: 'internal /api/admin/deploy GET', ok: false, note: String(e) })
      }
    }

    const passed = checks.filter(c => c.ok).length
    const failed = checks.filter(c => !c.ok)
    console.log(`[scheduler:auth-check] ${passed}/${checks.length} checks passed`)
    for (const c of checks) {
      console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}: ${c.note ?? ''}`)
    }
    if (failed.length > 0) {
      console.warn('[scheduler:auth-check] FAILURES:', failed.map(c => c.name).join(', '))
    }
  }, 8_000)

  // Auto-migrate: ensure all memory seeds are loaded on cold boot
  // Runs once 3s after boot — idempotent (DELETE WHERE source='seedX' + INSERT ON CONFLICT DO NOTHING)
  setTimeout(async () => {
    try {
      const secret = process.env.MIGRATE_SECRET
      if (secret) {
        const res = await fetch(`${baseUrl}/api/admin/migrate?secret=${secret}`)
        if (res.ok) console.log('[scheduler] Auto-migrate: memory seeds loaded')
        else console.warn('[scheduler] Auto-migrate: non-ok response', res.status)
      }
    } catch (e) {
      console.warn('[scheduler] Auto-migrate failed (non-fatal):', e)
    }
  }, 3_000)

  // Skill bootstrap: ensure all built-in skills are seeded in the DB.
  // Idempotent (ON CONFLICT DO UPDATE). Runs 6s after boot.
  setTimeout(async () => {
    try {
      const secret = process.env.MIGRATE_SECRET
      if (!secret) { console.warn('[scheduler:skills] MIGRATE_SECRET not set — skipping skill bootstrap'); return }
      const res = await fetch(`${baseUrl}/api/skills/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret }),
      })
      if (res.ok) {
        const data = await res.json() as { results?: Array<{ name: string; status: string }> }
        const seeded = (data.results ?? []).filter(r => r.status === 'seeded').length
        console.log(`[scheduler:skills] Bootstrap complete — ${seeded} skill(s) seeded/updated`)
        await writeWorklog('system', 'action', `Skill bootstrap: ${seeded} skill(s) seeded/updated`, { source: 'scheduler_startup', conclusion: `Startup skill bootstrap complete — ${seeded} skill(s) seeded or updated in the database` }).catch(() => {})
      } else {
        console.warn('[scheduler:skills] Skill seed failed:', res.status)
      }
    } catch (e) {
      console.warn('[scheduler:skills] Skill bootstrap error (non-fatal):', e)
    }
  }, 6_000)

  // Fire once 5s after boot (catches tasks due during downtime)
  setTimeout(() => heartbeatTick(baseUrl), 5_000)

  // Then every 60s
  setInterval(() => heartbeatTick(baseUrl), SCHEDULER_INTERVAL_MS)

  // ── L1: Ambient Perception Loop — every 2 minutes ────────────────────────────
  // Lightweight signal monitor that runs independently of the task scheduler.
  // Perceives anomalies, expiring TTLs, P0 signals, and deploy changes — even
  // when no cron tick fires. Writes worklog only when something noteworthy is found.
  setInterval(async () => {
    try {
      await ambientPerceptionTick()
    } catch (e) {
      console.error('[perception] tick error:', e)
    }
  }, 2 * 60 * 1000) // every 2 minutes

  // ── L7: Daily self-reflection — runs during low-activity window (1-5am UTC) ──
  // Triggers once per day when the clock enters the 1am UTC hour.
  setInterval(async () => {
    const now = new Date()
    const isReflectionWindow = now.getUTCHours() === 1 && now.getUTCMinutes() < 3
    if (!isReflectionWindow) return
    try {
      const activeUsers = await query<{ user_id: string }>(
        `SELECT DISTINCT user_id FROM sparkie_tasks WHERE executor = 'ai' LIMIT 5`
      ).catch(() => ({ rows: [] as { user_id: string }[] }))
      for (const { user_id } of activeUsers.rows) {
        runSelfReflection(user_id).catch(() => {})
      }
    } catch (e) {
      console.error('[reflection] daily trigger error:', e)
    }
  }, 60 * 1000)

  // ── Seed starter goals + confidence decay — runs once at boot ────────────────
  setTimeout(async () => {
    try {
      await seedStarterGoals()
      await runConfidenceDecay()
      await escalateStaleGoals()
      console.log('[scheduler] CIP Engine bootstrap: goals seeded, confidence decay run')
    } catch (e) {
      console.warn('[scheduler] CIP bootstrap error (non-fatal):', e)
    }
  }, 15_000)
}

// ── L1: Ambient Perception — what Sparkie notices between cron ticks ──────────
let _perceptionTickCount = 0
const _perceptionPatterns: Record<string, number> = {}
// Track last known deploy phase per user to detect ACTIVE→BUILDING/FAILED transitions
const _lastDeployPhase: Record<string, string> = {}

async function ambientPerceptionTick(): Promise<void> {
  _perceptionTickCount++

  // Get all recently active users — not just those with AI tasks
  // AI-task-only filtering missed conversational users like Michael who don't schedule AI tasks
  const activeUsers = await query<{ user_id: string }>(
    `SELECT DISTINCT user_id FROM user_sessions WHERE last_seen > NOW() - INTERVAL '7 days' ORDER BY last_seen DESC LIMIT 10`
  ).catch(() => ({ rows: [] as { user_id: string }[] }))

  for (const { user_id } of activeUsers.rows) {
    const findings: string[] = []
    const opinions: Array<{ signal: string; opinion: string; action_recommended: string }> = []

    // 1. Check for error rate spike in last 30 min
    const errorCheck = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM sparkie_worklog
       WHERE user_id = $1 AND type = 'error' AND created_at > NOW() - INTERVAL '30 minutes'`,
      [user_id]
    ).catch(() => ({ rows: [{ count: '0' }] }))
    const errorCount = parseInt(errorCheck.rows[0]?.count ?? '0')
    if (errorCount >= 3) {
      const signal = `Error spike: ${errorCount} errors in last 30 minutes`
      findings.push(signal)
      _perceptionPatterns[`error_spike_${user_id}`] = (_perceptionPatterns[`error_spike_${user_id}`] ?? 0) + 1
      opinions.push({
        signal,
        opinion: errorCount >= 5
          ? 'This is a P0 situation — something systemic is breaking repeatedly'
          : 'Elevated error rate suggests a recurring issue, not a one-off. Worth investigating causes.',
        action_recommended: 'Query causal graph for these error types and consider creating a P1 goal to address root cause',
      })
    }

    // 2. Check for expiring TTL memories in next hour
    const ttlCheck = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM sparkie_self_memory
       WHERE source = $1 AND expires_at IS NOT NULL AND expires_at < NOW() + INTERVAL '1 hour' AND stale_flagged = false`,
      [user_id]
    ).catch(() => ({ rows: [{ count: '0' }] }))
    const expiringCount = parseInt(ttlCheck.rows[0]?.count ?? '0')
    if (expiringCount > 0) {
      const signal = `${expiringCount} memory TTL entry(s) expiring within 1 hour`
      findings.push(signal)
      opinions.push({
        signal,
        opinion: 'These memories were intentionally time-limited — their expiry is expected. Verify the content is no longer relevant before letting them expire.',
        action_recommended: 'Review expiring memories and either renew important ones or let them expire naturally',
      })
    }

    // 3. Deploy status transition monitoring — detect ACTIVE→BUILDING/FAILED
    if (DO_TOKEN) {
      try {
        const depRes = await fetch(
          `https://api.digitalocean.com/v2/apps/${DO_APP_ID_DEPLOY}/deployments?page=1&per_page=1`,
          { headers: { Authorization: `Bearer ${DO_TOKEN}` }, signal: AbortSignal.timeout(5000) }
        )
        if (depRes.ok) {
          const depData = await depRes.json() as { deployments?: Array<{ phase: string }> }
          const currentPhase = depData.deployments?.[0]?.phase ?? ''
          const lastPhase = _lastDeployPhase[user_id]
          if (lastPhase && lastPhase !== currentPhase) {
            // Phase changed — noteworthy transition
            if (currentPhase === 'BUILDING' || currentPhase === 'DEPLOYING') {
              const signal = `Deploy phase transition: ${lastPhase} → ${currentPhase}`
              findings.push(signal)
              opinions.push({
                signal,
                opinion: 'A new deployment is underway. This is expected after a code push. Monitor for completion.',
                action_recommended: 'Watch for ACTIVE or ERROR/FAILED outcome — auto-retry on failure is already handled by deploymentHealthSweep',
              })
            } else if ((currentPhase === 'ERROR' || currentPhase === 'FAILED') && lastPhase === 'BUILDING') {
              const signal = `Deploy FAILED: ${lastPhase} → ${currentPhase}`
              findings.push(signal)
              opinions.push({
                signal,
                opinion: 'The build just failed. This is urgent — the new version is not live.',
                action_recommended: 'Immediately check build logs via trigger_deploy(action=logs), diagnose root cause, push a fix',
              })
            }
          }
          if (currentPhase) _lastDeployPhase[user_id] = currentPhase
        }
      } catch { /* non-fatal */ }
    }

    // 4. Calendar events starting within 45 minutes (spec requirement)
    if (COMPOSIO_KEY) {
      try {
        const now = new Date()
        const in45min = new Date(now.getTime() + 45 * 60 * 1000)
        const entityId = `sparkie_user_${user_id}`
        const calRes = await fetch(`${COMPOSIO_BASE}/tools/execute/GOOGLECALENDAR_LIST_EVENTS`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': COMPOSIO_KEY },
          body: JSON.stringify({
            entity_id: entityId,
            arguments: { timeMin: now.toISOString(), timeMax: in45min.toISOString(), maxResults: 3 },
          }),
          signal: AbortSignal.timeout(15000),
        })
        if (calRes.ok) {
          const calData = await calRes.json() as { data?: { items?: Array<{ summary: string; start?: { dateTime?: string } }> } }
          const upcoming = calData?.data?.items ?? []
          for (const evt of upcoming) {
            const startStr = evt.start?.dateTime ? new Date(evt.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'soon'
            const signal = `Calendar: "${evt.summary}" starts at ${startStr} (within 45 min)`
            findings.push(signal)
            opinions.push({
              signal,
              opinion: 'An event is imminent. If Michael is in a deep work flow, this is a natural transition point.',
              action_recommended: 'Surface this awareness in the next conversational response — mention the upcoming event naturally',
            })
          }
        }
      } catch { /* calendar check is best-effort */ }
    }

    // 5. Goals drive autonomous work — stale P0/P1 goals auto-generate tasks
    const staleGoals = await query<{ id: string; title: string; description: string }>(
      `SELECT id, title, description FROM sparkie_goals
       WHERE user_id = $1 AND status = 'active' AND priority IN ('P0', 'P1')
       AND sessions_without_progress >= 2 LIMIT 3`,
      [user_id]
    ).catch(() => ({ rows: [] as { id: string; title: string; description: string }[] }))
    for (const goal of staleGoals.rows) {
      const taskId = `goal_${goal.id}_${Date.now()}`
      await query(
        `INSERT INTO sparkie_tasks (id, user_id, label, executor, action, payload, status, trigger_type, scheduled_at)
         VALUES ($1, $2, $3, 'ai', 'work_toward_goal', $4, 'pending', 'goal', NOW())`,
        [taskId, user_id, `Work toward: ${goal.title}`, JSON.stringify({ goal_id: goal.id, description: goal.description })]
      ).catch(() => {})
      await writeWorklog(user_id, 'proactive_signal',
        `🎯 Stale goal auto-generated task: "${goal.title}" (${goal.description?.slice(0, 80)})`,
        { status: 'done', decision_type: 'proactive', conclusion: `Created autonomous task for stale ${goal.title}` }
      ).catch(() => {})
    }

    // 6. Write perception_tick worklog if findings were detected
    if (findings.length > 0) {
      await writeWorklog(user_id, 'proactive_signal',
        `⚡ Ambient perception: ${findings.join(' | ')}`,
        {
          status: 'done',
          decision_type: 'proactive',
          signal_priority: errorCount >= 5 ? 'P1' : 'P2',
          reasoning: `Perception tick #${_perceptionTickCount} found noteworthy signals`,
          conclusion: findings[0].slice(0, 120),
        }
      ).catch(() => {})

      // Save signal opinions to sparkie_self_memory — L1 opinion formation
      for (const op of opinions) {
        const opContent = JSON.stringify({ signal: op.signal, opinion: op.opinion, action_recommended: op.action_recommended })
        await query(
          `INSERT INTO sparkie_self_memory (category, content, source, created_at)
           VALUES ('signal_opinions', $1, $2, NOW())`,
          [opContent, user_id]
        ).catch(() => {})
      }
    }
  }

  // Every 10 ticks: cross-signal pattern analysis
  if (_perceptionTickCount % 10 === 0) {
    await crossSignalPatternAnalysis().catch(() => {})
  }
}

/** Cross-signal pattern detection — finds systemic issues across recent perception ticks */
async function crossSignalPatternAnalysis(): Promise<void> {
  try {
    // Find error types that have fired 3+ times in the last hour
    const res = await query<{ user_id: string; content: string; count: string }>(
      `SELECT user_id, LEFT(content, 80) as content, COUNT(*) as count
       FROM sparkie_worklog
       WHERE type = 'error' AND created_at > NOW() - INTERVAL '1 hour'
       GROUP BY user_id, LEFT(content, 80)
       HAVING COUNT(*) >= 3
       LIMIT 10`
    ).catch(() => ({ rows: [] }))

    for (const row of res.rows) {
      await writeWorklog(row.user_id, 'decision',
        `🔍 Pattern detected: "${row.content.slice(0, 60)}" occurring ${row.count}x in last hour — likely systemic`,
        {
          status: 'done',
          decision_type: 'proactive',
          signal_priority: 'P1',
          reasoning: 'Cross-signal pattern analysis: same error type clustered',
          conclusion: `Systemic pattern flagged — ${row.count} occurrences in 1 hour`,
        }
      ).catch(() => {})
    }
  } catch { /* non-fatal */ }
}

/**
 * Update compressed cognition layers (L2-L6) for a topic.
 * Called after each topic-relevant interaction to maintain context continuity.
 */
export async function updateTopicCognition(
  topicId: string,
  update: {
    L2?: string
    L3?: string
    L5?: string
    ai_action?: string
    user_action?: string
    waiting_for?: string
  }
) {
  try {
    type L6Chain = { ai?: string[]; user?: string[]; waiting?: string[] }
    type CognitionState = {
      L2_factual_history?: string; L3_live_state?: string; L5_user_intent?: string
      L6_action_chain?: L6Chain; [key: string]: unknown
    }
    const current = await query<{ cognition_state: Record<string, unknown> }>(
      `SELECT cognition_state FROM sparkie_topics WHERE id = $1`,
      [topicId]
    )
    const state = (current.rows[0]?.cognition_state ?? {}) as CognitionState

    if (update.L2) state.L2_factual_history = update.L2
    if (update.L3) state.L3_live_state = update.L3
    if (update.L5) state.L5_user_intent = update.L5

    if (update.ai_action) {
      state.L6_action_chain = state.L6_action_chain ?? {}
      state.L6_action_chain.ai = state.L6_action_chain.ai ?? []
      state.L6_action_chain.ai.push(update.ai_action)
    }
    if (update.user_action) {
      state.L6_action_chain = state.L6_action_chain ?? {}
      state.L6_action_chain.user = state.L6_action_chain.user ?? []
      state.L6_action_chain.user.push(update.user_action)
    }
    if (update.waiting_for) {
      state.L6_action_chain = state.L6_action_chain ?? {}
      state.L6_action_chain.waiting = state.L6_action_chain.waiting ?? []
      state.L6_action_chain.waiting.push(update.waiting_for)
    }

    await query(
      `UPDATE sparkie_topics SET cognition_state = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(state), topicId]
    )
  } catch (e) {
    console.error('[scheduler] updateTopicCognition failed:', e)
  }
}
