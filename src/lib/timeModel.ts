import { query } from '@/lib/db'

// ── Schema ─────────────────────────────────────────────────────────────────────
export async function ensureDeferredIntentsSchema(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS sparkie_deferred_intents (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       TEXT NOT NULL,
      intent        TEXT NOT NULL,
      source_msg    TEXT DEFAULT '',
      not_before    TIMESTAMPTZ DEFAULT NOW(),
      due_at        TIMESTAMPTZ,
      status        TEXT DEFAULT 'pending',
      surfaced_at   TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS idx_deferred_intents_user ON sparkie_deferred_intents(user_id, status, not_before)`)
}

export interface DeferredIntent {
  id: string
  userId: string
  intent: string
  sourceMsg: string
  notBefore: Date
  dueAt: Date | null
  status: 'pending' | 'surfaced' | 'completed' | 'dismissed'
  createdAt: Date
}

// ── Deadline phrase regex ─────────────────────────────────────────────────────
const DEADLINE_PATTERNS = [
  /\bby\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bby\s+(eod|end of day|end of week|eow)\b/i,
  /\bbefore\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bship\s+(this|next)\s+(week|month)\b/i,
  /\bdue\s+(this|next)?\s*(week|friday|monday)\b/i,
  /\bremind\s+me\s+to\b/i,
  /\bwe\s+should\s+(look|check|review)\b/i,
  /\bsomeday\b/i,
  /\bcheck\s+.{3,30}\s+later\b/i,
  /\bfollow\s+up\s+on\b/i,
  /\bdon.t\s+forget\s+to\b/i,
  /\bwhen\s+you\s+get\s+a\s+chance\b/i,
]

// ── Extract deferred intents from a message ───────────────────────────────────
export function extractDeferredIntent(message: string): { found: boolean; intent: string; notBefore: Date; dueAt: Date | null } {
  const found = DEADLINE_PATTERNS.some(p => p.test(message))
  if (!found) return { found: false, intent: '', notBefore: new Date(), dueAt: null }

  // Intent = first 200 chars of the message (captures the full idea)
  const intent = message.slice(0, 200).trim()

  // Try to extract a specific date
  let dueAt: Date | null = null
  const now = new Date()

  // Day-of-week deadline detection
  const dayMatch = message.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)
  if (dayMatch) {
    const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
    const targetDay = dayNames.indexOf(dayMatch[1].toLowerCase())
    if (targetDay >= 0) {
      const d = new Date(now)
      const currentDay = d.getDay()
      const daysUntil = (targetDay - currentDay + 7) % 7 || 7
      d.setDate(d.getDate() + daysUntil)
      d.setHours(9, 0, 0, 0) // 9am on target day
      dueAt = d
    }
  }

  // Default: surface in 3 days if no specific deadline found
  const notBefore = new Date(now.getTime() + (dueAt ? 0 : 3 * 24 * 60 * 60 * 1000))

  return { found, intent, notBefore, dueAt }
}

// ── Save a deferred intent ────────────────────────────────────────────────────
export async function saveDeferredIntent(
  userId: string,
  intent: string,
  sourceMsg: string,
  notBefore: Date,
  dueAt?: Date | null
): Promise<void> {
  try {
    await ensureDeferredIntentsSchema()
    await query(
      `INSERT INTO sparkie_deferred_intents (user_id, intent, source_msg, not_before, due_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, intent, sourceMsg.slice(0, 500), notBefore.toISOString(), dueAt?.toISOString() ?? null]
    )
  } catch { /* non-fatal */ }
}

// ── Load ready deferred intents (not_before < NOW, status = pending) ──────────
export async function loadReadyDeferredIntents(userId: string): Promise<DeferredIntent[]> {
  try {
    await ensureDeferredIntentsSchema()
    const res = await query<{
      id: string; user_id: string; intent: string; source_msg: string;
      not_before: Date; due_at: Date | null; status: string; created_at: Date
    }>(
      `SELECT * FROM sparkie_deferred_intents
       WHERE user_id = $1 AND status = 'pending' AND not_before <= NOW()
       ORDER BY COALESCE(due_at, not_before) ASC LIMIT 5`,
      [userId]
    )
    return res.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      intent: r.intent,
      sourceMsg: r.source_msg,
      notBefore: r.not_before,
      dueAt: r.due_at,
      status: r.status as DeferredIntent['status'],
      createdAt: r.created_at,
    }))
  } catch { return [] }
}

// ── Mark a deferred intent as surfaced ────────────────────────────────────────
export async function markDeferredIntentSurfaced(id: string): Promise<void> {
  try {
    await query(
      `UPDATE sparkie_deferred_intents SET status = 'surfaced', surfaced_at = NOW() WHERE id = $1`,
      [id]
    )
  } catch { /* non-fatal */ }
}

// ── Urgency score for a task (increases with age) ────────────────────────────
export function getUrgencyScore(createdAt: Date, basePriority = 1.0): number {
  const hoursSinceCreated = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60)
  return basePriority + hoursSinceCreated * 0.1
}

// ── Check if a memory/rule has expired ────────────────────────────────────────
export function isExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false
  return new Date() > expiresAt
}

// ── TTL presets for different memory types ────────────────────────────────────
export const TTL = {
  API_BEHAVIOR:    30 * 24 * 60 * 60 * 1000,   // 30 days
  PRICING:          7 * 24 * 60 * 60 * 1000,   // 7 days
  WORK_RULE:       90 * 24 * 60 * 60 * 1000,   // 90 days
  USER_PREFERENCE: null,                        // Never expires (until changed)
}

export function getTTLDate(type: keyof typeof TTL): Date | null {
  const ms = TTL[type]
  if (!ms) return null
  return new Date(Date.now() + ms)
}
