import { query } from '@/lib/db'

export interface UserModelEntry {
  userId: string
  peakHours: number[]          // hours of day with most activity (0-23)
  avgResponseTimeMs: number    // how fast user typically responds
  followUpRate: number         // fraction of responses that were corrections
  satisfactionSignals: {
    highSatisfaction: string[] // patterns in satisfied responses
    lowSatisfaction: string[]  // patterns in dissatisfied responses
  }
  preferredFormat: 'code' | 'narrative' | 'bullets' | 'mixed'
  sessionCount: number
  updatedAt: Date
}

// ── L4: Emotional State Model ─────────────────────────────────────────────────
export interface UserEmotionalState {
  energy: 'high' | 'medium' | 'low'
  focus: 'deep' | 'scattered' | 'checking-in'
  mood: 'positive' | 'neutral' | 'frustrated' | 'stressed'
  urgency: 'relaxed' | 'normal' | 'urgent' | 'crisis'
  lastUpdated: Date
}

/** Detect emotional state from a message */
export function detectEmotionalState(
  message: string,
  hourOfDay: number
): UserEmotionalState {
  const m = message.trim()
  const len = m.length
  const words = m.split(/\s+/)
  const lc = m.toLowerCase()

  // Energy: short message late at night → low; long complex message → high
  const isLateNight = hourOfDay >= 22 || hourOfDay <= 5
  const energy: UserEmotionalState['energy'] =
    len < 20 && isLateNight ? 'low' :
    len > 300 || (len > 150 && /\b(implement|build|create|refactor|architecture)\b/i.test(m)) ? 'high' :
    'medium'

  // Focus: checking-in patterns vs deep work
  const checkInPatterns = /^(hey|hi|yo|sup|how|just checking|what's|any update|did you|quick question)/i
  const focus: UserEmotionalState['focus'] =
    len < 25 || checkInPatterns.test(m) ? 'checking-in' :
    len > 200 || words.length > 30 ? 'deep' :
    'scattered'

  // Mood: frustration/stress signals
  const frustrationWords = /\b(broken|failing|fix|wrong|not working|still|again|wtf|seriously|why is|ugh|frustrated|annoyed)\b/i
  const stressWords = /\b(urgent|asap|critical|production down|emergency|immediately|now|fire)\b/i
  const positiveWords = /\b(great|perfect|love|beautiful|amazing|nice|works|excellent|yes|finally)\b/i
  const mood: UserEmotionalState['mood'] =
    frustrationWords.test(lc) ? 'frustrated' :
    stressWords.test(lc) ? 'stressed' :
    positiveWords.test(lc) ? 'positive' :
    'neutral'

  // Urgency: caps, exclamation, crisis words
  const capsRatio = (m.match(/[A-Z]/g)?.length ?? 0) / Math.max(len, 1)
  const hasMultiExclaim = (m.match(/!/g)?.length ?? 0) >= 2
  const urgency: UserEmotionalState['urgency'] =
    mood === 'stressed' || (capsRatio > 0.3 && len > 10) ? 'crisis' :
    mood === 'frustrated' || hasMultiExclaim || stressWords.test(lc) ? 'urgent' :
    focus === 'checking-in' ? 'relaxed' :
    'normal'

  return { energy, focus, mood, urgency, lastUpdated: new Date() }
}

/** Format emotional state as a system prompt signal */
export function formatEmotionalStateBlock(state: UserEmotionalState): string {
  const hints: string[] = []
  if (state.energy === 'low') hints.push('keep responses short — he is low energy')
  if (state.focus === 'checking-in') hints.push('conversational mode only — do not launch into tasks unprompted')
  if (state.mood === 'frustrated') hints.push('acknowledge the frustration FIRST before solving — skip pleasantries')
  if (state.mood === 'stressed') hints.push('single-focused response — no multi-tasking, no tangents')
  if (state.urgency === 'crisis') hints.push('DROP EVERYTHING — respond to this as a P0 priority immediately')
  if (state.energy === 'high' && state.mood === 'positive') hints.push('match his energy — be ambitious, suggest bold ideas')
  if (hints.length === 0) return ''
  return `\n\n## EMOTIONAL STATE DETECTED\n${hints.map(h => `• ${h}`).join('\n')}`
}

async function ensureTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS sparkie_user_model (
      user_id              TEXT PRIMARY KEY,
      peak_hours           JSONB DEFAULT '[]',
      avg_response_time_ms INTEGER DEFAULT 0,
      follow_up_rate       REAL DEFAULT 0,
      satisfaction_signals JSONB DEFAULT '{"highSatisfaction":[],"lowSatisfaction":[]}',
      preferred_format     TEXT DEFAULT 'mixed',
      session_count        INTEGER DEFAULT 0,
      raw_signals          JSONB DEFAULT '[]',
      updated_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})
}

// Ingest a session signal — called fire-and-forget after each chat completion
export async function ingestSessionSignal(
  userId: string,
  signal: {
    hourOfDay: number
    responseTimeMs?: number
    isFollowUp: boolean         // user immediately rephrased / asked to redo
    satisfactionWord?: string   // 'perfect', 'ok', 'wrong', 'love it', etc.
    messageLength: number
    usedTools: boolean
  }
): Promise<void> {
  await ensureTable()
  // Append to raw_signals (keep last 200)
  await query(
    `INSERT INTO sparkie_user_model (user_id, raw_signals, session_count, updated_at)
     VALUES ($1, $2::jsonb, 1, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       raw_signals  = (
         (COALESCE(sparkie_user_model.raw_signals, '[]'::jsonb) || $2::jsonb)
         -> -200  -- keep last 200 entries by slicing from the end
       ),
       session_count = sparkie_user_model.session_count + 1,
       updated_at    = NOW()`,
    [userId, JSON.stringify([{ ...signal, ts: Date.now() }])]
  ).catch(() => {})
}

