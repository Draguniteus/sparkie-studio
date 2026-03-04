"use client"

import { useEffect, useRef, useState, ElementType } from "react"
import { useAppStore, WorklogEntry } from "@/store/appStore"
import {
  Brain, Zap, CheckCircle, AlertCircle, Code, Loader2,
  Mail, SkipForward, ShieldCheck, Wrench, Calendar, Cpu,
  BookOpen, Sparkles, RefreshCw
} from "lucide-react"

function formatTime(ts: Date | number | string) {
  const d = ts instanceof Date ? ts : new Date(ts as string | number)
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function getIcon(type: string, decisionType?: string): ElementType {
  if (decisionType === "skip") return SkipForward
  if (decisionType === "proactive") return Zap
  if (decisionType === "hold") return ShieldCheck
  const map: Record<string, ElementType> = {
    thinking: Brain, action: Zap, result: CheckCircle, error: AlertCircle,
    code: Code, email_processed: Mail, email_skipped: SkipForward,
    memory_learned: Sparkles, memory_updated: Sparkles,
    task_executed: Cpu, code_push: Code, heartbeat: RefreshCw,
    auth_check: ShieldCheck, tool_call: Wrench, decision: Zap,
    hold: ShieldCheck, proactive_check: Brain, signal_skipped: SkipForward,
    calendar: Calendar, ai_response: Brain, message_batch: Brain,
    self_assessment: BookOpen,
  }
  return map[type] ?? BookOpen
}

// ── Gradient card style per type ───────────────────────────────────────────
function getCardStyle(type: string, status?: string, decisionType?: string): {
  border: string; bg: string; iconBg: string; iconColor: string; textColor: string
} {
  if (status === "anomaly")  return { border: "border-l-red-500/70",    bg: "bg-gradient-to-r from-red-900/20 to-red-950/10",    iconBg: "bg-red-500/15",    iconColor: "text-red-400",    textColor: "text-red-400"    }
  if (status === "blocked")  return { border: "border-l-yellow-500/70", bg: "bg-gradient-to-r from-yellow-900/15 to-yellow-950/5",iconBg: "bg-yellow-500/15", iconColor: "text-yellow-400", textColor: "text-yellow-400" }
  if (status === "running")  return { border: "border-l-honey-500/70",  bg: "bg-gradient-to-r from-honey-900/15 to-honey-950/5",  iconBg: "bg-honey-500/15",  iconColor: "text-honey-400",  textColor: "text-honey-500"  }
  if (decisionType === "skip")      return { border: "border-l-slate-500/40",  bg: "bg-transparent",                                    iconBg: "bg-slate-500/10",  iconColor: "text-text-muted", textColor: "text-text-muted" }
  if (decisionType === "proactive") return { border: "border-l-honey-500/60",  bg: "bg-gradient-to-r from-amber-900/15 to-amber-950/5",  iconBg: "bg-amber-500/15",  iconColor: "text-honey-400",  textColor: "text-honey-500"  }

  const map: Record<string, ReturnType<typeof getCardStyle>> = {
    memory_learned:  { border: "border-l-purple-500/70", bg: "bg-gradient-to-r from-purple-900/20 to-purple-950/10", iconBg: "bg-purple-500/15", iconColor: "text-purple-400", textColor: "text-purple-400" },
    memory_updated:  { border: "border-l-purple-500/70", bg: "bg-gradient-to-r from-purple-900/20 to-purple-950/10", iconBg: "bg-purple-500/15", iconColor: "text-purple-400", textColor: "text-purple-400" },
    self_assessment: { border: "border-l-honey-500/60",  bg: "bg-gradient-to-r from-amber-900/15 to-amber-950/5",   iconBg: "bg-amber-500/15",  iconColor: "text-honey-400",  textColor: "text-honey-500"  },
    proactive_check: { border: "border-l-purple-500/60", bg: "bg-gradient-to-r from-purple-900/15 to-purple-950/5", iconBg: "bg-purple-500/15", iconColor: "text-purple-400", textColor: "text-purple-400" },
    code_push:       { border: "border-l-blue-500/60",   bg: "bg-gradient-to-r from-blue-900/15 to-blue-950/5",     iconBg: "bg-blue-500/15",   iconColor: "text-blue-400",   textColor: "text-blue-400"   },
    email_processed: { border: "border-l-blue-500/60",   bg: "bg-gradient-to-r from-blue-900/15 to-blue-950/5",     iconBg: "bg-blue-500/15",   iconColor: "text-blue-400",   textColor: "text-blue-400"   },
    tool_call:       { border: "border-l-honey-500/50",  bg: "bg-gradient-to-r from-amber-900/10 to-transparent",   iconBg: "bg-amber-500/10",  iconColor: "text-honey-400",  textColor: "text-honey-500"  },
    decision:        { border: "border-l-honey-500/50",  bg: "bg-gradient-to-r from-amber-900/10 to-transparent",   iconBg: "bg-amber-500/10",  iconColor: "text-honey-400",  textColor: "text-honey-500"  },
    task_executed:   { border: "border-l-green-500/60",  bg: "bg-gradient-to-r from-green-900/15 to-green-950/5",   iconBg: "bg-green-500/15",  iconColor: "text-green-400",  textColor: "text-green-400"  },
    result:          { border: "border-l-green-500/60",  bg: "bg-gradient-to-r from-green-900/15 to-green-950/5",   iconBg: "bg-green-500/15",  iconColor: "text-green-400",  textColor: "text-green-400"  },
    error:           { border: "border-l-red-500/60",    bg: "bg-gradient-to-r from-red-900/15 to-red-950/5",       iconBg: "bg-red-500/15",    iconColor: "text-red-400",    textColor: "text-red-400"    },
  }
  return map[type] ?? { border: "border-l-slate-600/40", bg: "bg-transparent", iconBg: "bg-slate-500/10", iconColor: "text-text-muted", textColor: "text-text-secondary" }
}

function getLabel(type: string, decisionType?: string): string {
  if (decisionType === "skip") return "Skipped"
  if (decisionType === "proactive") return "Proactive"
  if (decisionType === "hold") return "Held"
  if (decisionType === "escalate") return "Alert"
  const map: Record<string, string> = {
    thinking: "Thinking", action: "Executing", result: "Result", error: "Error",
    code: "Writing Code", email_processed: "Email", email_skipped: "Skipped Email",
    memory_learned: "Learned", memory_updated: "Memory Updated",
    task_executed: "Task Done", code_push: "Code Push", heartbeat: "Heartbeat",
    auth_check: "Auth Check", tool_call: "Tool Call", decision: "Decision",
    hold: "Held", proactive_check: "Proactive Check", signal_skipped: "Signal Skipped",
    ai_response: "AI Response", message_batch: "Messages", self_assessment: "Self-Assessment",
  }
  return map[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

const PRIORITY_STYLES: Record<string, string> = {
  P0: "bg-red-500/20 text-red-400 border border-red-500/40",
  P1: "bg-amber-500/20 text-amber-300 border border-amber-500/40",
  P2: "bg-blue-500/20 text-blue-300 border border-blue-500/40",
}

function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority || priority === "P3") return null
  const cls = PRIORITY_STYLES[priority] ?? ""
  return <span className={"text-[9px] font-bold px-1.5 py-0.5 rounded-full " + cls}>{priority}</span>
}

// Memory-learned entries get special interiority card treatment
function MemoryCard({ entry, label }: { entry: WorklogEntry; label: string }) {
  const isNew = (Date.now() - new Date(entry.created_at ?? entry.timestamp ?? Date.now()).getTime()) < 86_400_000

  return (
    <div className="my-2">
      <p className="text-[10px] text-text-muted mb-1.5 flex items-center gap-1.5 px-1">
        <span className={`w-1.5 h-1.5 rounded-full inline-block ${isNew ? 'bg-purple-500' : 'bg-blue-500'}`} />
        {isNew ? "I've learned something new:" : "I already knew this:"}
      </p>
      <div className="rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-900/25 to-purple-950/40 p-3">
        <div className="flex items-start gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-purple-600/30 to-purple-800/30 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles size={11} className="text-purple-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-text-secondary leading-relaxed break-words">{entry.content}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                {label}
              </span>
              <span className="text-[9px] text-text-muted">{formatTime(entry.created_at ?? entry.timestamp ?? Date.now())}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface WorklogProps {
  compact?: boolean
}

export function Worklog({ compact = false }: WorklogProps) {
  const { worklog, isExecuting, addWorklogEntry } = useAppStore()
  const [dbLoaded, setDbLoaded] = useState(false)

  // Seed worklog from DB on mount (appStore worklog is in-memory only; DB has full history)
  useEffect(() => {
    if (dbLoaded) return
    fetch('/api/worklog?limit=30')
      .then(r => r.json())
      .then((d: { entries?: { type: string; content: string; status: string; created_at: string }[] }) => {
        if (d.entries && d.entries.length > 0) {
          // Only pre-populate if appStore worklog is empty (avoid duplicates)
          if (useAppStore.getState().worklog.length === 0) {
            for (const e of d.entries.slice(0, 20)) {
              addWorklogEntry({ type: e.type as WorklogEntry['type'], content: e.content, status: (e.status as WorklogEntry['status']) ?? 'done' })
            }
          }
        }
        setDbLoaded(true)
      })
      .catch(() => setDbLoaded(true))
  }, [dbLoaded, addWorklogEntry])

  // Auto-refresh worklog after every tool session completes
  useEffect(() => {
    const handler = (e: Event) => {
      const trace = (e as CustomEvent<{ status: string }>).detail
      if (trace?.status === 'done') {
        setTimeout(() => {
          fetch('/api/worklog?limit=5')
            .then(r => r.json())
            .then((d: { entries?: { type: string; content: string; status: string; created_at: string }[] }) => {
              if (d.entries) {
                for (const e of d.entries) {
                  const existing = useAppStore.getState().worklog.find(w => w.content === e.content)
                  if (!existing) {
                    addWorklogEntry({ type: e.type as WorklogEntry['type'], content: e.content, status: (e.status as WorklogEntry['status']) ?? 'done' })
                  }
                }
              }
            })
            .catch(() => {})
        }, 1500)
      }
    }
    window.addEventListener('sparkie_step_trace', handler)
    return () => window.removeEventListener('sparkie_step_trace', handler)
  }, [addWorklogEntry])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [worklog, worklog.length])

  if (worklog.length === 0 && !isExecuting) {
    if (compact) return null
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted p-8">
        <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-4">
          <Brain size={24} className="text-purple-400" />
        </div>
        <p className="text-sm font-medium text-text-secondary mb-1">Sparkie&apos;s Brain</p>
        <p className="text-xs text-center">Her inner monologue as she works</p>
      </div>
    )
  }

  return (
    <div className={compact ? "p-2 space-y-0.5" : "h-full flex flex-col overflow-y-auto p-3 space-y-1.5"}>
      {worklog.map((entry: WorklogEntry) => {
        const Icon = getIcon(entry.type, entry.decision_type)
        const label = getLabel(entry.type, entry.decision_type)
        const isRunning = entry.status === "running"
        const isAnomaly = entry.status === "anomaly"
        const isBlocked = entry.status === "blocked"
        const isSkipped = entry.status === "skipped" || entry.decision_type === "skip"
        const duration = entry.actual_duration_ms ?? entry.duration
        const timestamp = entry.created_at ?? entry.timestamp
        const isMemory = entry.type === "memory_learned" || entry.type === "memory_updated"

        // Memory entries get the special interiority card
        if (!compact && isMemory) {
          return <MemoryCard key={entry.id} entry={entry} label={label} />
        }

        const style = getCardStyle(entry.type, entry.status, entry.decision_type)

        return (
          <div key={entry.id}
            className={`flex gap-2.5 border-l-2 rounded-r-lg transition-colors pl-2.5 ${style.border} ${style.bg} ${
              compact ? "py-1 pr-1.5" : "p-2.5 pr-3"
            }`}
          >
            {/* Icon */}
            <div className={`shrink-0 w-5 h-5 rounded-md flex items-center justify-center mt-0.5 ${style.iconBg}`}>
              {isRunning
                ? <Loader2 size={10} className={`animate-spin ${style.iconColor}`} />
                : <Icon size={10} className={style.iconColor} />
              }
            </div>

            <div className="flex-1 min-w-0">
              {/* Header row */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${style.textColor}`}>{label}</span>
                <PriorityBadge priority={entry.signal_priority} />
                <span className="text-[10px] text-text-muted">{formatTime(timestamp)}</span>
                {duration != null && entry.status === "done" && (
                  <span className="text-[10px] text-text-muted">{formatDuration(duration)}</span>
                )}
                {isSkipped && <span className="text-[9px] text-text-muted italic opacity-60">skipped</span>}
                {entry.confidence != null && entry.confidence < 0.6 && (
                  <span className="text-[9px] text-yellow-400 opacity-70">low confidence</span>
                )}
              </div>

              {/* Content */}
              <p className={`${compact ? "text-[10px]" : "text-xs"} text-text-secondary mt-0.5 ${
                compact ? "truncate" : "break-words whitespace-pre-wrap leading-relaxed"
              }`}>
                {compact && entry.content.length > 80 ? entry.content.slice(0, 80) + "…" : entry.content}
              </p>

              {/* Reasoning — italicized quote style */}
              {!compact && entry.reasoning && (
                <div className="mt-1.5 pl-2 border-l border-white/10">
                  <p className="text-[10px] text-text-muted italic opacity-80 leading-relaxed">
                    &ldquo;{entry.reasoning}&rdquo;
                  </p>
                </div>
              )}
            </div>
          </div>
        )
      })}
      {isExecuting && worklog.length === 0 && (
        <div className="flex gap-2.5 p-2.5 border-l-2 border-honey-500/40 bg-gradient-to-r from-amber-900/10 to-transparent rounded-r-lg">
          <div className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center bg-honey-500/15">
            <Loader2 size={10} className="animate-spin text-honey-400" />
          </div>
          <span className="text-xs text-text-muted self-center">Sparkie is thinking…</span>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
