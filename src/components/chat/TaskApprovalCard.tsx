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

// Safely parse payload — handles both string (SSE JSON) and object (already parsed)
function parsePayload(raw: unknown): Record<string, string> {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return {} }
  }
  if (typeof raw === 'object') return raw as Record<string, string>
  return {}
}

// ── Email Draft Card ──────────────────────────────────────────────────────────
function EmailDraftCard({ task, onResolve }: Props) {
  const [loading, setLoading] = useState<"approved" | "rejected" | null>(null)
  const [resolved, setResolved] = useState<"sent" | "rejected" | null>(
    task.status !== "pending" ? (task.status === "approved" ? "sent" : "rejected") : null
  )
  const [attachment, setAttachment] = useState<{ name: string; dataUrl: string; mimeType: string } | null>(null)
  const [expanded, setExpanded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // task.payload arrives fully populated from the SSE sparkie_task event
  // It may be a string (JSON) or already-parsed object — parsePayload handles both
  const p = parsePayload(task.payload)

  // emailDraft takes priority; fall back to payload fields
  const subject = (task.emailDraft?.subject ?? p.subject ?? '') as string
  const to      = (task.emailDraft?.to ?? p.to ?? p.recipient_email ?? '') as string
  const body    = (task.emailDraft?.body ?? p.body ?? '') as string

  // If we genuinely have no data yet (very rare edge case), show a brief loader
  if (!subject && !to && !body) {
    return (
      <div className="mt-2 rounded-xl border border-purple-500/25 bg-purple-500/5 p-4">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Mail size={13} className="text-purple-400" />
          <span>Loading email draft…</span>
        </div>
      </div>
    )
  }

  const bodyPreview = body.length > 280 ? body.slice(0, 280) + "…" : body

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    const MAX_BASE64_BYTES = 480_000
    const storeAsIs = (f: File) => {
      const reader = new FileReader()
      reader.onload = () => setAttachment({ name: f.name, dataUrl: reader.result as string, mimeType: f.type })
      reader.readAsDataURL(f)
    }
    if (file.type.startsWith("image/")) {
      const img = new Image()
      const objectUrl = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(objectUrl)
        const tryCompress = (quality: number, scale: number) => {
          const canvas = document.createElement("canvas")
          canvas.width = Math.round(img.width * scale)
          canvas.height = Math.round(img.height * scale)
          const ctx = canvas.getContext("2d")!
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          const dataUrl = canvas.toDataURL("image/jpeg", quality)
          const base64Part = dataUrl.split(",")[1] ?? dataUrl
          if (base64Part.length <= MAX_BASE64_BYTES || quality <= 0.3) {
            setAttachment({ name: file.name.replace(/\.[^.]+$/, ".jpg"), dataUrl, mimeType: "image/jpeg" })
          } else if (quality > 0.4) {
            tryCompress(quality - 0.15, scale)
          } else {
            tryCompress(0.3, scale * 0.7)
          }
        }
        tryCompress(0.82, 1.0)
      }
      img.onerror = () => { URL.revokeObjectURL(objectUrl); storeAsIs(file) }
      img.src = objectUrl
    } else {
      storeAsIs(file)
    }
  }

  const handleDecision = async (decision: "approved" | "rejected") => {
    if (resolved || loading) return
    setLoading(decision)
    try {
      let attachmentRef: Record<string, string> | null = null
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
            const uploadData = await uploadRes.json()
            if (uploadData.ok && uploadData.base64Data) {
              attachmentRef = {
                name: uploadData.filename || attachment.name,
                filename: uploadData.filename || attachment.name,
                mimeType: uploadData.mimeType || attachment.mimeType,
                base64Data: uploadData.base64Data,
              } as { name: string; filename: string; mimeType: string; base64Data: string; s3key?: string }
            } else {
              console.warn("Attachment validation failed:", uploadData)
            }
          } else {
            console.warn("Attachment upload failed:", uploadRes.status, "— sending without attachment")
          }
        } catch (err) {
          console.warn("Attachment upload error:", err, "— sending without attachment")
        }
      }
      const patchPayload: Record<string, unknown> = {
        id: task.id,
        status: decision,
        ...(attachmentRef ? { attachment: attachmentRef } : {}),
      }
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchPayload),
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
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-purple-500/15">
        <div className="w-7 h-7 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
          <Mail size={14} className="text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wide">Email</span>
            {resolved === "sent" ? (
              <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 flex items-center gap-1">
                <CheckCircle size={9} />Sent
              </span>
            ) : resolved === "rejected" ? (
              <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400 flex items-center gap-1">
                <XCircle size={9} />Discarded
              </span>
            ) : (
              <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 flex items-center gap-1">
                <Clock size={9} />Review
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-text-primary mt-0.5 truncate">{subject || "(no subject)"}</p>
        </div>
      </div>

      {/* To */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-purple-500/10">
        <span className="text-[11px] text-text-muted min-w-[20px]">To</span>
        <span className="text-xs text-text-secondary truncate">{to}</span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 border-b border-purple-500/10">
        <p
          className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? body : bodyPreview}
        </p>
        {body.length > 280 && (
          <button onClick={() => setExpanded(!expanded)} className="text-[11px] text-purple-400 mt-1 hover:text-purple-300">
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>

      {/* Attachment */}
      {!resolved && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-purple-500/10">
          <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt" className="hidden" onChange={handleFile} />
          {attachment ? (
            <div className="flex items-center gap-1.5 bg-hive-elevated px-2.5 py-1 rounded-lg border border-hive-border">
              <Paperclip size={11} className="text-text-muted" />
              <span className="text-xs text-text-secondary truncate max-w-[150px]">{attachment.name}</span>
              <button onClick={() => setAttachment(null)} className="text-text-muted hover:text-red-400 transition-colors ml-1"><X size={11} /></button>
            </div>
          ) : (
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors">
              <Paperclip size={12} />Attach image
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      {!resolved && (
        <div className="flex items-center gap-2 px-4 py-3">
          <button
            onClick={() => handleDecision("approved")}
            disabled={!!loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <Send size={12} />{loading === "approved" ? "Sending…" : "Send"}
          </button>
          <button
            onClick={() => handleDecision("rejected")}
            disabled={!!loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 text-xs font-medium transition-colors disabled:opacity-50"
          >
            <XCircle size={12} />{loading === "rejected" ? "Discarding…" : "Discard"}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Generic HITL Task Approval Card ──────────────────────────────────────────
export function TaskApprovalCard({ task, onResolve }: Props) {
  const isEmailDraft = task.action === "create_email_draft" || task.action === "send_email" || !!task.emailDraft
  if (isEmailDraft) return <EmailDraftCard task={task} onResolve={onResolve} />

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
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-honey-500/15">
        <div className="w-7 h-7 rounded-lg bg-honey-500/15 flex items-center justify-center shrink-0 text-base">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary truncate">{task.label}</span>
            {!resolved && <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 flex items-center gap-1"><Clock size={9} />NEEDS APPROVAL</span>}
            {resolved === "approved" && <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-green-500/15 text-green-400 flex items-center gap-1"><CheckCircle size={9} />APPROVED</span>}
            {resolved === "rejected" && <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400 flex items-center gap-1"><XCircle size={9} />REJECTED</span>}
          </div>
          <p className="text-xs text-text-muted mt-0.5">{actionLabel}</p>
        </div>
      </div>

      {task.payload && (() => {
        const payloadObj = parsePayload(task.payload)
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

      <div className="flex items-start gap-2 px-4 py-2 bg-amber-500/5 border-t border-amber-500/10">
        <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
        <p className="text-[11px] text-text-muted">This action is irreversible. Sparkie is waiting for your decision.</p>
      </div>

      {!resolved && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-honey-500/15">
          <button onClick={() => handleDecision("approved")} disabled={!!loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 text-xs font-medium transition-colors disabled:opacity-50">
            <CheckCircle size={13} />{loading === "approved" ? "Approving…" : "Approve"}
          </button>
          <button onClick={() => handleDecision("rejected")} disabled={!!loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 text-xs font-medium transition-colors disabled:opacity-50">
            <XCircle size={13} />{loading === "rejected" ? "Rejecting…" : "Reject"}
          </button>
        </div>
      )}
    </div>
  )
}
