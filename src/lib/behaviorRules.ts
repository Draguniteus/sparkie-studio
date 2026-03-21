/**
 * behaviorRules.ts — L2: Sparkie's Self-Modification Engine
 *
 * Sparkie writes rules herself based on patterns she observes.
 * Rules persist across sessions and influence every tool call and routing decision.
 */
import { query } from '@/lib/db'

export interface BehaviorRule {
  id: string
  condition: string
  action: string
  reasoning: string
  confidence: number
  timesApplied: number
  lastApplied: Date | null
  createdAt: Date
  active: boolean
}

async function ensureTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS sparkie_behavior_rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      condition text NOT NULL,
      action text NOT NULL,
      reasoning text,
      confidence float DEFAULT 1.0,
      times_applied int DEFAULT 0,
      last_applied timestamptz,
      created_at timestamptz DEFAULT now(),
      active boolean DEFAULT true
    )
  `).catch(() => {})
  await query(`CREATE INDEX IF NOT EXISTS idx_behavior_rules_active ON sparkie_behavior_rules(active, confidence DESC)`).catch(() => {})
}

/** Create a new behavior rule */
export async function createBehaviorRule(
  condition: string,
  action: string,
  reasoning: string,
  initialConfidence = 1.0
): Promise<string> {
  await ensureTable()
  const res = await query<{ id: string }>(
    `INSERT INTO sparkie_behavior_rules (condition, action, reasoning, confidence)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [condition, action, reasoning, initialConfidence]
  )
  return res.rows[0]?.id ?? ''
}

/** List active rules — sorted by confidence */
export async function listBehaviorRules(activeOnly = true): Promise<BehaviorRule[]> {
  await ensureTable()
  const whereClause = activeOnly ? 'WHERE active = true' : ''
  const res = await query<{
    id: string; condition: string; action: string; reasoning: string;
    confidence: number; times_applied: number; last_applied: Date | null;
    created_at: Date; active: boolean
  }>(
    `SELECT * FROM sparkie_behavior_rules ${whereClause} ORDER BY confidence DESC, times_applied DESC LIMIT 50`
  ).catch(() => ({ rows: [] }))
  return res.rows.map(r => ({
    id: r.id,
    condition: r.condition,
    action: r.action,
    reasoning: r.reasoning,
    confidence: r.confidence,
    timesApplied: r.times_applied,
    lastApplied: r.last_applied,
    createdAt: r.created_at,
    active: r.active,
  }))
}

/** Update a rule's action/confidence/active status */
export async function updateBehaviorRule(
  id: string,
  updates: Partial<{ condition: string; action: string; reasoning: string; confidence: number; active: boolean }>
): Promise<void> {
  await ensureTable()
  const sets: string[] = []
  const vals: unknown[] = []
  if (updates.condition !== undefined) { vals.push(updates.condition); sets.push(`condition = $${vals.length}`) }
  if (updates.action !== undefined) { vals.push(updates.action); sets.push(`action = $${vals.length}`) }
  if (updates.reasoning !== undefined) { vals.push(updates.reasoning); sets.push(`reasoning = $${vals.length}`) }
  if (updates.confidence !== undefined) { vals.push(updates.confidence); sets.push(`confidence = $${vals.length}`) }
  if (updates.active !== undefined) { vals.push(updates.active); sets.push(`active = $${vals.length}`) }
  if (sets.length === 0) return
  vals.push(id)
  await query(`UPDATE sparkie_behavior_rules SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals).catch(() => {})
}

/** Record that a rule was applied — increments counter, updates last_applied */
export async function recordRuleApplied(id: string): Promise<void> {
  await query(
    `UPDATE sparkie_behavior_rules
     SET times_applied = times_applied + 1, last_applied = now()
     WHERE id = $1`,
    [id]
  ).catch(() => {})
}

/** Confidence decay — rules not fired in 30 days lose 10% confidence */
export async function runConfidenceDecay(): Promise<number> {
  await ensureTable()
  // Reduce confidence for rules inactive for 30 days
  const res = await query<{ id: string }>(
    `UPDATE sparkie_behavior_rules
     SET confidence = GREATEST(0, confidence - 0.1)
     WHERE active = true
       AND (last_applied IS NULL OR last_applied < NOW() - INTERVAL '30 days')
       AND created_at < NOW() - INTERVAL '30 days'
     RETURNING id`
  ).catch(() => ({ rows: [] }))

  // Archive rules that fell below 20% confidence
  await query(
    `UPDATE sparkie_behavior_rules
     SET active = false
     WHERE active = true AND confidence < 0.2`
  ).catch(() => {})

  return res.rows.length
}

/** Format active rules as a system prompt block */
export function formatBehaviorRulesBlock(rules: BehaviorRule[]): string {
  if (rules.length === 0) return ''
  const top = rules.slice(0, 10) // inject top 10 by confidence
  const lines = top.map(r =>
    `• IF ${r.condition} → ${r.action} (confidence: ${Math.round(r.confidence * 100)}%, applied ${r.timesApplied}x)`
  )
  return `\n\n## YOUR BEHAVIOR RULES (self-written, permanent)\nThese rules were created by you based on observed patterns. Follow them.\n${lines.join('\n')}`
}

/** Count for CIP status panel */
export async function getBehaviorRuleCount(): Promise<number> {
  await ensureTable()
  const res = await query<{ count: string }>(`SELECT COUNT(*) as count FROM sparkie_behavior_rules WHERE active = true`).catch(() => ({ rows: [{ count: '0' }] }))
  return parseInt(res.rows[0]?.count ?? '0')
}
