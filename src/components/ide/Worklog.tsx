"use client"

import React, { useEffect, useRef, useState } from "react"
import { Search } from "lucide-react"
import { useAppStore, WorklogEntry } from "@/store/appStore"
import { DEFAULT_TYPE_ICONS } from "@/lib/worklog"
import { useShallow } from "zustand/react/shallow"
import { Brain, Loader2, Mail, MessageSquare, Send, Activity, Eye, CheckCircle, Code2, Bug, AlertTriangle, FileText, Rocket, Lightbulb, Sparkles, Timer, XCircle, Info, ArrowRight, Terminal, Pencil, Zap } from "lucide-react"

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
  if (status === "anomaly" || status === "error") return "bg-red-500 shadow-red-500/40 shadow-[0_0_8px_rgba(248,113,113,0.5)]"
  if (status === "blocked")   return "bg-yellow-500 shadow-yellow-500/40"
  if (status === "running")   return "bg-amber-400 shadow-amber-400/40 shadow-[0_0_12px_rgba(251,191,36,0.6)] animate-pulse"
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
    email_triage:    "bg-slate-500",
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
    amber:  "bg-amber-500/20 text-amber-200 border border-amber-500/50 shadow-[0_0_6px_rgba(251,191,36,0.2)]",
    blue:   "bg-blue-500/15 text-blue-300 border border-blue-500/30",
    purple: "bg-purple-500/15 text-purple-300 border border-purple-500/30",
    red:    "bg-red-500/15 text-red-300 border border-red-500/30",
    green:  "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
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
        ? "bg-gradient-to-br from-purple-900/50 to-purple-950/70 border-purple-500/40"
        : "bg-gradient-to-br from-blue-900/40 to-blue-950/60 border-blue-500/30"
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
      <div className="rounded-xl border border-purple-500/25 bg-gradient-to-br from-purple-900/30 to-slate-950/40 p-3">
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

// ── Lucide icon map for worklog entry icons ───────────────────────────────────
type WorklogIcon = React.ComponentType<{ size?: number | string; className?: string }>
const ICON_MAP: Record<string, { icon: WorklogIcon; color: string }> = {
  brain:     { icon: Brain,        color: 'text-pink-400' },
  check:     { icon: CheckCircle,   color: 'text-emerald-400' },
  code:      { icon: Code2,         color: 'text-blue-400' },
  bug:       { icon: Bug,          color: 'text-red-400' },
  mail:      { icon: Mail,         color: 'text-blue-400' },
  send:      { icon: Send,         color: 'text-blue-400' },
  alert:     { icon: AlertTriangle, color: 'text-amber-400' },
  memory:    { icon: Brain,        color: 'text-purple-400' },
  search:    { icon: Search,       color: 'text-purple-400' },
  file:      { icon: FileText,    color: 'text-blue-400' },
  rocket:    { icon: Rocket,     color: 'text-orange-400' },
  lightbulb: { icon: Lightbulb,  color: 'text-yellow-400' },
  sparkles:  { icon: Sparkles,    color: 'text-purple-300' },
  hourglass: { icon: Timer,       color: 'text-amber-400' },
  done:      { icon: CheckCircle, color: 'text-emerald-400' },
  error:     { icon: XCircle,    color: 'text-red-400' },
  warning:   { icon: AlertTriangle, color: 'text-amber-400' },
  info:      { icon: Info,        color: 'text-blue-400' },
  arrow:     { icon: ArrowRight,  color: 'text-text-muted' },
  terminal:  { icon: Terminal,    color: 'text-green-400' },
  edit:      { icon: Pencil,      color: 'text-amber-400' },
  zap:       { icon: Zap,         color: 'text-yellow-400' },
  tool:      { icon: Zap,         color: 'text-amber-400' },
  signal:    { icon: Zap,         color: 'text-blue-400' },
  pulse:     { icon: Zap,         color: 'text-pink-400' },
  pause:     { icon: Timer,       color: 'text-amber-400' },
  skip:      { icon: ArrowRight,  color: 'text-text-muted' },
  refresh:   { icon: ArrowRight,  color: 'text-purple-400' },
  forgot:    { icon: XCircle,    color: 'text-red-400' },
}

