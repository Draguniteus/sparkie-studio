"use client"

import { useState } from "react"
import { CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react"
import { PendingTask } from "@/store/appStore"

interface Props {
  task: PendingTask
  onResolve: (taskId: string, status: "approved" | "rejected") => void
}

const ACTION_ICONS: Record<string, string> = {
  send_email: "📧",
  post_tweet: "🐦",
  post_instagram: "📸",
  post_reddit: "🤖",
  delete_file: "🗑️",
  send_message: "💬",
  deploy: "🚀",
  default: "⚡",
}

const ACTION_LABELS: Record<string, string> = {
  send_email: "Send Email",
  post_tweet: "Post Tweet",
  post_instagram: "Post to Instagram",
  post_reddit: "Post to Reddit",
  delete_file: "Delete File",
  send_message: "Send Message",
  deploy: "Deploy",
  default: "Execute Action",
}

export function TaskApprovalCard({ task, onResolve }: Props) {
  const [loading, setLoading] = useState<"approved" | "rejected" | null>(null)
  const [resolved, setResolved] = useState<"approved" | "rejected" | null>(
    task.status !== "pending" ? task.status as "approved" | "rejected" : null
  )

  const icon = ACTION_ICONS[task.action] ?? ACTION_ICONS.default
  const actionLabel = ACTION_LABELS[task.action] ?? ACTION_LABELS.default

  const handleDecision = async (decision: "approved" | "rejected") => {
    if (resolved || loading) return
    setLoading(decision)
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, status: decision }),
      })
      if (res.ok) {
        setResolved(decision)
        onResolve(task.id, decision)
      }
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-honey-500/20 bg-honey-500/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-honey-500/15">
        <div className="w-7 h-7 rounded-lg bg-honey-500/15 flex items-center justify-center shrink-0 text-base">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary truncate">{task.label}</span>
            {!resolved && (
              <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 flex items-center gap-1">
                <Clock size={9} />
                NEEDS APPROVAL
              </span>
            )}
            {resolved === "approved" && (
              <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-green-500/15 text-green-400 flex items-center gap-1">
                <CheckCircle size={9} />
                APPROVED
              </span>
            )}
            {resolved === "rejected" && (
              <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400 flex items-center gap-1">
                <XCircle size={9} />
                REJECTED
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-0.5">{actionLabel}</p>
        </div>
      </div>

      {/* Payload preview */}
      {task.payload && Object.keys(task.payload).length > 0 && (
        <div className="px-4 py-2.5 space-y-1.5">
          {Object.entries(task.payload).map(([k, v]) => (
            <div key={k} className="flex gap-2 text-xs">
              <span className="text-text-muted capitalize min-w-[60px]">{k.replace(/_/g, " ")}:</span>
              <span className="text-text-secondary truncate">{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Warning */}
      <div className="flex items-start gap-2 px-4 py-2 bg-amber-500/5 border-t border-amber-500/10">
        <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
        <p className="text-[11px] text-text-muted">This action is irreversible. Sparkie is waiting for your decision.</p>
      </div>

      {/* Action buttons */}
      {!resolved && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-honey-500/15">
          <button
            onClick={() => handleDecision("approved")}
            disabled={!!loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 text-xs font-medium transition-colors disabled:opacity-50"
          >
            <CheckCircle size={13} />
            {loading === "approved" ? "Approving…" : "Approve"}
          </button>
          <button
            onClick={() => handleDecision("rejected")}
            disabled={!!loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 text-xs font-medium transition-colors disabled:opacity-50"
          >
            <XCircle size={13} />
            {loading === "rejected" ? "Rejecting…" : "Reject"}
          </button>
        </div>
      )}
    </div>
  )
}
