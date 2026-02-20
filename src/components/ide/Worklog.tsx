"use client"

import { useEffect, useRef } from "react"
import { useAppStore, WorklogEntry } from "@/store/appStore"
import { Brain, Zap, CheckCircle, AlertCircle, Code, Loader2 } from "lucide-react"

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

const ICONS: Record<WorklogEntry["type"], typeof Brain> = {
  thinking: Brain,
  action: Zap,
  result: CheckCircle,
  error: AlertCircle,
  code: Code,
}

const COLORS: Record<WorklogEntry["type"], string> = {
  thinking: "text-purple-400",
  action: "text-honey-500",
  result: "text-green-400",
  error: "text-red-400",
  code: "text-blue-400",
}

const LABELS: Record<WorklogEntry["type"], string> = {
  thinking: "Thinking",
  action: "Executing",
  result: "Result",
  error: "Error",
  code: "Writing Code",
}

export function Worklog() {
  const { worklog, isExecuting } = useAppStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [worklog.length])

  if (worklog.length === 0 && !isExecuting) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted p-8">
        <div className="w-16 h-16 rounded-2xl bg-honey-500/10 flex items-center justify-center mb-4">
          <Brain size={24} className="text-honey-500" />
        </div>
        <p className="text-sm font-medium text-text-secondary mb-1">AI Worklog</p>
        <p className="text-xs text-center">Watch Sparkie think and execute tasks in real-time</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      <div className="p-3 space-y-1">
        {worklog.map((entry) => {
          const Icon = ICONS[entry.type]
          const color = COLORS[entry.type]
          const label = LABELS[entry.type]
          const isRunning = entry.status === "running"

          return (
            <div
              key={entry.id}
              className={`flex gap-2.5 p-2.5 rounded-lg transition-colors ${
                isRunning ? "bg-honey-500/5 border border-honey-500/20" : "hover:bg-hive-hover"
              }`}
            >
              <div className={`shrink-0 mt-0.5 ${color}`}>
                {isRunning ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Icon size={14} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] font-medium uppercase tracking-wider ${color}`}>
                    {label}
                  </span>
                  <span className="text-[10px] text-text-muted">
                    {formatTime(entry.timestamp)}
                  </span>
                  {entry.duration && (
                    <span className="text-[10px] text-text-muted">
                      {entry.duration < 1000
                        ? `${entry.duration}ms`
                        : `${(entry.duration / 1000).toFixed(1)}s`}
                    </span>
                  )}
                </div>
                {entry.type === "code" ? (
                  <pre className="text-xs text-text-secondary font-mono bg-hive-elevated rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                    {entry.content}
                  </pre>
                ) : (
                  <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
                    {entry.content}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div ref={bottomRef} />
    </div>
  )
}
