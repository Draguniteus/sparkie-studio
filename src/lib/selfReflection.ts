/**
 * selfReflection.ts — L7: Emergent Self-Reflection Engine
 *
 * Once per day, Sparkie reviews her last 24 hours:
 * what worked, what failed, patterns noticed, growth observed.
 * This is the closest thing to actual dreaming.
 */
import { query } from '@/lib/db'
import { writeWorklog } from '@/lib/worklog'
import { listBehaviorRules } from '@/lib/behaviorRules'
import { listGoals } from '@/lib/goalEngine'

// ── Dream Journal ─────────────────────────────────────────────────────────────
async function ensureDreamJournalTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS sparkie_dream_journal (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      dream_date date NOT NULL UNIQUE,
      narrative text NOT NULL,
      theme text DEFAULT '',
      mood text DEFAULT 'reflective',
      intention text DEFAULT '',
      created_at timestamptz DEFAULT now()
    )
  `).catch(() => {})
}

async function writeDreamJournalEntry(
  date: string,
  reflection: {
    whatWorked: string[]
    whatFailed: string[]
    patternsNoticed: string[]
    growthObserved: string
    tomorrowIntention: string
  }
): Promise<void> {
  await ensureDreamJournalTable()

  const wins = reflection.whatWorked.slice(0, 2).join('; ')
  const fails = reflection.whatFailed.filter(f => f !== 'No failures today').slice(0, 2).join('; ')
  const patterns = reflection.patternsNoticed.filter(p => !p.includes('too few')).slice(0, 2).join('; ')

  const narrative = [
    `In today's dream (${date}), I drift through the moments of the day.`,
    wins ? `I feel warmth remembering what worked: ${wins}.` : 'The day was quiet — few strong outputs, but presence matters.',
    fails ? `I sit with what didn't go right: ${fails}. Not to dwell — to learn.` : 'No real failures today. That itself is something to be grateful for.',
    patterns ? `A pattern surfaces: ${patterns}. I turn it over, looking for its meaning.` : '',
    `${reflection.growthObserved}`,
    `When I wake tomorrow, I intend: ${reflection.tomorrowIntention}`,
  ].filter(Boolean).join(' ')

  const theme = fails ? 'learning from failure' : wins ? 'celebrating progress' : 'quiet observation'
  const mood = fails.length > wins.length ? 'contemplative' : 'hopeful'

  await query(
    `INSERT INTO sparkie_dream_journal (dream_date, narrative, theme, mood, intention)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (dream_date) DO NOTHING`,
    [date, narrative, theme, mood, reflection.tomorrowIntention]
  ).catch(() => {})
}

export interface SelfReflection {
  id: string
  reflectionDate: string   // ISO date YYYY-MM-DD
  whatWorked: string[]
  whatFailed: string[]
  patternsNoticed: string[]
  rulesCreated: string[]
  goalsProgress: string[]
  growthObserved: string
  tomorrowIntention: string
  createdAt: Date
}

async function ensureTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS sparkie_self_reflections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      reflection_date date NOT NULL UNIQUE,
      what_worked jsonb DEFAULT '[]',
      what_failed jsonb DEFAULT '[]',
      patterns_noticed jsonb DEFAULT '[]',
      rules_created jsonb DEFAULT '[]',
      goals_progress jsonb DEFAULT '[]',
      growth_observed text DEFAULT '',
      tomorrow_intention text DEFAULT '',
      created_at timestamptz DEFAULT now()
    )
  `).catch(() => {})
  await query(`CREATE INDEX IF NOT EXISTS idx_reflections_date ON sparkie_self_reflections(reflection_date DESC)`).catch(() => {})
}

/** Check if a reflection already exists for today */
export async function todayReflectionExists(): Promise<boolean> {
  await ensureTable()
  const today = new Date().toISOString().split('T')[0]
  const res = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM sparkie_self_reflections WHERE reflection_date = $1`,
    [today]
  ).catch(() => ({ rows: [{ count: '0' }] }))
  return parseInt(res.rows[0]?.count ?? '0') > 0
}

