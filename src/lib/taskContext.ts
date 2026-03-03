import { query } from '@/lib/db'

// ── Schema ─────────────────────────────────────────────────────────────────────
async function ensureTaskContextSchema(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS sparkie_task_context (
      task_id           TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL,
      user_intent       TEXT NOT NULL DEFAULT '',
      confidence        FLOAT DEFAULT 0.8,
      approach          TEXT DEFAULT '',
      alternatives      JSONB DEFAULT '[]',
      side_observations JSONB DEFAULT '[]',
      step_index        INT DEFAULT 0,
      checkpoint_data   JSONB DEFAULT '{}',
      token_budget_used INT DEFAULT 0,
      started_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW(),
      completed_at      TIMESTAMPTZ
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS idx_task_context_user ON sparkie_task_context(user_id, started_at DESC)`)
}

export interface TaskContext {
  taskId: string
  userId: string
  userIntent: string
  confidence: number        // 0.0–1.0
  approach: string
  alternatives: string[]
  sideObservations: string[]
  stepIndex: number
  checkpointData: Record<string, unknown>
  tokenBudgetUsed: number
  startedAt: Date
}

// ── Create a new task context ─────────────────────────────────────────────────
export async function createTaskContext(
  taskId: string,
  userId: string,
  userIntent: string,
  confidence = 0.8
): Promise<void> {
  try {
    await ensureTaskContextSchema()
    await query(
      `INSERT INTO sparkie_task_context (task_id, user_id, user_intent, confidence)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (task_id) DO NOTHING`,
      [taskId, userId, userIntent, confidence]
    )
  } catch { /* non-fatal */ }
}

// ── Load task context ─────────────────────────────────────────────────────────
export async function loadTaskContext(taskId: string): Promise<TaskContext | null> {
  try {
    await ensureTaskContextSchema()
    const res = await query(
      `SELECT * FROM sparkie_task_context WHERE task_id = $1`,
      [taskId]
    )
    if (!res.rows[0]) return null
    const r = res.rows[0]
    return {
      taskId: r.task_id,
      userId: r.user_id,
      userIntent: r.user_intent,
      confidence: r.confidence,
      approach: r.approach,
      alternatives: r.alternatives ?? [],
      sideObservations: r.side_observations ?? [],
      stepIndex: r.step_index,
      checkpointData: r.checkpoint_data ?? {},
      tokenBudgetUsed: r.token_budget_used,
      startedAt: r.started_at,
    }
  } catch { return null }
}

// ── Update task context mid-task ──────────────────────────────────────────────
export async function updateTaskContext(
  taskId: string,
  updates: Partial<{
    approach: string
    confidence: number
    stepIndex: number
    tokenBudgetUsed: number
    checkpointData: Record<string, unknown>
  }>
): Promise<void> {
  try {
    const sets: string[] = ['updated_at = NOW()']
    const vals: unknown[] = []
    let paramIdx = 1

    if (updates.approach !== undefined)        { sets.push(`approach = $${paramIdx++}`); vals.push(updates.approach) }
    if (updates.confidence !== undefined)       { sets.push(`confidence = $${paramIdx++}`); vals.push(updates.confidence) }
    if (updates.stepIndex !== undefined)        { sets.push(`step_index = $${paramIdx++}`); vals.push(updates.stepIndex) }
    if (updates.tokenBudgetUsed !== undefined)  { sets.push(`token_budget_used = $${paramIdx++}`); vals.push(updates.tokenBudgetUsed) }
    if (updates.checkpointData !== undefined)   { sets.push(`checkpoint_data = $${paramIdx++}`); vals.push(JSON.stringify(updates.checkpointData)) }

    vals.push(taskId)
    await query(`UPDATE sparkie_task_context SET ${sets.join(', ')} WHERE task_id = $${paramIdx}`, vals)
  } catch { /* non-fatal */ }
}

// ── Add a side observation (queued for review after task completes) ───────────
export async function addSideObservation(taskId: string, observation: string): Promise<void> {
  try {
    await query(
      `UPDATE sparkie_task_context
       SET side_observations = side_observations || $1::jsonb, updated_at = NOW()
       WHERE task_id = $2`,
      [JSON.stringify([observation]), taskId]
    )
  } catch { /* non-fatal */ }
}

// ── Complete task context — write summary to memory ──────────────────────────
export async function completeTaskContext(taskId: string): Promise<TaskContext | null> {
  try {
    const ctx = await loadTaskContext(taskId)
    if (!ctx) return null
    await query(
      `UPDATE sparkie_task_context SET completed_at = NOW() WHERE task_id = $1`,
      [taskId]
    )
    return ctx
  } catch { return null }
}

// ── Format task context for prompt injection ──────────────────────────────────
export function formatTaskContextBlock(ctx: TaskContext): string {
  const lines: string[] = [
    `## CURRENT TASK CONTEXT`,
    `Intent: ${ctx.userIntent}`,
    `Confidence: ${Math.round(ctx.confidence * 100)}%`,
    `Step: ${ctx.stepIndex}`,
  ]
  if (ctx.approach) lines.push(`Approach: ${ctx.approach}`)
  if (ctx.alternatives.length > 0) lines.push(`Alternatives considered: ${ctx.alternatives.join('; ')}`)
  if (ctx.sideObservations.length > 0) lines.push(`Side observations queued: ${ctx.sideObservations.join('; ')}`)
  if (ctx.tokenBudgetUsed > 3000) lines.push(`Token budget used: ${ctx.tokenBudgetUsed} — compress if growing`)
  return lines.join('\n')
}
