import { query } from '@/lib/db'

// ── Schema ────────────────────────────────────────────────────────────────────
export async function ensureThreadSchema(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS sparkie_threads (
      id               BIGSERIAL PRIMARY KEY,
      user_id          TEXT NOT NULL,
      role             TEXT NOT NULL,
      content          TEXT NOT NULL,
      tool_call_id     TEXT,
      is_tool_result   BOOLEAN DEFAULT FALSE,
      is_pinned        BOOLEAN DEFAULT FALSE,
      is_compressed    BOOLEAN DEFAULT FALSE,
      token_estimate   INT DEFAULT 0,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS idx_sparkie_threads_user ON sparkie_threads(user_id, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_sparkie_threads_pinned ON sparkie_threads(user_id, is_pinned)`)
}

export interface ThreadMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  is_tool_result?: boolean
  is_pinned?: boolean
  token_estimate?: number
}

const ROUGH_TOKENS_PER_CHAR = 0.25  // ~4 chars per token
const MAX_THREAD_TOKENS = 6000      // Keep last ~6k tokens uncompressed
const COMPRESS_BATCH_SIZE = 20      // Compress this many messages at a time

// ── Append a message to the thread ───────────────────────────────────────────
export async function appendThreadMessage(userId: string, msg: ThreadMessage): Promise<void> {
  try {
    await ensureThreadSchema()
    const tokenEst = Math.ceil((msg.content?.length ?? 0) * ROUGH_TOKENS_PER_CHAR)
    // Tool call pairs are always pinned — they are NEVER compressed
    const isPinned = msg.is_tool_result || msg.role === 'tool' || !!msg.tool_call_id
    await query(
      `INSERT INTO sparkie_threads (user_id, role, content, tool_call_id, is_tool_result, is_pinned, token_estimate)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, msg.role, msg.content, msg.tool_call_id ?? null, msg.is_tool_result ?? false, isPinned, tokenEst]
    )
  } catch { /* non-fatal */ }
}

// ── Load thread context for prompt injection ──────────────────────────────────
// Returns: compressed_summary + pinned_tool_pairs + recent_uncompressed
export async function loadThreadContext(userId: string): Promise<{
  compressedSummary: string
  pinnedPairs: ThreadMessage[]
  recentMessages: ThreadMessage[]
}> {
  try {
    await ensureThreadSchema()

    // Load compressed summaries
    const summaryRes = await query(
      `SELECT content FROM sparkie_threads WHERE user_id = $1 AND is_compressed = TRUE ORDER BY created_at ASC`,
      [userId]
    )
    const compressedSummary = summaryRes.rows.map((r: { content: string }) => r.content).join('\n\n')

    // Load pinned tool pairs (never compressed)
    const pinnedRes = await query(
      `SELECT role, content, tool_call_id, is_tool_result FROM sparkie_threads
       WHERE user_id = $1 AND is_pinned = TRUE ORDER BY created_at ASC`,
      [userId]
    )
    const pinnedPairs = pinnedRes.rows.map((r: {
      role: 'user'|'assistant'|'tool'; content: string; tool_call_id: string|null; is_tool_result: boolean
    }) => ({
      role: r.role,
      content: r.content,
      tool_call_id: r.tool_call_id ?? undefined,
      is_tool_result: r.is_tool_result,
    }))

    // Load recent uncompressed (newest first, up to token budget)
    const recentRes = await query(
      `SELECT role, content, token_estimate FROM sparkie_threads
       WHERE user_id = $1 AND is_compressed = FALSE AND is_pinned = FALSE
       ORDER BY created_at DESC LIMIT 30`,
      [userId]
    )
    // Reverse to chronological order
    const recentMessages: ThreadMessage[] = recentRes.rows.reverse().map((r: {
      role: 'user'|'assistant'|'tool'; content: string; token_estimate: number
    }) => ({
      role: r.role,
      content: r.content,
      token_estimate: r.token_estimate,
    }))

    return { compressedSummary, pinnedPairs, recentMessages }
  } catch {
    return { compressedSummary: '', pinnedPairs: [], recentMessages: [] }
  }
}

// ── Write session snapshot (end-of-session) ───────────────────────────────────
// Called after session completes — writes 1-paragraph semantic state
export async function writeSessionSnapshot(userId: string, snapshot: string): Promise<void> {
  try {
    await query(
      `INSERT INTO user_identity_files (user_id, file_type, content, updated_at)
       VALUES ($1, 'snapshot', $2, NOW())
       ON CONFLICT (user_id, file_type) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
      [userId, snapshot]
    )
  } catch { /* non-fatal */ }
}

// ── Read session snapshot for continuity check ────────────────────────────────
export async function readSessionSnapshot(userId: string): Promise<string> {
  try {
    const res = await query(
      `SELECT content FROM user_identity_files WHERE user_id = $1 AND file_type = 'snapshot'`,
      [userId]
    )
    return res.rows[0]?.content ?? ''
  } catch { return '' }
}

// ── Count uncompressed tokens for a user ─────────────────────────────────────
export async function getUncompressedTokenCount(userId: string): Promise<number> {
  try {
    const res = await query(
      `SELECT COALESCE(SUM(token_estimate), 0) as total FROM sparkie_threads
       WHERE user_id = $1 AND is_compressed = FALSE AND is_pinned = FALSE`,
      [userId]
    )
    return Number(res.rows[0]?.total ?? 0)
  } catch { return 0 }
}

// ── Checkpoint: compress oldest uncompressed batch ───────────────────────────
// Returns the summary text (for use in worklog entry)
export async function compressOldestBatch(
  userId: string,
  summaryText: string
): Promise<void> {
  try {
    // Get the IDs of the oldest COMPRESS_BATCH_SIZE uncompressed, unpinned messages
    const res = await query(
      `SELECT id FROM sparkie_threads WHERE user_id = $1 AND is_compressed = FALSE AND is_pinned = FALSE
       ORDER BY created_at ASC LIMIT $2`,
      [userId, COMPRESS_BATCH_SIZE]
    )
    const ids = res.rows.map((r: { id: number }) => r.id)
    if (ids.length === 0) return

    // Mark them as compressed (content replaced by summary marker)
    await query(
      `UPDATE sparkie_threads SET is_compressed = TRUE, content = '[compressed]' WHERE id = ANY($1)`,
      [ids]
    )

    // Write the summary as a new compressed entry
    await query(
      `INSERT INTO sparkie_threads (user_id, role, content, is_compressed, token_estimate)
       VALUES ($1, 'assistant', $2, TRUE, $3)`,
      [userId, summaryText, Math.ceil(summaryText.length * ROUGH_TOKENS_PER_CHAR)]
    )
  } catch { /* non-fatal */ }
}

export { MAX_THREAD_TOKENS }
