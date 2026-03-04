"use client"

import { useEffect, useRef, useState } from "react"
import { useAppStore, WorklogEntry } from "@/store/appStore"
import { Brain, Loader2, Mail, MessageSquare, Send, Activity, Eye } from "lucide-react"

function formatTime(ts: Date | number | string | undefined) {
  if (!ts) return ""
  const d = ts instanceof Date ? ts : new Date(ts as string | number)
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

// ── Timeline node color per entry type ──────────────────────────────────────
function getNodeStyle(type: string, status?: string, decisionType?: string) {
  if (status === "anomaly" || status === "error") return "bg-red-500 shadow-red-500/40"
  if (status === "blocked")   return "bg-yellow-500 shadow-yellow-500/40"
  if (status === "running")   return "bg-amber-400 shadow-amber-400/40 animate-pulse"
  if (decisionType === "proactive") return "bg-amber-400 shadow-amber-400/40"
  if (decisionType === "skip")      return "bg-slate-600"
  const map: Record<string, string> = {
    memory_learned:  "bg-purple-500 shadow-purple-500/40",
    memory_updated:  "bg-purple-500 shadow-purple-500/40",
    self_assessment: "bg-amber-400 shadow-amber-400/40",
    proactive_check: "bg-amber-400 shadow-amber-400/40",
    code_push:       "bg-blue-500 shadow-blue-500/40",
    email_processed: "bg-blue-400 shadow-blue-400/40",
    email_skipped:   "bg-slate-500",
    tool_call:       "bg-amber-500/70",
    decision:        "bg-amber-500/70",
    task_executed:   "bg-emerald-500 shadow-emerald-500/40",
    result:          "bg-emerald-500 shadow-emerald-500/40",
    ai_response:     "bg-purple-400 shadow-purple-400/40",
    message_batch:   "bg-blue-400 shadow-blue-400/40",
    heartbeat:       "bg-slate-500",
  }
  return map[type] ?? "bg-slate-500"
}

// ── Pill badge for context (like SureThing's topic pills) ───────────────────
function ContextPill({ label, color = "amber" }: { label: string; color?: "amber"|"blue"|"purple"|"red"|"green" }) {
  const colors = {
    amber:  "bg-amber-500/15 text-amber-300 border-amber-500/30",
    blue:   "bg-blue-500/15 text-blue-300 border-blue-500/30",
    purple: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    red:    "bg-red-500/15 text-red-300 border-red-500/30",
    green:  "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  }
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium ${colors[color]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  )
}

// ── Memory / learning card ───────────────────────────────────────────────────
function MemoryTimelineEntry({ entry }: { entry: WorklogEntry }) {
  const isNew = (Date.now() - new Date((entry.created_at ?? entry.timestamp) as string | Date).getTime()) < 86_400_000
  const label = isNew ? "I've learned something new:" : "I already knew this:"
  const tagLabel = isNew ? "Work Rule" : "Profile"
  const tagColor = isNew ? "purple" : "blue"
  return (
    <div className="pl-3 py-0.5">
      <p className="text-[10px] text-text-muted mb-1.5 flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${isNew ? "bg-purple-400" : "bg-blue-400"}`} />
        {label}
      </p>
      <div className={`rounded-xl border p-3 ${isNew
        ? "bg-gradient-to-br from-purple-900/30 to-purple-950/50 border-purple-500/25"
        : "bg-gradient-to-br from-blue-900/25 to-blue-950/40 border-blue-500/20"
      }`}>
        <div className="flex items-start gap-2">
          <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isNew ? "bg-purple-600/25" : "bg-blue-600/25"}`}>
            <Brain size={11} className={isNew ? "text-purple-300" : "text-blue-300"} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-text-secondary leading-relaxed break-words">{entry.content}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <ContextPill label={tagLabel} color={tagColor} />
              <span className="text-[9px] text-text-muted">{formatTime(entry.created_at ?? entry.timestamp)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── AI inner monologue / reasoning quote ────────────────────────────────────
function MonologueEntry({ entry }: { entry: WorklogEntry }) {
  return (
    <div className="pl-3 py-0.5">
      <div className="rounded-xl border border-blue-500/15 bg-gradient-to-br from-blue-900/15 to-slate-950/30 p-3">
        <div className="flex items-start gap-2">
          <span className="text-blue-400/60 text-lg leading-none mt-0.5 shrink-0">"</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-text-secondary leading-relaxed italic break-words">{entry.content}</p>
            {entry.reasoning && (
              <p className="text-[10px] text-text-muted mt-1 leading-relaxed italic opacity-70">{entry.reasoning}</p>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[9px] text-text-muted">{formatTime(entry.created_at ?? entry.timestamp)}</span>
              <span className="text-[10px] text-blue-300/70 flex items-center gap-1"><Eye size={9} /> Updated what I knew.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Proactive check entry ────────────────────────────────────────────────────
function ProactiveEntry({ entry }: { entry: WorklogEntry }) {
  return (
    <div className="pl-3 py-0.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-text-muted">Proactive check:</span>
        <ContextPill label={entry.content.length > 40 ? entry.content.slice(0, 40) + "…" : entry.content} color="amber" />
        <span className="text-[10px] text-text-muted">{formatTime(entry.created_at ?? entry.timestamp)}</span>
      </div>
    </div>
  )
}

// ── Email / deployment alert entry ──────────────────────────────────────────
function EmailEntry({ entry }: { entry: WorklogEntry }) {
  const isAlert = entry.content.toLowerCase().includes("deploy") || entry.content.toLowerCase().includes("failed")
  return (
    <div className="pl-3 py-0.5">
      <div className="flex items-center gap-2 flex-wrap">
        <Mail size={11} className={isAlert ? "text-red-400" : "text-blue-400"} />
        <span className="text-[11px] text-text-secondary">{entry.content.length > 60 ? entry.content.slice(0,60)+"…" : entry.content}</span>
        {!!(entry.metadata && (entry.metadata as Record<string,unknown>).from) ? (
          <ContextPill label={String((entry.metadata as Record<string,unknown>).from).split("<")[0].trim().slice(0,25)} color={isAlert ? "red" : "blue"} />
        ) : null}
        <span className="text-[10px] text-text-muted">{formatTime(entry.created_at ?? entry.timestamp)}</span>
      </div>
    </div>
  )
}

// ── Message sent / received entry ───────────────────────────────────────────
function MessageEntry({ entry, isSent }: { entry: WorklogEntry; isSent: boolean }) {
  return (
    <div className="pl-3 py-0.5">
      <div className="flex items-center gap-2 flex-wrap">
        {isSent ? <Send size={10} className="text-blue-400" /> : <MessageSquare size={10} className="text-slate-400" />}
        <span className="text-[11px] text-text-secondary">{isSent ? "I've sent you a message." : entry.content}</span>
        <span className="text-[10px] text-text-muted">{formatTime(entry.created_at ?? entry.timestamp)}</span>
      </div>
    </div>
  )
}

// ── Standard timeline entry (tool_call, code_push, result, error, etc.) ─────
function StandardEntry({ entry }: { entry: WorklogEntry }) {
  const isRunning = entry.status === "running"
  const duration = entry.actual_duration_ms ?? entry.duration

  const typeLabel: Record<string, string> = {
    tool_call: "Tool call", code_push: "Code push", result: "Result",
    error: "Error", task_executed: "Task done", decision: "Decision",
    heartbeat: "Heartbeat", auth_check: "Auth", thinking: "Thinking",
    action: "Executing", code: "Writing code", signal_skipped: "Skipped",
    hold: "Held", ai_response: "Response",
  }
  const label = typeLabel[entry.type] ?? entry.type.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")

  const textColors: Record<string, string> = {
    result:       "text-emerald-400",
    task_executed:"text-emerald-400",
    error:        "text-red-400",
    code_push:    "text-blue-400",
    tool_call:    "text-amber-300",
    decision:     "text-amber-300",
  }
  const tc = textColors[entry.type] ?? "text-text-secondary"

  return (
    <div className="pl-3 py-0.5">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${tc}`}>{label}</span>
            {entry.signal_priority && entry.signal_priority !== "P3" && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                entry.signal_priority === "P0" ? "bg-red-500/20 text-red-400 border border-red-500/40" :
                entry.signal_priority === "P1" ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" :
                "bg-blue-500/20 text-blue-300 border border-blue-500/40"
              }`}>{entry.signal_priority}</span>
            )}
            <span className="text-[10px] text-text-muted">{formatTime(entry.created_at ?? entry.timestamp)}</span>
            {duration != null && entry.status === "done" && (
              <span className="text-[10px] text-text-muted">{formatDuration(duration)}</span>
            )}
            {isRunning && <Loader2 size={9} className="animate-spin text-amber-400" />}
          </div>
          <p className="text-xs text-text-secondary mt-0.5 break-words leading-relaxed">
            {entry.content}
          </p>
          {entry.reasoning && (
            <p className="text-[10px] text-text-muted italic mt-1 pl-2 border-l border-white/10 leading-relaxed opacity-70">
              &ldquo;{entry.reasoning}&rdquo;
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Group entries by time bucket (for timestamp anchors) ────────────────────
function groupByTime(entries: WorklogEntry[]): Array<{ time: string; entries: WorklogEntry[] }> {
  const groups: Map<string, WorklogEntry[]> = new Map()
  for (const e of entries) {
    const ts = e.created_at ?? e.timestamp
    const t = ts ? new Date(ts as string | Date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""
    if (!groups.has(t)) groups.set(t, [])
    groups.get(t)!.push(e)
  }
  return Array.from(groups.entries()).map(([time, entries]) => ({ time, entries }))
}

interface WorklogProps {
  compact?: boolean
}

export function Worklog({ compact = false }: WorklogProps) {
  const { worklog, isExecuting, addWorklogEntry } = useAppStore()
  const [dbLoaded, setDbLoaded] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Merge DB worklog entries (newest first from API, oldest first in store for timeline)
  const mergeDbEntries = (entries: { type: string; content: string; status: string; created_at: string; decision_type?: string; reasoning?: string; metadata?: Record<string,unknown> }[]) => {
    const store = useAppStore.getState()
    const existingContents = new Set(store.worklog.map(w => w.content + String(w.created_at ?? w.timestamp)))
    // entries come newest-first from API; reverse so oldest go in first (timeline order)
    for (const e of [...entries].reverse()) {
      const key = e.content + e.created_at
      if (!existingContents.has(key)) {
        addWorklogEntry({
          type: e.type as WorklogEntry["type"],
          content: e.content,
          status: (e.status as unknown as WorklogEntry["status"]) ?? "done",
          decision_type: (e.decision_type as unknown as WorklogEntry["decision_type"]),
          reasoning: e.reasoning,
          metadata: e.metadata,
          created_at: e.created_at,
        })
        existingContents.add(key)
      }
    }
  }

  // Seed worklog from DB on mount — always merge, never skip
  useEffect(() => {
    if (dbLoaded) return
    fetch("/api/worklog?limit=30")
      .then(r => r.json())
      .then((d: { entries?: { type: string; content: string; status: string; created_at: string; decision_type?: string; reasoning?: string; metadata?: Record<string,unknown> }[] }) => {
        if (d.entries && d.entries.length > 0) mergeDbEntries(d.entries)
        setDbLoaded(true)
      })
      .catch(() => setDbLoaded(true))
  }, [dbLoaded, addWorklogEntry])

  // Poll DB every 30s to pick up background entries (scheduler, proactive sweeps, etc.)
  useEffect(() => {
    if (!dbLoaded) return
    const t = setInterval(() => {
      fetch("/api/worklog?limit=10")
        .then(r => r.json())
        .then((d: { entries?: { type: string; content: string; status: string; created_at: string; decision_type?: string; reasoning?: string; metadata?: Record<string,unknown> }[] }) => {
          if (d.entries && d.entries.length > 0) mergeDbEntries(d.entries)
        })
        .catch(() => {})
    }, 30_000)
    return () => clearInterval(t)
  }, [dbLoaded, addWorklogEntry])

  // Auto-refresh after every tool session completes
  useEffect(() => {
    const handler = (ev: Event) => {
      const trace = (ev as CustomEvent<{ status: string }>).detail
      if (trace?.status === "done") {
        setTimeout(() => {
          fetch("/api/worklog?limit=10")
            .then(r => r.json())
            .then((d: { entries?: { type: string; content: string; status: string; created_at: string; decision_type?: string; reasoning?: string; metadata?: Record<string,unknown> }[] }) => {
              if (d.entries && d.entries.length > 0) mergeDbEntries(d.entries)
            })
            .catch(() => {})
        }, 1500)
      }
    }
    window.addEventListener("sparkie_step_trace", handler)
    return () => window.removeEventListener("sparkie_step_trace", handler)
  }, [addWorklogEntry, dbLoaded])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [worklog.length])

  if (worklog.length === 0 && !isExecuting) {
    if (compact) return null
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted p-8">
        <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-4">
          <Brain size={24} className="text-purple-400" />
        </div>
        <p className="text-sm font-medium text-text-secondary mb-1">Sparkie's inner monologue</p>
        <p className="text-xs text-center">Her thoughts, actions, and learnings as she works</p>
      </div>
    )
  }

  if (compact) {
    // Compact mode: simple list without timeline
    return (
      <div className="p-2 space-y-0.5">
        {worklog.slice(-10).map((entry: WorklogEntry) => (
          <div key={entry.id} className="flex items-center gap-2 py-0.5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getNodeStyle(entry.type, entry.status, entry.decision_type)}`} />
            <span className="text-[10px] text-text-secondary truncate flex-1">{entry.content}</span>
            <span className="text-[9px] text-text-muted shrink-0">{formatTime(entry.created_at ?? entry.timestamp)}</span>
          </div>
        ))}
        {isExecuting && (
          <div className="flex items-center gap-2 py-0.5">
            <Loader2 size={8} className="animate-spin text-amber-400 shrink-0" />
            <span className="text-[10px] text-text-muted">Thinking…</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-hive-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
              <Activity size={12} className="text-purple-400" />
              AI Work Log
            </p>
            <p className="text-[10px] text-text-muted mt-0.5">Sparkie's inner monologue as she stays awake, sensing signals and changes all around.</p>
          </div>
          {isExecuting && (
            <div className="flex items-center gap-1.5 text-[10px] text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Processing…
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="relative">
          {/* Vertical spine */}
          <div className="absolute left-[5px] top-2 bottom-2 w-px bg-gradient-to-b from-purple-500/30 via-slate-600/20 to-transparent" />

          <div className="space-y-0.5">
            {worklog.map((entry: WorklogEntry, idx: number) => {
              const isMemory  = entry.type === "memory_learned" || entry.type === "memory_updated"
              const isProactive = entry.type === "proactive_check" || entry.decision_type === "proactive"
              const isEmail   = entry.type === "email_processed" || entry.type === "email_skipped"
              const isAiResp  = entry.type === "ai_response"
              const isMsgBatch = entry.type === "message_batch"
              const isSelfAssessment = entry.type === "self_assessment"
              const nodeStyle = getNodeStyle(entry.type, entry.status, entry.decision_type)

              // Show timestamp anchor for first entry or when time changes significantly
              const prevTs = idx > 0 ? new Date((worklog[idx-1].created_at ?? worklog[idx-1].timestamp) as string | Date).getTime() : 0
              const currTs = new Date((entry.created_at ?? entry.timestamp) as string | Date).getTime()
              const showTimeAnchor = idx === 0 || Math.abs(currTs - prevTs) > 60_000

              return (
                <div key={entry.id}>
                  {showTimeAnchor && (
                    <div className="flex items-center gap-2 py-1.5 ml-4">
                      <span className="text-[10px] text-text-muted font-mono tabular-nums">
                        {formatTime(entry.created_at ?? entry.timestamp)}
                      </span>
                    </div>
                  )}
                  <div className="flex gap-3 group">
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center shrink-0">
                      <div className={`w-[11px] h-[11px] rounded-full shadow-sm mt-1 ${nodeStyle}`} />
                    </div>

                    {/* Entry content */}
                    <div className="flex-1 min-w-0 pb-3">
                      {isMemory        ? <MemoryTimelineEntry entry={entry} /> :
                       isProactive     ? <ProactiveEntry entry={entry} /> :
                       isEmail         ? <EmailEntry entry={entry} /> :
                       isAiResp        ? <MessageEntry entry={entry} isSent={true} /> :
                       isMsgBatch      ? <MessageEntry entry={entry} isSent={false} /> :
                       isSelfAssessment ? <MonologueEntry entry={entry} /> :
                       entry.reasoning  ? <MonologueEntry entry={entry} /> :
                                          <StandardEntry entry={entry} />
                      }
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Live "thinking" node at bottom */}
            {isExecuting && (
              <div className="flex gap-3">
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-[11px] h-[11px] rounded-full bg-amber-400 shadow-sm shadow-amber-400/40 animate-pulse mt-1" />
                </div>
                <div className="flex-1 min-w-0 pb-3 pl-3">
                  <div className="flex items-center gap-2">
                    <Loader2 size={11} className="animate-spin text-amber-400" />
                    <span className="text-xs text-text-muted italic">Sparkie is thinking…</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
