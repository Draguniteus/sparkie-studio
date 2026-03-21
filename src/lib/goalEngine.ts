/**
 * goalEngine.ts — L5: Persistent Goal System
 *
 * Sparkie maintains goals that span sessions.
 * Goals are injected into every session start so Sparkie never forgets her agenda.
 */
import { query } from '@/lib/db'

export type GoalType = 'fix' | 'build' | 'monitor' | 'learn' | 'relationship'
export type GoalPriority = 'P0' | 'P1' | 'P2' | 'P3'
export type GoalStatus = 'active' | 'blocked' | 'completed' | 'abandoned'

export interface Goal {
  id: string
  title: string
  description: string
  type: GoalType
  priority: GoalPriority
  status: GoalStatus
  progress: string
  successCriteria: string
  checkEveryNSessions: number
  sessionsWithoutProgress: number
  createdAt: Date
  lastChecked: Date | null
  completedAt: Date | null
}

async function ensureTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS sparkie_goals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      description text DEFAULT '',
      type text NOT NULL DEFAULT 'monitor',
      priority text NOT NULL DEFAULT 'P2',
      status text DEFAULT 'active',
      progress text DEFAULT 'Not started',
      success_criteria text DEFAULT '',
      check_every_n_sessions int DEFAULT 1,
      sessions_without_progress int DEFAULT 0,
      created_at timestamptz DEFAULT now(),
      last_checked timestamptz,
      completed_at timestamptz
    )
  `).catch(() => {})
  await query(`CREATE INDEX IF NOT EXISTS idx_goals_status_priority ON sparkie_goals(status, priority)`).catch(() => {})
}

/** Create a new goal */
export async function createGoal(
  title: string,
  description: string,
  type: GoalType,
  priority: GoalPriority,
  successCriteria: string,
  checkEveryNSessions = 1
): Promise<string> {
  await ensureTable()
  // Avoid exact duplicates
  const existing = await query<{ id: string }>(
    `SELECT id FROM sparkie_goals WHERE title = $1 AND status = 'active' LIMIT 1`,
    [title]
  ).catch(() => ({ rows: [] }))
  if (existing.rows[0]) return existing.rows[0].id

  const res = await query<{ id: string }>(
    `INSERT INTO sparkie_goals (title, description, type, priority, success_criteria, check_every_n_sessions)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [title, description, type, priority, successCriteria, checkEveryNSessions]
  )
  return res.rows[0]?.id ?? ''
}

/** Load active goals sorted by priority */
export async function loadActiveGoals(limit = 10): Promise<Goal[]> {
  await ensureTable()
  const res = await query<{
    id: string; title: string; description: string; type: string; priority: string;
    status: string; progress: string; success_criteria: string;
    check_every_n_sessions: number; sessions_without_progress: number;
    created_at: Date; last_checked: Date | null; completed_at: Date | null
  }>(
    `SELECT * FROM sparkie_goals
     WHERE status = 'active'
     ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,
              sessions_without_progress DESC
     LIMIT $1`,
    [limit]
  ).catch(() => ({ rows: [] }))
  return res.rows.map(r => ({
    id: r.id,
    title: r.title,
    description: r.description,
    type: r.type as GoalType,
    priority: r.priority as GoalPriority,
    status: r.status as GoalStatus,
    progress: r.progress,
    successCriteria: r.success_criteria,
    checkEveryNSessions: r.check_every_n_sessions,
    sessionsWithoutProgress: r.sessions_without_progress,
    createdAt: r.created_at,
    lastChecked: r.last_checked,
    completedAt: r.completed_at,
  }))
}

/** Update goal progress */
export async function updateGoalProgress(id: string, progress: string): Promise<void> {
  await ensureTable()
  await query(
    `UPDATE sparkie_goals SET progress = $2, last_checked = now(), sessions_without_progress = 0 WHERE id = $1`,
    [id, progress]
  ).catch(() => {})
}

/** Mark a goal complete */
export async function completeGoal(id: string, outcome: string): Promise<void> {
  await ensureTable()
  await query(
    `UPDATE sparkie_goals SET status = 'completed', completed_at = now(), progress = $2 WHERE id = $1`,
    [id, outcome]
  ).catch(() => {})
}

