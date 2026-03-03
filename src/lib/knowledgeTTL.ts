import { query } from '@/lib/db'

// Default TTLs (days) by category
export const DEFAULT_TTL: Record<string, number> = {
  api_behavior:   30,   // API endpoints, response shapes — can change
  pricing:         7,   // Pricing changes frequently
  rate_limit:     14,   // Rate limits can change
  work_rule:      90,   // Stable rules
  procedure:      60,   // Execution procedures
  self:          365,   // Self-knowledge — very stable
  user:          180,   // User prefs — moderately stable
  creative:      365,   // Creative discoveries
  failure:        30,   // Failure memories — re-verify after 30d
  workaround:     45,   // Workarounds become obsolete
}

// Ensure expires_at and memory_type columns exist
export async function ensureColumns(): Promise<void> {
  await query(`
    ALTER TABLE sparkie_self_memory
    ADD COLUMN IF NOT EXISTS memory_type TEXT DEFAULT 'self',
    ADD COLUMN IF NOT EXISTS expires_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS stale_flagged BOOLEAN DEFAULT false
  `).catch(() => {}) // column already exists = fine
}

// Set TTL on a self-memory entry at write time
export async function setMemoryTTL(memoryId: number, category: string): Promise<void> {
  await ensureColumns()
  const days = DEFAULT_TTL[category] ?? 180
  const expiresAt = new Date(Date.now() + days * 86_400_000)
  await query(
    `UPDATE sparkie_self_memory SET expires_at = $2, memory_type = $3 WHERE id = $1`,
    [memoryId, expiresAt.toISOString(), category]
  ).catch(() => {})
}

// Heartbeat: find expired entries and flag them for re-verification
export async function runTTLDecaySweep(userId?: string): Promise<number> {
  await ensureColumns()
  const res = await query<{ id: number; category: string; content: string }>(
    userId
      ? `SELECT id, category, content FROM sparkie_self_memory
         WHERE source = $1 AND expires_at < NOW() AND stale_flagged = false
         LIMIT 20`
      : `SELECT id, category, content FROM sparkie_self_memory
         WHERE expires_at < NOW() AND stale_flagged = false
         LIMIT 20`,
    userId ? [userId] : []
  ).catch(() => ({ rows: [] }))

  if (res.rows.length === 0) return 0

  // Flag them all as stale
  const ids = res.rows.map((r) => r.id)
  await query(
    `UPDATE sparkie_self_memory SET stale_flagged = true WHERE id = ANY($1)`,
    [ids]
  ).catch(() => {})

  return res.rows.length
}

// Read memories — optionally filter out stale ones (for prompt injection)
export async function getActiveMemories(
  category?: string,
  includeStale = false,
  limit = 50
): Promise<Array<{ id: number; category: string; content: string; stale: boolean; expiresAt: Date | null }>> {
  await ensureColumns()
  const conditions = []
  const params: unknown[] = []
  if (category) {
    params.push(category)
    conditions.push(`memory_type = $${params.length}`)
  }
  if (!includeStale) {
    conditions.push(`stale_flagged = false`)
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  params.push(limit)
  const res = await query<{
    id: number; category: string; content: string; stale_flagged: boolean; expires_at: Date | null
  }>(
    `SELECT id, category, content, stale_flagged, expires_at FROM sparkie_self_memory
     ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  ).catch(() => ({ rows: [] }))
  return res.rows.map((r) => ({
    id: r.id,
    category: r.category,
    content: r.content,
    stale: r.stale_flagged,
    expiresAt: r.expires_at,
  }))
}
