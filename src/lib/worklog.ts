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

export interface WorklogMeta {
  subject?: string
  from?: string
  reason?: string
  count?: number
  topic?: string
  category?: string
  commit?: string
  taskLabel?: string
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
    await query(
      `INSERT INTO sparkie_worklog (id, user_id, type, content, metadata) VALUES ($1, $2, $3, $4, $5)`,
      [id, userId, type, content, JSON.stringify(metadata)]
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