function WorklogIcon({ icon, className }: { icon?: string; className?: string }) {
  if (!icon) return null
  const entry = ICON_MAP[icon]
  if (!entry) return <span className={`text-[10px] ${className ?? ''}`}>{`【${icon}】`}</span>
  const IconComponent = entry.icon
  return <IconComponent size={11} className={`${entry.color} ${className ?? ''}`} />
}

// ── Border color per entry type (left border accent) ────────────────────────
function getBorderColor(entry: WorklogEntry): string {
  const type = entry.type
  const status = entry.status
  if (status === 'error' || status === 'anomaly') return 'border-l-red-500'
  if (status === 'running') return 'border-l-amber-400'
  if (status === 'blocked') return 'border-l-yellow-500'
  if (entry.decision_type === 'proactive') return 'border-l-orange-400'
  if (entry.decision_type === 'skip') return 'border-l-slate-600'
  const map: Record<string, string> = {
    memory_learned:  'border-l-purple-500',
    memory_updated:  'border-l-purple-500',
    self_assessment:  'border-l-amber-400',
    proactive_check: 'border-l-amber-400',
    code_push:       'border-l-blue-500',
    email_processed: 'border-l-blue-400',
    email_skipped:   'border-l-slate-500',
    email_triage:    'border-l-slate-500',
    tool_call:       'border-l-amber-500',
    decision:        'border-l-amber-500',
    task_executed:   'border-l-emerald-500',
    result:          'border-l-emerald-500',
    ai_response:     'border-l-purple-400',
    message_batch:   'border-l-blue-400',
    heartbeat:       'border-l-slate-500',
    reasoning:       'border-l-purple-400',
    action:          'border-l-blue-400',
    code:            'border-l-blue-500',
    error:           'border-l-red-500',
    signal_skipped:  'border-l-slate-600',
    hold:            'border-l-amber-400',
  }
  return map[type] ?? 'border-l-slate-600'
}