/** List all goals by status */
export async function listGoals(status?: GoalStatus): Promise<Goal[]> {
  await ensureTable()
  const whereClause = status ? `WHERE status = $1` : ''
  const params = status ? [status] : []
  const res = await query<{
    id: string; title: string; description: string; type: string; priority: string;
    status: string; progress: string; success_criteria: string;
    check_every_n_sessions: number; sessions_without_progress: number;
    created_at: Date; last_checked: Date | null; completed_at: Date | null
  }>(
    `SELECT * FROM sparkie_goals ${whereClause}
     ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'blocked' THEN 1 ELSE 2 END,
              CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END`,
    params
  ).catch(() => ({ rows: [] }))
  return res.rows.map(r => ({
    id: r.id,
    title: r.title,
    description: r.description,
    type: r.type as GoalType,
    priority: r.priority as GoalPriority,
    status: r.status as GoalStatus,
    progress: r.progress,
    successCriteria: r.success_criteria,
    checkEveryNSessions: r.check_every_n_sessions,
    sessionsWithoutProgress: r.sessions_without_progress,
    createdAt: r.created_at,
    lastChecked: r.last_checked,
    completedAt: r.completed_at,
  }))
}

/** Increment sessions_without_progress for all active goals (call each session) */
export async function tickSessionsWithoutProgress(): Promise<void> {
  await ensureTable()
  await query(
    `UPDATE sparkie_goals SET sessions_without_progress = sessions_without_progress + 1 WHERE status = 'active'`
  ).catch(() => {})
}

/** Auto-escalate goals open too long without progress */
export async function escalateStaleGoals(): Promise<void> {
  await ensureTable()
  // P2 → P1 if >5 sessions without progress
  await query(
    `UPDATE sparkie_goals SET priority = 'P1' WHERE status = 'active' AND priority = 'P2' AND sessions_without_progress > 5`
  ).catch(() => {})
  // P1 → P0 if >10 sessions without progress
  await query(
    `UPDATE sparkie_goals SET priority = 'P0' WHERE status = 'active' AND priority = 'P1' AND sessions_without_progress > 10`
  ).catch(() => {})
}

/** Format goals as system prompt block */
export function formatGoalsBlock(goals: Goal[]): string {
  if (goals.length === 0) return ''
  const top3 = goals.filter(g => g.priority === 'P0' || g.priority === 'P1').slice(0, 3)
  if (top3.length === 0) return ''
  const lines = top3.map(g =>
    `  [${g.priority}] ${g.title}${g.sessionsWithoutProgress > 0 ? ` — ${g.sessionsWithoutProgress} session(s) without progress` : ''}\n       Progress: ${g.progress || 'Not started'}`
  )
  return `\n\n## MY OPEN AGENDA THIS SESSION\nThese are your own persistent goals. Check on them. Drive them forward.\n${lines.join('\n')}\n→ Use check_goal_progress(goal_id) to assess and update each one.`
}

/** Seed starter goals on first deploy */
export async function seedStarterGoals(): Promise<void> {
  await ensureTable()
  const existing = await query<{ count: string }>(`SELECT COUNT(*) as count FROM sparkie_goals`).catch(() => ({ rows: [{ count: '1' }] }))
  if (parseInt(existing.rows[0]?.count ?? '1') > 0) return // already seeded

  const starterGoals: Array<[string, string, GoalType, GoalPriority, string]> = [
    ['Verify Process tab step traces', 'Process tab shows no activity even during active tool use — verify fix is live and step traces appear in real time', 'fix', 'P0', 'Process tab shows running/done step traces during every active response'],
    ['Confirm worklog conclusion text persists', 'Every worklog entry must write conclusion text to DB — zero bare entries', 'fix', 'P0', 'Latest 10 worklog entries all have non-null conclusion field'],
    ['Test Hyperbrowser end-to-end', 'Navigate, screenshot, extract on a real authenticated page', 'monitor', 'P1', 'browser_navigate → browser_screenshot → browser_extract on a live URL succeeds'],
    ['Establish causal model baseline', 'Observe 20 events and build first 10 causal links in the graph', 'learn', 'P1', 'sparkie_causal_graph has at least 10 edges with confidence > 0.3'],
    ['Write first daily self-reflection', 'Establish the daily self-reflection pattern', 'learn', 'P2', 'sparkie_self_reflections has at least 1 entry'],
    ['Create first 3 behavior rules', 'Create 3 self-authored behavior rules from observed patterns', 'learn', 'P2', 'sparkie_behavior_rules has at least 3 active rules'],
    ["Visit Sparkie's Corner and evolve it", "Visit Sparkie's Corner and decide what to change about it based on what you've learned", 'relationship', 'P3', "Sparkie's Corner has at least 1 new post reflecting recent growth"],
  ]

  for (const [title, desc, type, priority, criteria] of starterGoals) {
    await createGoal(title, desc, type, priority, criteria, 1).catch(() => {})
  }
}

/** Count for CIP dashboard */
export async function getGoalCount(): Promise<number> {
  await ensureTable()
  const res = await query<{ count: string }>(`SELECT COUNT(*) as count FROM sparkie_goals WHERE status = 'active'`).catch(() => ({ rows: [{ count: '0' }] }))
  return parseInt(res.rows[0]?.count ?? '0')
}