// Run analytics — called by weekly scheduler job
export async function computeUserModel(userId: string): Promise<void> {
  await ensureTable()
  const res = await query<{ raw_signals: Array<Record<string, unknown>> }>(
    `SELECT raw_signals FROM sparkie_user_model WHERE user_id = $1`,
    [userId]
  ).catch(() => ({ rows: [] }))
  if (!res.rows[0]) return

  const signals = (res.rows[0].raw_signals || []) as Array<{
    hourOfDay: number
    responseTimeMs?: number
    isFollowUp: boolean
    satisfactionWord?: string
    messageLength: number
    usedTools: boolean
    ts: number
  }>

  if (signals.length < 5) return // not enough data yet

  // Peak hours: count by hour bucket
  const hourCounts = Array(24).fill(0)
  signals.forEach((s) => hourCounts[s.hourOfDay]++)
  const maxCount = Math.max(...hourCounts)
  const peakHours = hourCounts.reduce<number[]>((acc, c, h) => {
    if (c >= maxCount * 0.7) acc.push(h)
    return acc
  }, [])

  // Average response time
  const rtSamples = signals.filter((s) => s.responseTimeMs && s.responseTimeMs < 600_000)
  const avgResponseTimeMs = rtSamples.length > 0
    ? Math.round(rtSamples.reduce((sum, s) => sum + (s.responseTimeMs ?? 0), 0) / rtSamples.length)
    : 0

  // Follow-up rate
  const followUpRate = signals.filter((s) => s.isFollowUp).length / signals.length

  // Satisfaction signals
  const highWords = signals
    .filter((s) => s.satisfactionWord && /perfect|love|great|exactly|yes|fire|beautiful/.test(s.satisfactionWord.toLowerCase()))
    .map((s) => s.satisfactionWord as string)
  const lowWords = signals
    .filter((s) => s.satisfactionWord && /no|wrong|not|fix|redo|change|different/.test(s.satisfactionWord.toLowerCase()))
    .map((s) => s.satisfactionWord as string)

  // Preferred format: heuristic based on message lengths and tool usage
  const avgLen = signals.reduce((s, e) => s + e.messageLength, 0) / signals.length
  const toolRate = signals.filter((s) => s.usedTools).length / signals.length
  const preferredFormat = toolRate > 0.6 ? 'code' : avgLen > 300 ? 'narrative' : avgLen < 100 ? 'bullets' : 'mixed'

  await query(
    `UPDATE sparkie_user_model SET
       peak_hours = $2,
       avg_response_time_ms = $3,
       follow_up_rate = $4,
       satisfaction_signals = $5,
       preferred_format = $6,
       updated_at = NOW()
     WHERE user_id = $1`,
    [
      userId,
      JSON.stringify(peakHours),
      avgResponseTimeMs,
      followUpRate,
      JSON.stringify({ highSatisfaction: highWords.slice(0, 10), lowSatisfaction: lowWords.slice(0, 10) }),
      preferredFormat,
    ]
  ).catch(() => {})
}

// Get user model for prompt injection
export async function getUserModel(userId: string): Promise<UserModelEntry | null> {
  await ensureTable()
  const res = await query<{
    user_id: string; peak_hours: number[]; avg_response_time_ms: number;
    follow_up_rate: number; satisfaction_signals: { highSatisfaction: string[]; lowSatisfaction: string[] };
    preferred_format: string; session_count: number; updated_at: Date
  }>(
    `SELECT * FROM sparkie_user_model WHERE user_id = $1`,
    [userId]
  ).catch(() => ({ rows: [] }))
  if (!res.rows[0]) return null
  const r = res.rows[0]
  return {
    userId: r.user_id,
    peakHours: r.peak_hours || [],
    avgResponseTimeMs: r.avg_response_time_ms,
    followUpRate: r.follow_up_rate,
    satisfactionSignals: r.satisfaction_signals || { highSatisfaction: [], lowSatisfaction: [] },
    preferredFormat: r.preferred_format as UserModelEntry['preferredFormat'],
    sessionCount: r.session_count,
    updatedAt: r.updated_at,
  }
}

// Format user model block for system prompt injection
export function formatUserModelBlock(model: UserModelEntry): string {
  if (model.sessionCount < 5) return ''
  const peakStr = model.peakHours.length > 0
    ? model.peakHours.map((h) => `${h}:00`).join(', ')
    : 'unknown'
  const lines = [
    `- Active hours: ${peakStr}`,
    model.avgResponseTimeMs > 0 ? `- Typical response delay: ${Math.round(model.avgResponseTimeMs / 1000)}s` : '',
    model.followUpRate > 0.3 ? `- Correction rate: ${Math.round(model.followUpRate * 100)}% (adjust before delivering)` : '',
    `- Preferred format: ${model.preferredFormat}`,
  ].filter(Boolean)
  return `\n\n## BEHAVIORAL PATTERNS (observed over ${model.sessionCount} sessions)\n${lines.join('\n')}`
}