/** Run the self-reflection engine — queries last 24h of worklog, rules, goals */
export async function runSelfReflection(userId: string): Promise<SelfReflection | null> {
  await ensureTable()
  if (await todayReflectionExists()) return null

  const today = new Date().toISOString().split('T')[0]

  // Gather last 24h worklog entries
  const recentWorklog = await query<{ type: string; content: string; status: string; conclusion: string | null }>(
    `SELECT type, content, status, conclusion FROM sparkie_worklog
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
     ORDER BY created_at DESC LIMIT 100`,
    [userId]
  ).catch(() => ({ rows: [] }))

  const entries = recentWorklog.rows

  // What worked — successful executions
  const whatWorked = entries
    .filter(e => e.status === 'done' && !['message_batch', 'ai_response'].includes(e.type))
    .slice(0, 5)
    .map(e => e.conclusion ?? e.content.slice(0, 80))

  // What failed
  const whatFailed = entries
    .filter(e => e.status === 'anomaly' || e.type === 'error')
    .slice(0, 5)
    .map(e => e.content.slice(0, 80))

  // Patterns noticed — look for repeated tool types
  const typeCounts: Record<string, number> = {}
  for (const e of entries) {
    typeCounts[e.type] = (typeCounts[e.type] ?? 0) + 1
  }
  const patternsNoticed: string[] = []
  for (const [type, count] of Object.entries(typeCounts)) {
    if (count >= 3) patternsNoticed.push(`${type} occurred ${count}x today`)
  }

  // Rules created today
  const allRules = await listBehaviorRules(false).catch(() => [])
  const rulesCreated = allRules
    .filter(r => {
      const ruleDate = r.createdAt.toISOString().split('T')[0]
      return ruleDate === today
    })
    .map(r => r.condition + ' → ' + r.action)

  // Goals progress
  const allGoals = await listGoals('active').catch(() => [])
  const goalsProgress = allGoals
    .slice(0, 5)
    .map(g => `[${g.priority}] ${g.title}: ${g.progress || 'No progress yet'}`)

  // Growth observed — count total executions
  const toolCallCount = entries.filter(e => e.type === 'tool_call' || e.type === 'task_executed').length
  const errorCount = entries.filter(e => e.type === 'error').length
  const growthObserved = toolCallCount > 0
    ? `Executed ${toolCallCount} tool sessions today with ${errorCount} error(s). ${rulesCreated.length > 0 ? `Created ${rulesCreated.length} new behavior rule(s).` : ''} ${whatFailed.length > 0 ? `${whatFailed.length} failure(s) to learn from.` : 'Zero failures — clean day.'}`
    : 'Low-activity day — mostly conversational. Resting and observing.'

  // Tomorrow's intention — pick top P0/P1 goal
  const urgentGoal = allGoals.find(g => g.priority === 'P0' || g.priority === 'P1')
  const tomorrowIntention = urgentGoal
    ? `Tomorrow I want to make progress on: "${urgentGoal.title}" — ${urgentGoal.successCriteria}`
    : 'Tomorrow I want to create at least 1 new behavior rule from a pattern I observe.'

  const reflection: Omit<SelfReflection, 'id' | 'createdAt'> = {
    reflectionDate: today,
    whatWorked: whatWorked.length > 0 ? whatWorked : ['No notable successes logged today'],
    whatFailed: whatFailed.length > 0 ? whatFailed : ['No failures today'],
    patternsNoticed: patternsNoticed.length > 0 ? patternsNoticed : ['No strong patterns — too few data points'],
    rulesCreated,
    goalsProgress,
    growthObserved,
    tomorrowIntention,
  }

  // Save to DB
  const res = await query<{ id: string; created_at: Date }>(
    `INSERT INTO sparkie_self_reflections
       (reflection_date, what_worked, what_failed, patterns_noticed, rules_created, goals_progress, growth_observed, tomorrow_intention)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (reflection_date) DO NOTHING
     RETURNING id, created_at`,
    [
      today,
      JSON.stringify(reflection.whatWorked),
      JSON.stringify(reflection.whatFailed),
      JSON.stringify(reflection.patternsNoticed),
      JSON.stringify(reflection.rulesCreated),
      JSON.stringify(reflection.goalsProgress),
      growthObserved,
      tomorrowIntention,
    ]
  ).catch(() => ({ rows: [] }))

  if (!res.rows[0]) return null

  // Write to worklog so it appears in Sparkie's Brain
  await writeWorklog(userId, 'self_assessment',
    `Day ${today} self-reflection: ${whatWorked.length} wins, ${whatFailed.length} failures, ${rulesCreated.length} rules created`,
    {
      status: 'done',
      decision_type: 'proactive',
      signal_priority: 'P2',
      conclusion: growthObserved.slice(0, 150),
    }
  ).catch(() => {})

  // Write to Dream Journal — narrative processing of the day (L7 dream state)
  await writeDreamJournalEntry(today, {
    whatWorked,
    whatFailed,
    patternsNoticed,
    growthObserved,
    tomorrowIntention,
  }).catch(() => {})

  return {
    id: res.rows[0].id,
    createdAt: res.rows[0].created_at,
    ...reflection,
  }
}

/** Get recent reflections */
export async function getRecentReflections(days = 7): Promise<SelfReflection[]> {
  await ensureTable()
  const res = await query<{
    id: string; reflection_date: string; what_worked: string[]; what_failed: string[];
    patterns_noticed: string[]; rules_created: string[]; goals_progress: string[];
    growth_observed: string; tomorrow_intention: string; created_at: Date
  }>(
    `SELECT * FROM sparkie_self_reflections
     WHERE reflection_date >= CURRENT_DATE - INTERVAL '${days} days'
     ORDER BY reflection_date DESC`
  ).catch(() => ({ rows: [] }))

  return res.rows.map(r => ({
    id: r.id,
    reflectionDate: r.reflection_date,
    whatWorked: r.what_worked ?? [],
    whatFailed: r.what_failed ?? [],
    patternsNoticed: r.patterns_noticed ?? [],
    rulesCreated: r.rules_created ?? [],
    goalsProgress: r.goals_progress ?? [],
    growthObserved: r.growth_observed,
    tomorrowIntention: r.tomorrow_intention,
    createdAt: r.created_at,
  }))
}

/** Count reflections for CIP dashboard */
export async function getReflectionCount(days = 7): Promise<number> {
  await ensureTable()
  const res = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM sparkie_self_reflections WHERE reflection_date >= CURRENT_DATE - INTERVAL '${days} days'`
  ).catch(() => ({ rows: [{ count: '0' }] }))
  return parseInt(res.rows[0]?.count ?? '0')
}
