/**
 * signalQueue.ts
 * Phase 1: Signal priority queue.
 * 
 * Every inbound signal (email, task result, informational) gets a priority tier
 * before processing. P0 preempts everything. Stale signals are discarded.
 *
 * Tiers:
 *   P0 — Production alerts (DO deployment failed, server down, security) → preempts
 *   P1 — User messages → always next after P0
 *   P2 — Task completions, tool results → after P1
 *   P3 — Informational (email digests, social notifications) → batched, lowest
 *
 * Each P2/P3 signal has a stale_after window. If it reaches front of queue after
 * expiry, it's logged as expired and skipped.
 */

export type SignalPriority = 'P0' | 'P1' | 'P2' | 'P3'
export type SignalType = 'deploy_alert' | 'server_down' | 'security_alert' | 'user_message' | 'task_complete' | 'tool_result' | 'email_digest' | 'social_notification' | 'inbox_check' | 'calendar_event' | 'generic'

export interface Signal {
  id: string
  type: SignalType
  priority: SignalPriority
  payload: Record<string, unknown>
  created_at: number  // ms timestamp
  stale_after: number // ms timestamp — discard if not processed by then
  userId: string
}

// Stale windows by priority
const STALE_WINDOWS: Record<SignalPriority, number> = {
  P0: 30 * 60 * 1000,   // 30 minutes — production alerts always relevant
  P1: 0,                 // never stale — user messages always processed
  P2: 10 * 60 * 1000,   // 10 minutes
  P3: 60 * 60 * 1000,   // 1 hour
}

// Priority by signal type
const TYPE_PRIORITY: Record<SignalType, SignalPriority> = {
  deploy_alert: 'P0',
  server_down: 'P0',
  security_alert: 'P0',
  user_message: 'P1',
  task_complete: 'P2',
  tool_result: 'P2',
  inbox_check: 'P2',
  calendar_event: 'P2',
  email_digest: 'P3',
  social_notification: 'P3',
  generic: 'P3',
}

/** Create a new signal with correct priority and stale window */
export function createSignal(
  userId: string,
  type: SignalType,
  payload: Record<string, unknown>,
  overridePriority?: SignalPriority
): Signal {
  const priority = overridePriority ?? TYPE_PRIORITY[type] ?? 'P3'
  const now = Date.now()
  const window = STALE_WINDOWS[priority]
  return {
    id: crypto.randomUUID(),
    type,
    priority,
    payload,
    userId,
    created_at: now,
    stale_after: window === 0 ? Number.MAX_SAFE_INTEGER : now + window,
  }
}

/** Returns true if signal is still fresh and should be processed */
export function isSignalFresh(signal: Signal): boolean {
  return Date.now() < signal.stale_after
}

/** Classify an agent heartbeat result by priority */
export function classifyHeartbeatSignal(
  type: string,
  payload: Record<string, unknown>
): SignalPriority {
  // P0: production failure patterns
  if (type === 'deploy_failed' || 
      (typeof payload.subject === 'string' && /failed|down|error|critical|alert/i.test(payload.subject)) ||
      type === 'server_health_critical') {
    return 'P0'
  }
  // P1: direct user interaction
  if (type === 'user_message' || type === 'user_voice') return 'P1'
  // P2: actionable results
  if (['task_complete', 'tool_result', 'inbox_check', 'calendar_conflict'].includes(type)) return 'P2'
  // P3: everything else
  return 'P3'
}

/** Sort signals by priority (P0 first, P3 last) */
export function sortSignals(signals: Signal[]): Signal[] {
  const order: Record<SignalPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }
  return signals.sort((a, b) => order[a.priority] - order[b.priority] || a.created_at - b.created_at)
}

/**
 * Classify how an incoming signal impacts the current work context.
 * Used by the agent sweep loop to decide whether to proceed, skip, or replan.
 */
export type SignalImpact = 'supplement' | 'invalidate' | 'modify' | 'cancel' | 'unrelated'

export function classifySignalImpact(signal: Signal, currentWorkContext: string): SignalImpact {
  if (signal.type === 'user_message') {
    const content = (signal.payload.content as string) ?? ''
    if (/\b(cancel|stop|nevermind|forget it)\b/i.test(content)) return 'cancel'
    if (/\b(change|update|instead|actually)\b/i.test(content)) return 'modify'
  }
  if (signal.type === 'email_digest' && currentWorkContext.includes('waiting_for_reply')) {
    return 'invalidate'
  }
  if (signal.payload.topicId && currentWorkContext.includes(signal.payload.topicId as string)) {
    return 'supplement'
  }
  return 'unrelated'
}
