import { query } from '@/lib/db'

export type AttemptType = 'success' | 'failure' | 'workaround' | 'pattern'

export interface AttemptEntry {
  id: string
  userId: string
  domain: string              // e.g. 'minimax_video', 'github_push', 'composio_auth'
  attemptType: AttemptType
  summary: string             // what was tried
  outcome: string             // what happened
  lesson: string              // what to do / not do next time
  createdAt: Date
  expiresAt?: Date            // null = permanent
}

async function ensureTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS sparkie_attempt_history (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      TEXT NOT NULL,
      domain       TEXT NOT NULL,
      attempt_type TEXT NOT NULL DEFAULT 'failure',
      summary      TEXT NOT NULL,
      outcome      TEXT NOT NULL,
      lesson       TEXT NOT NULL,
      expires_at   TIMESTAMPTZ,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})
  await query(`
    CREATE INDEX IF NOT EXISTS idx_sparkie_attempt_history_user_domain
    ON sparkie_attempt_history(user_id, domain)
  `).catch(() => {})
}

// Save a new attempt record
export async function saveAttempt(
  userId: string,
  domain: string,
  attemptType: AttemptType,
  summary: string,
  outcome: string,
  lesson: string,
  ttlDays?: number
): Promise<void> {
  await ensureTable()
  const expiresAt = ttlDays
    ? new Date(Date.now() + ttlDays * 86_400_000)
    : null
  await query(
    `INSERT INTO sparkie_attempt_history (user_id, domain, attempt_type, summary, outcome, lesson, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, domain, attemptType, summary, outcome, lesson, expiresAt]
  ).catch(() => {})
}

// Query attempts for a domain — returns failures and workarounds first (most useful)
export async function getAttempts(
  userId: string,
  domain: string,
  limit = 5
): Promise<AttemptEntry[]> {
  await ensureTable()
  const res = await query<{
    id: string; user_id: string; domain: string; attempt_type: string;
    summary: string; outcome: string; lesson: string; created_at: Date; expires_at: Date | null
  }>(
    `SELECT * FROM sparkie_attempt_history
     WHERE user_id = $1 AND domain ILIKE $2
     AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY
       CASE attempt_type WHEN 'failure' THEN 1 WHEN 'workaround' THEN 2 WHEN 'pattern' THEN 3 ELSE 4 END,
       created_at DESC
     LIMIT $3`,
    [userId, `%${domain}%`, limit]
  ).catch(() => ({ rows: [] }))
  return res.rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    domain: r.domain,
    attemptType: r.attempt_type as AttemptType,
    summary: r.summary,
    outcome: r.outcome,
    lesson: r.lesson,
    createdAt: r.created_at,
    expiresAt: r.expires_at ?? undefined,
  }))
}

// Format attempt history block for system prompt injection
export function formatAttemptBlock(attempts: AttemptEntry[]): string {
  if (attempts.length === 0) return ''
  const lines = attempts.map((a) => {
    const tag = a.attemptType === 'failure' ? '❌ FAILED' :
                a.attemptType === 'workaround' ? '🔧 WORKAROUND' :
                a.attemptType === 'pattern' ? '🔁 PATTERN' : '✅ WORKED'
    return `${tag} [${a.domain}]: ${a.summary}\n  → ${a.lesson}`
  })
  return `\n\n## ATTEMPT HISTORY — CHECK BEFORE ACTING\nThings tried before in this domain. Do NOT repeat failed approaches.\n${lines.join('\n')}`
}