// ── Standard timeline entry — card-style with color-coded left border ───────────
function StandardEntry({ entry }: { entry: WorklogEntry }) {
  const isRunning = entry.status === 'running'
  const duration = entry.actual_duration_ms ?? entry.duration
  const borderColor = getBorderColor(entry)
  const [reasoningExpanded, setReasoningExpanded] = useState(false)
  const hasLongReasoning = (entry.reasoning?.length ?? 0) > 150

  const typeLabel: Record<string, string> = {
    tool_call: 'Tool call', code_push: 'Code push', result: 'Result',
    error: 'Error', task_executed: 'Task done', decision: 'Decision',
    heartbeat: 'Heartbeat', auth_check: 'Auth', thinking: 'Thinking',
    action: 'Executing', code: 'Writing code', signal_skipped: 'Skipped',
    hold: 'Held', ai_response: 'Response', email_triage: 'Email triage',
    reasoning: 'Reasoning',
  }
  const label = entry.tag ?? typeLabel[entry.type] ?? entry.type.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

  const labelColors: Record<string, string> = {
    result:        'text-emerald-400',
    task_executed: 'text-emerald-400',
    error:         'text-red-400',
    code_push:     'text-blue-400',
    tool_call:     'text-amber-300',
    decision:      'text-amber-300',
    reasoning:     'text-purple-300',
    action:        'text-blue-400',
    code:          'text-blue-400',
    ai_response:   'text-purple-300',
  }
  const lc = labelColors[entry.type] ?? 'text-text-secondary'

  return (
    <div className={`pl-3 py-0.5 border-l-2 ${borderColor} hover:bg-purple-500/5 hover:shadow-[0_0_12px_rgba(168,85,247,0.1)] transition-colors rounded-r-lg`}>
      {/* Top row: icon + label + timestamp + badges */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {(entry.icon ?? DEFAULT_TYPE_ICONS[entry.type]) && (
          <WorklogIcon icon={entry.icon ?? DEFAULT_TYPE_ICONS[entry.type]} />
        )}
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${lc}`}>{label}</span>
        {entry.signal_priority && entry.signal_priority !== 'P3' && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
            entry.signal_priority === 'P0' ? 'bg-red-500/20 text-red-400 border border-red-500/40' :
            entry.signal_priority === 'P1' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
            'bg-blue-500/20 text-blue-300 border border-blue-500/40'
          }`}>{entry.signal_priority}</span>
        )}
        <span className="text-[10px] text-text-muted ml-auto">{formatTime(entry.created_at ?? entry.timestamp)}</span>
        {duration != null && entry.status === 'done' && (
          <span className="text-[10px] text-text-muted">{formatDuration(duration)}</span>
        )}
        {isRunning && <Loader2 size={9} className="animate-spin text-amber-400" />}
      </div>
      {/* Content text — actual substance */}
      {entry.content && (
        <p className="text-xs text-text-secondary mt-1 break-words leading-relaxed pl-0.5">
          {entry.content}
        </p>
      )}
      {/* Result preview section */}
      {entry.result_preview && (
        <p className="text-[10px] text-honey-300/90 mt-1 pl-2 border-l border-purple-500/40 leading-relaxed bg-purple-500/10 rounded-r-sm">
          → {entry.result_preview}
        </p>
      )}
      {/* Conclusion */}
      {entry.conclusion && (
        <p className="text-[10px] text-honey-400 mt-1 font-medium leading-relaxed">
          ✓ {entry.conclusion}
        </p>
      )}
      {/* Email sender */}
      {(entry.type === 'email_processed' || entry.type === 'email_triage') && entry.metadata?.sender ? (
        <div className="flex items-center gap-1.5 mt-1 pl-0.5">
          <Mail size={10} className="text-text-muted" />
          <span className="text-[10px] text-text-muted">from</span>
          <span className="text-[10px] font-medium text-text-primary">{String(entry.metadata.sender)}</span>
        </div>
      ) : null}
      {/* Collapsible reasoning */}
      {hasLongReasoning && (
        <div className="mt-1 pl-0.5">
          {!reasoningExpanded ? (
            <div className="flex items-start gap-1.5">
              <span className="text-[10px] text-purple-300/70 italic leading-relaxed">
                {entry.reasoning!.slice(0, 100)}…
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); setReasoningExpanded(true) }}
                className="text-[9px] text-purple-400 hover:text-purple-300 shrink-0 mt-0.5"
              >
                expand
              </button>
            </div>
          ) : (
            <div className="flex items-start gap-1.5">
              <span className="text-[10px] text-purple-300/70 italic leading-relaxed">
                {entry.reasoning}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); setReasoningExpanded(false) }}
                className="text-[9px] text-purple-400 hover:text-purple-300 shrink-0 mt-0.5"
              >
                collapse
              </button>
            </div>
          )}
        </div>
      )}
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
  const { worklog, isExecuting, addWorklogEntry } = useAppStore(
    useShallow((s) => ({ worklog: s.worklog, isExecuting: s.isExecuting, addWorklogEntry: s.addWorklogEntry }))
  )
  const [dbLoaded, setDbLoaded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Merge DB worklog entries (newest first from API, oldest first in store for timeline)
  const mergeDbEntries = (entries: { type: string; content: string; status: string; created_at: string; decision_type?: string; reasoning?: string; conclusion?: string; metadata?: Record<string,unknown>; icon?: string; tag?: string; result_preview?: string }[]) => {
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
          conclusion: e.conclusion,
          metadata: e.metadata,
          created_at: e.created_at,
          icon: e.icon,
          tag: e.tag,
          result_preview: e.result_preview,
        })
        existingContents.add(key)
      }
    }
  }

  // Seed worklog from DB on mount — always merge, never skip
  useEffect(() => {
    if (dbLoaded) return
    fetch("/api/worklog?limit=200")
      .then(r => r.json())
      .then((d: { entries?: { type: string; content: string; status: string; created_at: string; decision_type?: string; reasoning?: string; conclusion?: string; metadata?: Record<string,unknown>; icon?: string; tag?: string; result_preview?: string }[] }) => {
        if (d.entries && d.entries.length > 0) mergeDbEntries(d.entries)
        setDbLoaded(true)
      })
      .catch(() => setDbLoaded(true))
  }, [dbLoaded, addWorklogEntry])

  // Poll DB every 30s to pick up background entries (scheduler, proactive sweeps, etc.)
  useEffect(() => {
    if (!dbLoaded) return
    const t = setInterval(() => {
      fetch("/api/worklog?limit=200")
        .then(r => r.json())
        .then((d: { entries?: { type: string; content: string; status: string; created_at: string; decision_type?: string; reasoning?: string; conclusion?: string; metadata?: Record<string,unknown>; icon?: string; tag?: string; result_preview?: string }[] }) => {
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
          fetch("/api/worklog?limit=200")
            .then(r => r.json())
            .then((d: { entries?: { type: string; content: string; status: string; created_at: string; decision_type?: string; reasoning?: string; conclusion?: string; metadata?: Record<string,unknown>; icon?: string; tag?: string; result_preview?: string }[] }) => {
              if (d.entries && d.entries.length > 0) mergeDbEntries(d.entries)
            })
            .catch(() => {})
        }, 1500)
      }
    }
    window.addEventListener("sparkie_step_trace", handler)
    return () => window.removeEventListener("sparkie_step_trace", handler)
  }, [addWorklogEntry, dbLoaded])

  // Real-time worklog_card events from liveEnqueue
  useEffect(() => {
    const handler = (ev: Event) => {
      const card = (ev as CustomEvent<{
        tool?: string; icon?: string; summary?: string; result_preview?: string;
        duration?: number; status?: string; decision_type?: string; tag?: string;
        reasoning?: string; conclusion?: string; ts?: string
      }>).detail
      if (!card?.tool) return

      // ── Noise filter: skip content-free or noise entries ─────────────────────
      const summary = card.summary ?? ''
      const isNoise =
        !summary.trim() ||
        summary === 'Analyzed' ||
        summary === 'Response ready' ||
        summary === "I've learned something new" ||
        summary.length < 3

      if (isNoise) return

      addWorklogEntry({
        type: card.tool,
        content: card.summary ?? '',
        icon: card.icon,
        tag: card.tag,
        result_preview: card.result_preview,
        duration: card.duration,
        status: (card.status as WorklogEntry['status']) ?? 'done',
        decision_type: card.decision_type as WorklogEntry['decision_type'],
        reasoning: card.reasoning,
        conclusion: card.conclusion,
        created_at: card.ts,
      })
    }
    window.addEventListener("sparkie_worklog_card", handler)
    return () => window.removeEventListener("sparkie_worklog_card", handler)
  }, [addWorklogEntry])

  // Only auto-scroll when worklog grows while user is at/executing; otherwise newest-first
  // timeline should stay scrolled to top so newest entries are immediately visible
  useEffect(() => {
    if (isExecuting && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [worklog.length, isExecuting])

  // Filter noise entries and by search query
  const filteredWorklog = worklog.filter((e: WorklogEntry) => {
    if (e.content === 'Response ready' || e.content === 'Reasoning') return false
    if (!searchQuery) return true
    return (
      e.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e as any).reasoning?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e as any).conclusion?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })

  if (filteredWorklog.length === 0 && !isExecuting) {
    if (compact) return null
    const noResults = worklog.length > 0 && searchQuery.length > 0
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted p-8">
        <div className="w-16 h-16 rounded-2xl bg-purple-500/20 flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(168,85,247,0.3)]">
          <Brain size={24} className="text-purple-400" />
        </div>
        {noResults ? (
          <>
            <p className="text-sm font-medium text-honey-300 mb-1">No results for "{searchQuery}"</p>
            <button onClick={() => setSearchQuery('')} className="text-xs text-honey-400 hover:text-honey-300 mt-1">Clear search</button>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-honey-300 mb-1">Sparkie's inner monologue</p>
            <p className="text-xs text-center text-purple-300/60 italic">Her thoughts, actions, and learnings as she works</p>
          </>
        )}
      </div>
    )
  }

  if (compact) {
    // Compact mode: simple list without timeline
    return (
      <div className="p-2 space-y-0.5">
        {filteredWorklog.slice(-10).reverse().map((entry: WorklogEntry) => (
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
      <div className="px-4 py-3 border-b border-purple-500/20 shrink-0 bg-gradient-to-b from-purple-900/10 to-transparent">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-honey-400 flex items-center gap-1.5">
              <span className="p-0.5 rounded-lg bg-purple-500/20 shadow-[0_0_10px_rgba(168,85,247,0.3)]">
                <Activity size={12} className="text-honey-400" />
              </span>
              AI Work Log
            </p>
            <p className="text-[10px] text-purple-300/60 mt-0.5 italic">Sparkie's inner monologue as she stays awake, sensing signals and changes all around.</p>
          </div>
          {isExecuting && (
            <div className="flex items-center gap-1.5 text-[10px] text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Processing…
            </div>
          )}
        </div>
        {/* Search */}
        <div className="relative mt-2">
          <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search entries..."
            className="w-full pl-7 pr-3 py-1.5 rounded-lg bg-hive-elevated border border-hive-border text-[11px] text-text-secondary placeholder:text-text-muted/50 focus:outline-none focus:border-honey-500/40"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary text-[9px]">✕</button>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Entry count header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-purple-500/20 text-[11px] text-text-muted bg-gradient-to-r from-purple-900/15 via-hive-elevated to-amber-900/10">
          <span>{filteredWorklog.length} entries</span>
          <span>·</span>
          <span className="text-amber-400 flex items-center gap-1 animate-pulse">
            <Activity size={10} /> Watching for signals
          </span>
        </div>
        <div className="relative">
          {/* Vertical spine */}
          <div className="absolute left-[5px] top-2 bottom-2 w-px bg-gradient-to-b from-purple-500/60 via-purple-500/30 to-amber-500/40 shadow-[0_0_8px_rgba(168,85,247,0.5),0_0_16px_rgba(168,85,247,0.2)]" />

          <div className="space-y-0.5">
            {filteredWorklog.slice().reverse().map((entry: WorklogEntry, idx: number) => {
              const isMemory  = entry.type === "memory_learned" || entry.type === "memory_updated"
              const isProactive = entry.type === "proactive_check" || entry.decision_type === "proactive"
              const isEmail   = entry.type === "email_processed" || entry.type === "email_skipped"
              const isAiResp  = entry.type === "ai_response"
              const isMsgBatch = entry.type === "message_batch"
              const isSelfAssessment = entry.type === "self_assessment"
              const isExpanded = expandedId === entry.id
              const nodeStyle = getNodeStyle(entry.type, entry.status, entry.decision_type)

              // Show timestamp anchor for first entry or when time changes significantly
              // reversedDisplayOrder matches the render order (newest first)
              const reversedDisplayOrder = filteredWorklog.slice().reverse()
              const prevEntry = idx > 0 ? reversedDisplayOrder[idx - 1] : null
              const prevTs = prevEntry ? new Date(prevEntry.created_at ?? prevEntry.timestamp).getTime() : 0
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
                  <div className="flex gap-3 group cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : entry.id)}>
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center shrink-0">
                      <div className={`w-[13px] h-[13px] rounded-full mt-1 shadow-[0_0_6px_rgba(168,85,247,0.5)] ${nodeStyle}`} />
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
                      {/* Expanded detail panel */}
                      {isExpanded && (
                        <div className="mt-2 p-2 rounded-lg bg-hive-elevated border border-hive-border/60 flex flex-col gap-1.5">
                          {(entry as any).reasoning && (
                            <div>
                              <span className="text-[9px] text-purple-400 uppercase font-semibold tracking-wide">Reasoning</span>
                              <p className="text-[10px] text-purple-200/80 italic leading-relaxed mt-0.5">{(entry as any).reasoning}</p>
                            </div>
                          )}
                          {(entry as any).conclusion && (
                            <div>
                              <span className="text-[9px] text-emerald-400 uppercase font-semibold tracking-wide">Conclusion</span>
                              <p className="text-[10px] text-emerald-300/80 leading-relaxed mt-0.5">✓ {(entry as any).conclusion}</p>
                            </div>
                          )}
                          {(entry as any).metadata && (
                            <div>
                              <span className="text-[9px] text-text-muted uppercase font-semibold tracking-wide">Metadata</span>
                              <pre className="text-[9px] text-text-muted/60 mt-0.5 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                                {JSON.stringify((entry as any).metadata, null, 2)}
                              </pre>
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] text-text-muted/40">{entry.type}</span>
                            {(entry as any).duration != null && (
                              <span className="text-[9px] text-text-muted/40">· {formatDuration((entry as any).duration)}</span>
                            )}
                          </div>
                        </div>
                      )}
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
