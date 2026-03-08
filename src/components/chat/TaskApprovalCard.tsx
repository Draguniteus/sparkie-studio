"use client"

import { useState, useRef } from "react"
import { CheckCircle, XCircle, Clock, AlertTriangle, Paperclip, Send, X, Mail } from "lucide-react"
import { PendingTask } from "@/store/appStore"

interface Props {
  task: PendingTask
  onResolve: (taskId: string, status: "approved" | "rejected") => void
}

const ACTION_ICONS: Record<string, string> = {
  send_email: "📧",
  create_email_draft: "📧",
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
  create_email_draft: "Send Email",
  post_tweet: "Post Tweet",
  post_instagram: "Post to Instagram",
  post_reddit: "Post to Reddit",
  delete_file: "Delete File",
  send_message: "Send Message",
  deploy: "Deploy",
  default: "Execute Action",
}

// ── Email Draft Card ──────────────────────────────────────────────────────────
function EmailDraftCard({ task, onResolve }: Props) {
  const [loading, setLoading] = useState<"approved" | "rejected" | null>(null)
  const [resolved, setResolved] = useState<"sent" | "rejected" | null>(
    task.status !== "pending" ? (task.status === "approved" ? "sent" : "rejected") : null
  )
  const [attachment, setAttachment] = useState<{ name: string; dataUrl: string; mimeType: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const draft = task.emailDraft
  // Payload fallback: payload may arrive as a JSON string (route.ts stores it via JSON.stringify)
  const payloadFallback: Record<string, string> = (() => {
    if (!task.payload) return {}
    if (typeof task.payload === 'string') { try { return JSON.parse(task.payload) } catch { return {} } }
    return task.payload as Record<string, string>
  })()
  if (!draft && !payloadFallback.to && !payloadFallback.subject) return null  // nothing to render
  const subject = (draft?.subject ?? payloadFallback.subject ?? '(no subject)') as string
  const to = (draft?.to ?? payloadFallback.to ?? '') as string
  const body = (draft?.body ?? payloadFallback.body ?? '') as string
  // Truncate body for preview
  const bodyPreview = body.length > 280 ? body.slice(0, 280) + "…" : body
  const [expanded, setExpanded] = useState(false)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setAttachment({ name: file.name, dataUrl: reader.result as string, mimeType: file.type })
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  const handleDecision = async (decision: "approved" | "rejected") => {
    if (resolved || loading) return
    setLoading(decision)
    try {
      let attachmentRef: { name: string; s3key: string; mimeType: string } | null = null

      // Upload attachment first if present — Composio GMAIL_SEND_EMAIL needs an s3key, not raw base64
      if (decision === "approved" && attachment?.dataUrl) {
        try {
          const uploadRes = await fetch("/api/upload-attachment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: attachment.name,
              mimeType: attachment.mimeType,
              base64Data: attachment.dataUrl.includes(",") ? attachment.dataUrl.split(",")[1] : attachment.dataUrl,
            }),
          })
          if (uploadRes.ok) {
            const { s3key } = await uploadRes.json()
            attachmentRef = { name: attachment.name, s3key, mimeType: attachment.mimeType }
          } else {
            console.warn("Attachment upload failed — sending email without attachment")
          }
        } catch (err) {
          console.warn("Attachment upload error:", err, "— sending without attachment")
        }
      }

      const payload: Record<string, unknown> = {
        id: task.id,
        status: decision,
        ...(attachmentRef ? { attachment: attachmentRef } : {}),
      }
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        setResolved(decision === "approved" ? "sent" : "rejected")
        onResolve(task.id, decision)
      }
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-purple-500/25 bg-purple-500/5 overflow-hidden">
      {/* Header — Email pill + subject + chevron + Sent badge */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-purple-500/15">
        {/* Gmail M logo */}
        <div className="w-7 h-7 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
          <Mail size={14} className="text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wide">Email</span>
            {resolved === "sent" ? (
              <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 flex items-center gap-1">
                <CheckCircle size={9} />
                Sent
              </span>
            ) : resolved === "rejected" ? (
              <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400 flex items-center gap-1">
                <XCircle size={9} />
                Discarded
              </span>
            ) : (
              <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 flex items-center gap-1">
                <Clock size={9} />
                Review
              </span>
            )}
          </div>
          {/* Subject line */}
          <p className="text-sm font-semibold text-text-primary mt-0.5 truncate">{subject}</p>
        </div>
      </div>

      {/* To field */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-purple-500/10">
        <span className="text-[11px] text-text-muted min-w-[20px]">To</span>
        <span className="text-xs text-text-secondary truncate">{to}</span>
      </div>

      {/* Body preview */}
      <div className="px-4 py-3 border-b border-purple-500/10">
        <p
          className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? body : bodyPreview}
        </p>
        {body.length > 280 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] text-purple-400 mt-1 hover:text-purple-300"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>

      {/* Attachment row */}
      {!resolved && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-purple-500/10">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.txt"
            className="hidden"
            onChange={handleFile}
          />
          {attachment ? (
            <div className="flex items-center gap-2 flex-1">
              <div className="flex items-center gap-1.5 bg-hive-elevated px-2.5 py-1 rounded-lg border border-hive-border">
                <Paperclip size={11} className="text-text-muted" />
                <span className="text-xs text-text-secondary truncate max-w-[150px]">{attachment.name}</span>
                <button
                  onClick={() => setAttachment(null)}
                  className="text-text-muted hover:text-red-400 transition-colors ml-1"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              <Paperclip size={12} />
              Attach image
            </button>
          )}
        </div>
      )}

      {/* Action buttons */}
      {!resolved ? (
        <div className="flex items-center gap-2 px-4 py-3">
          <button
            onClick={() => handleDecision("approved")}
            disabled={!!loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <Send size={12} />
            {loading === "approved" ? "Sending…" : "Send"}
          </button>
          <button
            onClick={() => handleDecision("rejected")}
            disabled={!!loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 text-xs font-medium transition-colors disabled:opacity-50"
          >
            <XCircle size={12} />
            {loading === "rejected" ? "Discarding…" : "Discard"}
          </button>
        </div>
      ) : null}
    </div>
  )
}

// ── Generic HITL Task Approval Card ──────────────────────────────────────────
export function TaskApprovalCard({ task, onResolve }: Props) {
  // Route to email draft card if this is an email draft task
  const isEmailDraft = task.action === "create_email_draft" || task.action === "send_email" || !!task.emailDraft
  if (isEmailDraft) {
    return <EmailDraftCard task={task} onResolve={onResolve} />
  }

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
      {task.payload && (() => {
        // payload may arrive as a JSON string — parse it to an object before rendering
        let payloadObj: Record<string, unknown>
        if (typeof task.payload === 'string') {
          try { payloadObj = JSON.parse(task.payload) } catch { payloadObj = {} }
        } else {
          payloadObj = task.payload as Record<string, unknown>
        }
        const entries = Object.entries(payloadObj).filter(([, v]) => v !== undefined && v !== '')
        if (entries.length === 0) return null
        return (
          <div className="px-4 py-2.5 space-y-1.5">
            {entries.map(([k, v]) => (
              <div key={k} className="flex gap-2 text-xs">
                <span className="text-text-muted capitalize min-w-[60px]">{k.replace(/_/g, ' ')}:</span>
                <span className="text-text-secondary truncate max-w-[260px] whitespace-pre-wrap break-words">{String(v)}</span>
              </div>
            ))}
          </div>
        )
      })()}

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
