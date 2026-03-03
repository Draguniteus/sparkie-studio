"use client"

import { useEffect, useRef } from "react"
import { useAppStore, WorklogEntry } from "@/store/appStore"
import {
  Brain, Zap, CheckCircle, AlertCircle, Code, Loader2,
  Mail, SkipForward, ShieldCheck, Wrench, Calendar, Cpu, BookOpen
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

function getIcon(type: string, decisionType?: string): React.ElementType {
  if (decisionType === "skip") return SkipForward
  if (decisionType === "proactive") return Zap
  if (decisionType === "hold") return ShieldCheck
  const map: Record<string, React.ElementType> = {
    thinking: Brain,
    action: Zap,
    result: CheckCircle,
    error: AlertCircle,
    code: Code,
    email_processed: Mail,
    email_skipped: SkipForward,
    memory_learned: Brain,
    memory_updated: Brain,
    task_executed: Cpu,
    code_push: Code,
    heartbeat: Cpu,
    auth_check: ShieldCheck,
    tool_call: Wrench,
    decision: Zap,
    hold: ShieldCheck,
    proactive_check: Brain,
    signal_skipped: SkipForward,
    calendar: Calendar,
    ai_response: Brain,
    message_batch: Brain,
  }
  return map[type] ?? BookOpen
}

function getColor(type: string, status?: string, decisionType?: string): string {
  if (status === "anomaly") return "text-red-400"
  if (status === "blocked") return "text-yellow-400"
  if (status === "running") return "text-honey-500"
  if (status === "skipped") return "text-text-muted"
  if (decisionType === "skip") return "text-text-muted"
  if (decisionType === "proactive") return "text-honey-500"
  const map: Record<string, string> = {
    thinking: "text-purple-400",
    action: "text-honey-500",
    result: "text-green-400",
    error: "text-red-400",
    code: "text-blue-400",
    email_processed: "text-blue-400",
    email_skipped: "text-text-muted",
    memory_learned: "text-purple-400",
    task_executed: "text-green-400",
    code_push: "text-blue-400",
    auth_check: "text-yellow-400",
    tool_call: "text-honey-500",
    proactive_check: "text-purple-400",
  }
  return map[type] ?? "text-text-secondary"
}

function getLabel(type: string, decisionType?: string): string {
  if (decisionType === "skip") return "Skipped"
  if (decisionType === "proactive") return "Proactive"
  if (decisionType === "hold") return "Held"
  if (decisionType === "escalate") return "Alert"
  const map: Record<string, string> = {
    thinking: "Thinking",
    action: "Executing",
    result: "Result",
    error: "Error",
    code: "Writing Code",
    email_processed: "Email",
    email_skipped: "Skipped Email",
    memory_learned: "Learned",
    memory_updated: "Memory Updated",
    task_executed: "Task Done",
    code_push: "Code Push",
    heartbeat: "Heartbeat",
    auth_check: "Auth Check",
    tool_call: "Tool Call",
    decision: "Decision",
    hold: "Held",
    proactive_check: "Proactive Check",
    signal_skipped: "Signal Skipped",
    ai_response: "AI Response",
    message_batch: "Messages",
  }
  return map[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

const PRIORITY_STYLES: Record<string, string> = {
  P0: "bg-red-500/20 text-red-400 border border-red-500/30",
  P1: "bg-honey-500/20 text-honey-400 border border-honey-500/30",
  P2: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
}

function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority || priority === "P3") return null
  const cls = PRIORITY_STYLES[priority] ?? ""
  return (
    <span className={"text-[9px] font-bold px-1 rounded " + cls}>
      {priority}
    </span>
  )
}

interface WorklogProps {
  compact?: boolean
}

export function Worklog({ compact = false }: WorklogProps) {
  const { worklog, isExecuting } = useAppStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [worklog, worklog.length])

  if (worklog.length === 0 && !isExecuting) {
    if (compact) return null
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted p-8">
        <div className="w-16 h-16 rounded-2xl bg-honey-500/10 flex items-center justify-center mb-4">
          <Brain size={24} className="text-honey-500" />
        </div>
        <p className="text-sm font-medium text-text-secondary mb-1">AI Work Log</p>
        <p className="text-xs text-center">Watch Sparkie think and execute in real-time</p>
      </div>
    )
  }

  return (
    <div className={compact ? "p-2 space-y-0.5" : "h-full flex flex-col overflow-y-auto p-3 space-y-1"}>
      {worklog.map((entry: WorklogEntry) => {
        const Icon = getIcon(entry.type, entry.decision_type)
        const color = getColor(entry.type, entry.status, entry.decision_type)
        const label = getLabel(entry.type, entry.decision_type)
        const isRunning = entry.status === "running"
        const isAnomaly = entry.status === "anomaly"
        const isBlocked = entry.status === "blocked"
        const isSkipped = entry.status === "skipped" || entry.decision_type === "skip"
        const duration = entry.actual_duration_ms ?? entry.duration
        const timestamp = entry.created_at ?? entry.timestamp

        let rowClass = "flex gap-2 " + (compact ? "py-1 px-1.5" : "p-2.5") + " rounded-lg transition-colors "
        if (isAnomaly) rowClass += "bg-red-500/5 border border-red-500/20"
        else if (isBlocked) rowClass += "bg-yellow-500/5 border border-yellow-500/20"
        else if (isRunning) rowClass += "bg-honey-500/5 border border-honey-500/20"
        else if (!compact) rowClass += "hover:bg-hive-hover"

        return (
          <div key={entry.id} className={rowClass}>
            <div className={"shrink-0 mt-0.5 " + color}>
              {isRunning
                ? <Loader2 size={compact ? 12 : 14} className="animate-spin" />
                : <Icon size={compact ? 12 : 14} />
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={"text-[10px] font-medium uppercase tracking-wider " + color}>{label}</span>
                <PriorityBadge priority={entry.signal_priority} />
                <span className="text-[10px] text-text-muted">{formatTime(timestamp)}</span>
                {duration != null && entry.status === "done" && (
                  <span className="text-[10px] text-text-muted">{formatDuration(duration)}</span>
                )}
                {isSkipped && <span className="text-[9px] text-text-muted italic">skipped</span>}
              </div>
              <p className={(compact ? "text-[10px]" : "text-xs") + " text-text-secondary mt-0.5 " + (compact ? "truncate" : "break-words whitespace-pre-wrap")}>
                {compact && entry.content.length > 80 ? entry.content.slice(0, 80) + "…" : entry.content}
              </p>
              {!compact && entry.reasoning && (
                <p className="text-[10px] text-text-muted italic mt-1 opacity-75 border-l-2 border-text-muted/20 pl-2">
                  {entry.reasoning}
                </p>
              )}
            </div>
          </div>
        )
      })}
      {isExecuting && worklog.length === 0 && (
        <div className="flex gap-2 p-2.5">
          <Loader2 size={14} className="animate-spin text-honey-500 shrink-0 mt-0.5" />
          <span className="text-xs text-text-muted">Sparkie is thinking…</span>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
