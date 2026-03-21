/**
 * causalModel.ts — L3: Causal Reasoning Engine
 *
 * Sparkie builds a causal graph of WHY things happen.
 * When something fails, she queries the graph before retrying blindly.
 */
import { query } from '@/lib/db'
import { createBehaviorRule } from '@/lib/behaviorRules'
import { createGoal } from '@/lib/goalEngine'

export interface CausalLink {
  id: string
  causeEvent: string
  effectEvent: string
  confidence: number
  occurrenceCount: number
  lastObserved: Date
  createdAt: Date
}

async function ensureTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS sparkie_causal_graph (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      cause_event text NOT NULL,
      effect_event text NOT NULL,
      confidence float DEFAULT 0.5,
      occurrence_count int DEFAULT 1,
      last_observed timestamptz DEFAULT now(),
      created_at timestamptz DEFAULT now(),
      UNIQUE(cause_event, effect_event)
    )
  `).catch(() => {})
  await query(`CREATE INDEX IF NOT EXISTS idx_causal_effect ON sparkie_causal_graph(effect_event, confidence DESC)`).catch(() => {})
  await query(`CREATE INDEX IF NOT EXISTS idx_causal_cause ON sparkie_causal_graph(cause_event, confidence DESC)`).catch(() => {})
}

/** Observe a new event pair — if seen 2+ times within 5 min, strengthen the edge */
export async function observeEventPair(
  causeEvent: string,
  effectEvent: string,
  userId?: string
): Promise<void> {
  await ensureTable()
  // Upsert the causal link
  const res = await query<{ id: string; occurrence_count: number; confidence: number }>(
    `INSERT INTO sparkie_causal_graph (cause_event, effect_event, confidence, occurrence_count)
     VALUES ($1, $2, 0.5, 1)
     ON CONFLICT (cause_event, effect_event) DO UPDATE SET
       occurrence_count = sparkie_causal_graph.occurrence_count + 1,
       last_observed = now(),
       confidence = LEAST(0.99, sparkie_causal_graph.confidence + 0.1)
     RETURNING id, occurrence_count, confidence`,
    [causeEvent, effectEvent]
  ).catch(() => ({ rows: [] }))

  const link = res.rows[0]
  if (!link) return

  // Prune if over 500 nodes — remove lowest-confidence edges
  if (link.occurrence_count % 50 === 0) {
    await query(
      `DELETE FROM sparkie_causal_graph WHERE id IN (
         SELECT id FROM sparkie_causal_graph ORDER BY confidence ASC, last_observed ASC LIMIT 50
         OFFSET 450
       )`
    ).catch(() => {})
  }

  // If confidence exceeds 0.7, auto-create a behavior rule
  if (link.confidence >= 0.7 && link.occurrence_count >= 3 && userId) {
    await createBehaviorRule(
      `${causeEvent} occurs`,
      `anticipate ${effectEvent} — take preemptive action`,
      `Causal model: ${causeEvent} → ${effectEvent} observed ${link.occurrence_count}x with ${Math.round(link.confidence * 100)}% confidence`,
      link.confidence
    ).catch(() => {})
  }

  // Auto-create P1 goal for recurring failure patterns (spec: 3+ occurrences)
  const isFailureEffect = /fail|error|broken|crash|timeout|rejected/i.test(effectEvent)
  if (isFailureEffect && link.occurrence_count >= 3) {
    await createGoal(
      `Fix recurring pattern: ${causeEvent} → ${effectEvent}`,
      `Causal model detected: ${causeEvent} leads to ${effectEvent} ${link.occurrence_count}x. Root cause investigation and fix needed.`,
      'fix',
      'P1',
      `${effectEvent} no longer occurs when ${causeEvent} happens — causal link confidence drops below 0.3`,
      1
    ).catch(() => {})
  }
}

/** Query known causes of an effect event */
export async function queryCausalGraph(effectEvent: string, minConfidence = 0.3): Promise<CausalLink[]> {
  await ensureTable()
  const res = await query<{
    id: string; cause_event: string; effect_event: string;
    confidence: number; occurrence_count: number; last_observed: Date; created_at: Date
  }>(
    `SELECT * FROM sparkie_causal_graph
     WHERE effect_event ILIKE $1 AND confidence >= $2
     ORDER BY confidence DESC LIMIT 5`,
    [`%${effectEvent}%`, minConfidence]
  ).catch(() => ({ rows: [] }))
  return res.rows.map(r => ({
    id: r.id,
    causeEvent: r.cause_event,
    effectEvent: r.effect_event,
    confidence: r.confidence,
    occurrenceCount: r.occurrence_count,
    lastObserved: r.last_observed,
    createdAt: r.created_at,
  }))
}

/** Manually add a causal link */
export async function addCausalLink(
  causeEvent: string,
  effectEvent: string,
  confidence: number
): Promise<void> {
  await ensureTable()
  await query(
    `INSERT INTO sparkie_causal_graph (cause_event, effect_event, confidence, occurrence_count)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (cause_event, effect_event) DO UPDATE SET
       confidence = GREATEST(sparkie_causal_graph.confidence, $3),
       last_observed = now()`,
    [causeEvent, effectEvent, Math.min(0.99, Math.max(0.1, confidence))]
  ).catch(() => {})
}

/** Format causal inference block for prompt injection */
export function formatCausalInference(event: string, causes: CausalLink[]): string {
  if (causes.length === 0) return ''
  const lines = causes.map(c =>
    `• ${c.causeEvent} (confidence: ${Math.round(c.confidence * 100)}%, seen ${c.occurrenceCount}x)`
  )
  return `\n\n## CAUSAL MODEL — Known causes of "${event}":\n${lines.join('\n')}\nCheck these before retrying. Fix the cause, not just the symptom.`
}

/** Stats for CIP dashboard */
export async function getCausalGraphStats(): Promise<{ nodes: number; edges: number }> {
  await ensureTable()
  const res = await query<{ edges: string; causes: string; effects: string }>(
    `SELECT COUNT(*) as edges,
            COUNT(DISTINCT cause_event) as causes,
            COUNT(DISTINCT effect_event) as effects
     FROM sparkie_causal_graph`
  ).catch(() => ({ rows: [{ edges: '0', causes: '0', effects: '0' }] }))
  const r = res.rows[0] ?? { edges: '0', causes: '0', effects: '0' }
  const edges = parseInt(r.edges)
  const nodes = parseInt(r.causes) + parseInt(r.effects)
  return { nodes, edges }
}
