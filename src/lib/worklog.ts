import { query } from '@/lib/db'

export type WorklogType =
  | 'proactive_check'
  | 'message_batch'
  | 'email_processed'
  | 'email_skipped'
  | 'memory_learned'
  | 'memory_updated'
  | 'memory_forgotten'
  | 'task_executed'
  | 'code_push'
  | 'error'
  | 'heartbeat'
  | 'ai_response'
  | 'signal_skipped'
  | 'auth_check'
  | 'tool_call'
  | 'decision'
  | 'hold'

export type WorklogStatus = 'running' | 'done' | 'blocked' | 'anomaly' | 'skipped'
export type WorklogDecisionType = 'action' | 'skip' | 'hold' | 'escalate' | 'proactive'

export interface WorklogMeta {
  subject?: string
  from?: string
  reason?: string
  count?: number
  topic?: string
  category?: string
  commit?: string
  taskLabel?: string
  taskId?: string
  tool?: string
  duration_ms?: number
  estimated_duration_ms?: number
  status?: WorklogStatus
  decision_type?: WorklogDecisionType
  reasoning?: string
  signal_priority?: 'P0' | 'P1' | 'P2' | 'P3'
  confidence?: number
  [key: string]: unknown
}

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS sparkie_worklog (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})
  await query(`CREATE INDEX IF NOT EXISTS idx_worklog_user_time ON sparkie_worklog(user_id, created_at DESC)`).catch(() => {})
  // Add new columns if they don't exist (non-breaking migration)
  await query(`ALTER TABLE sparkie_worklog ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'done'`).catch(() => {})
  await query(`ALTER TABLE sparkie_worklog ADD COLUMN IF NOT EXISTS decision_type TEXT`).catch(() => {})
  await query(`ALTER TABLE sparkie_worklog ADD COLUMN IF NOT EXISTS reasoning TEXT`).catch(() => {})
  await query(`ALTER TABLE sparkie_worklog ADD COLUMN IF NOT EXISTS estimated_duration_ms INT`).catch(() => {})
  await query(`ALTER TABLE sparkie_worklog ADD COLUMN IF NOT EXISTS actual_duration_ms INT`).catch(() => {})
  await query(`ALTER TABLE sparkie_worklog ADD COLUMN IF NOT EXISTS signal_priority TEXT`).catch(() => {})
}

export async function writeWorklog(
  userId: string,
  type: WorklogType,
  content: string,
  metadata: WorklogMeta = {}
): Promise<void> {
  try {
    await ensureTable()
    const id = crypto.randomUUID()
    const { status, decision_type, reasoning, estimated_duration_ms, actual_duration_ms, signal_priority, ...restMeta } = metadata
    await query(
      `INSERT INTO sparkie_worklog (id, user_id, type, content, metadata, status, decision_type, reasoning, estimated_duration_ms, actual_duration_ms, signal_priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id, userId, type, content, JSON.stringify(restMeta),
        status ?? 'done',
        decision_type ?? null,
        reasoning ?? null,
        estimated_duration_ms ?? null,
        actual_duration_ms ?? null,
        signal_priority ?? null,
      ]
    )
  } catch (e) {
    console.error('[worklog] write failed:', e)
  }
}

/** Merge consecutive message_batch entries within 5 minutes into one updated entry */
export async function writeMsgBatch(userId: string, count: number): Promise<void> {
  try {
    await ensureTable()
    const recent = await query(
      `SELECT id, metadata FROM sparkie_worklog
       WHERE user_id = $1 AND type = 'message_batch' AND created_at > NOW() - INTERVAL '5 minutes'
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    )
    if (recent.rows.length > 0) {
      const existing = recent.rows[0] as { id: string; metadata: Record<string, unknown> }
      const prevCount = Number(existing.metadata?.count ?? 0)
      const newCount = prevCount + count
      await query(
        `UPDATE sparkie_worklog SET
           content = $2,
           metadata = jsonb_set(COALESCE(metadata, '{}'), '{count}', to_jsonb($3::int)),
           created_at = NOW()
         WHERE id = $1`,
        [existing.id, `You just sent me ${newCount} message${newCount !== 1 ? 's' : ''}\nAll noted! I am working on it.`, newCount]
      )
    } else {
      await writeWorklog(
        userId,
        'message_batch',
        `You just sent me ${count} message${count !== 1 ? 's' : ''}\nAll noted! I am working on it.`,
        { count }
      )
    }
  } catch (e) {
    console.error('[worklog] writeMsgBatch failed:', e)
  }
}
