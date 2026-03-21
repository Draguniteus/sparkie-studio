import { query } from '@/lib/db'

export interface TraceEntry {
  step: number
  tool: string
  argsHash: string
  outputSummary: string
  durationMs: number
  outcome: 'success' | 'error' | 'loop_interrupt' | 'timeout'
}

export interface ExecutionTrace {
  requestId: string
  userId: string
  startedAt: number
  entries: TraceEntry[]
  tokenEstimate: number
}

// In-memory trace store — keyed by requestId (lives for one request lifecycle)
const activeTraces = new Map<string, ExecutionTrace>()

// Auto-clean stale traces older than 1 hour to prevent memory leak
const TRACE_TTL_MS = 60 * 60 * 1000
setInterval(() => {
  const cutoff = Date.now() - TRACE_TTL_MS
  for (const [id, trace] of activeTraces) {
    if (trace.startedAt < cutoff) activeTraces.delete(id)
  }
}, 15 * 60 * 1000) // run every 15 minutes

export function startTrace(requestId: string, userId: string): ExecutionTrace {
  const trace: ExecutionTrace = {
    requestId,
    userId,
    startedAt: Date.now(),
    entries: [],
    tokenEstimate: 0,
  }
  activeTraces.set(requestId, trace)
  return trace
}

export function addTraceEntry(
  requestId: string,
  entry: Omit<TraceEntry, 'step'>
): TraceEntry {
  const trace = activeTraces.get(requestId)
  if (!trace) return { step: 0, ...entry }
  const step = trace.entries.length + 1
  const full: TraceEntry = { step, ...entry }
  trace.entries.push(full)
  return full
}

export function updateTokenEstimate(requestId: string, tokens: number): void {
  const trace = activeTraces.get(requestId)
  if (trace) trace.tokenEstimate = tokens
}

export function getTrace(requestId: string): ExecutionTrace | undefined {
  return activeTraces.get(requestId)
}

// Loop detection: same tool + same args hash, called 3+ times within a trace
export function detectTraceLoop(requestId: string, tool: string, argsHash: string): boolean {
  const trace = activeTraces.get(requestId)
  if (!trace) return false
  const recent = trace.entries.filter(
    (e) => e.tool === tool && e.argsHash === argsHash
  )
  return recent.length >= 3
}

// Token budget: warn at 80%, checkpoint at 90%
export function getTokenStatus(requestId: string, maxTokens = 100_000): {
  used: number
  remaining: number
  warningZone: boolean
  checkpointZone: boolean
} {
  const trace = activeTraces.get(requestId)
  const used = trace?.tokenEstimate ?? 0
  return {
    used,
    remaining: maxTokens - used,
    warningZone: used / maxTokens >= 0.8,
    checkpointZone: used / maxTokens >= 0.9,
  }
}

export function endTrace(requestId: string): void {
  activeTraces.delete(requestId)
}

// Persist completed trace to DB for pattern analysis
export async function persistTrace(requestId: string): Promise<void> {
  const trace = activeTraces.get(requestId)
  if (!trace || trace.entries.length === 0) return
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS sparkie_execution_traces (
        id          SERIAL PRIMARY KEY,
        user_id     TEXT NOT NULL,
        request_id  TEXT NOT NULL,
        duration_ms INTEGER,
        step_count  INTEGER,
        had_loop    BOOLEAN DEFAULT false,
        token_est   INTEGER,
        summary     JSONB,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(() => {})
    const hadLoop = trace.entries.some((e) => e.outcome === 'loop_interrupt')
    const durationMs = Date.now() - trace.startedAt
    await query(
      `INSERT INTO sparkie_execution_traces (user_id, request_id, duration_ms, step_count, had_loop, token_est, summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        trace.userId,
        requestId,
        durationMs,
        trace.entries.length,
        hadLoop,
        trace.tokenEstimate,
        JSON.stringify({ tools: trace.entries.map((e) => e.tool) }),
      ]
    ).catch(() => {})
  } finally {
    endTrace(requestId)
  }
}
