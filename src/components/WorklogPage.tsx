'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Brain, Zap, CheckCircle, AlertCircle, Code, Loader2,
  Mail, MessageSquare, Sparkles, RefreshCw, Cpu, BookOpen,
  Shield, Heart, User,
} from 'lucide-react'

interface WorklogEntry {
  id: string
  type: string
  content: string
  metadata: Record<string, unknown>
  status?: string
  decision_type?: string
  reasoning?: string
  conclusion?: string
  signal_priority?: string
  created_at: string
}

interface Stats {
  emails: number
  messages: number
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// Color palette for entry types — category → styling
const TYPE_CONFIG: Record<string, {
  icon: typeof Brain
  color: string
  bg: string
  border: string
  label: string
  actionBadge?: (meta: Record<string, unknown>, content: string) => string
}> = {
  proactive_check:  {
    icon: Sparkles, color: 'text-honey-500',  bg: 'bg-honey-500/8',  border: 'border-l-honey-500/50',
    label: 'Proactive check',
    actionBadge: () => 'Running background check',
  },
  message_batch:    {
    icon: MessageSquare, color: 'text-blue-400', bg: 'bg-blue-400/8', border: 'border-l-blue-400/50',
    label: 'Messages',
    actionBadge: (_m, c) => c.includes('working on it') ? "I've got this" : "I've noted this",
  },
  email_processed:  {
    icon: Mail, color: 'text-emerald-400', bg: 'bg-emerald-400/8', border: 'border-l-emerald-400/50',
    label: 'Email processed',
    actionBadge: (m) => m.tasks ? `I've created ${m.tasks} task(s) for this` : m.replied ? "I've sent you a message" : "I've noted this, no action needed",
  },
  email_skipped:    {
    icon: Mail, color: 'text-slate-500', bg: 'bg-slate-500/6', border: 'border-l-slate-500/30',
    label: 'Email skipped',
    actionBadge: (m) => `I skipped this one — ${m.reason ?? 'looks like marketing'}`,
  },
  memory_learned:   {
    icon: Brain, color: 'text-purple-400', bg: 'bg-purple-400/8', border: 'border-l-purple-400/50',
    label: "I've learned",
    actionBadge: () => "I've learned something new",
  },
  memory_updated:   {
    icon: RefreshCw, color: 'text-violet-400', bg: 'bg-violet-400/8', border: 'border-l-violet-400/50',
    label: 'Memory updated',
    actionBadge: () => "I've updated my memory",
  },
  memory_forgotten: {
    icon: Brain, color: 'text-orange-400', bg: 'bg-orange-400/8', border: 'border-l-orange-400/50',
    label: 'Forgot',
    actionBadge: () => "I've deleted that memory",
  },
  task_executed:    {
    icon: Zap, color: 'text-honey-500', bg: 'bg-honey-500/8', border: 'border-l-honey-500/50',
    label: 'Task executed',
    actionBadge: () => "I've completed this task",
  },
  code_push:        {
    icon: Code, color: 'text-indigo-400', bg: 'bg-indigo-400/8', border: 'border-l-indigo-400/50',
    label: 'Code pushed',
    actionBadge: (m) => m.commit ? `Committed ${String(m.commit).slice(0, 8)}` : "I've pushed code",
  },
  error:            {
    icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-400/8', border: 'border-l-red-400/60',
    label: 'Error',
    actionBadge: () => "Something went wrong",
  },
  heartbeat:        {
    icon: Cpu, color: 'text-slate-500', bg: 'bg-slate-500/5', border: 'border-l-slate-500/20',
    label: 'Heartbeat',
    actionBadge: () => 'Heartbeat',
  },
  signal_skipped:   {
    icon: Cpu, color: 'text-slate-500', bg: 'bg-slate-500/5', border: 'border-l-slate-500/20',
    label: 'Skipped signal',
    actionBadge: () => 'Skipped',
  },
  ai_response:      {
    icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-400/8', border: 'border-l-emerald-400/50',
    label: 'Response sent',
    actionBadge: () => "I've sent you a message",
  },
  decision:         {
    icon: Brain, color: 'text-blue-400', bg: 'bg-blue-400/8', border: 'border-l-blue-400/50',
    label: 'Decision',
    actionBadge: () => "I made a decision",
  },
  self_assessment:  {
    icon: Heart, color: 'text-rose-400', bg: 'bg-rose-400/8', border: 'border-l-rose-400/50',
    label: 'Self-check',
    actionBadge: () => "I reflected on my work",
  },
  action:           {
    icon: Zap, color: 'text-honey-500', bg: 'bg-honey-500/8', border: 'border-l-honey-500/50',
    label: 'Action',
    actionBadge: () => 'In progress',
  },
  result:           {
    icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-400/8', border: 'border-l-green-400/50',
    label: 'Result',
    actionBadge: () => 'Done',
  },
  auth_check:       {
    icon: Shield, color: 'text-slate-400', bg: 'bg-slate-400/6', border: 'border-l-slate-400/30',
    label: 'Auth check',
    actionBadge: () => 'Auth verified',
  },
}

const DEFAULT_CONFIG = {
  icon: Sparkles, color: 'text-text-muted', bg: 'bg-hive-elevated', border: 'border-l-hive-border',
  label: 'Note', actionBadge: undefined,
}

type CollapsedGroup = {
  type: 'collapsed'
  entryType: string
  count: number
  lastTime: string
}
type SingleEntry = { type: 'single'; entry: WorklogEntry }
type RenderItem = CollapsedGroup | SingleEntry

/** Group consecutive same-type repetitive entries (heartbeat, signal_skipped) into collapsed rows */
function groupEntries(entries: WorklogEntry[]): RenderItem[] {
  const COLLAPSIBLE = new Set(['heartbeat', 'signal_skipped', 'auth_check'])
  const result: RenderItem[] = []
  let i = 0
  while (i < entries.length) {
    const e = entries[i]
    if (COLLAPSIBLE.has(e.type)) {
      let j = i + 1
      while (j < entries.length && entries[j].type === e.type) j++
      const count = j - i
      if (count > 2) {
        result.push({ type: 'collapsed', entryType: e.type, count, lastTime: e.created_at })
        i = j
      } else {
        result.push({ type: 'single', entry: e })
        i++
      }
    } else {
      result.push({ type: 'single', entry: e })
      i++
    }
  }
  return result
}

/** Memory "I've learned something new" card — purple gradient */
function MemoryCard({ entry }: { entry: WorklogEntry }) {
  const cfg = TYPE_CONFIG[entry.type] ?? DEFAULT_CONFIG
  const meta = entry.metadata ?? {}
  return (
    <div className="mx-4 my-1 rounded-xl overflow-hidden border border-purple-500/20 bg-gradient-to-br from-purple-950/60 via-indigo-950/40 to-purple-900/30 shadow-sm">
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <div className="w-5 h-5 rounded-md bg-purple-500/20 flex items-center justify-center shrink-0">
          <Brain size={11} className="text-purple-400" />
        </div>
        <span className="text-[10px] font-bold text-purple-300 uppercase tracking-widest">I&apos;ve learned something new</span>
        {!!meta.category && (
          <span className="ml-auto text-[9px] px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 font-medium capitalize">
            {String(meta.category).replace(/_/g, ' ')}
          </span>
        )}
      </div>
      <div className="px-3 pb-3 pt-0.5">
        <p className="text-[11px] text-purple-100/80 leading-relaxed italic">
          &ldquo;{entry.content}&rdquo;
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[9px] text-purple-400/60 tabular-nums">{formatTime(entry.created_at)}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
        </div>
      </div>
    </div>
  )
}

/** Collapsed repetitive entry (heartbeat ×12) */
function CollapsedRow({ item }: { item: CollapsedGroup }) {
  const cfg = TYPE_CONFIG[item.entryType] ?? DEFAULT_CONFIG
  const Icon = cfg.icon
  return (
    <div className="flex items-center gap-3 px-4 py-1.5 opacity-40 hover:opacity-70 transition-opacity">
      <div className="w-[52px] shrink-0 text-right">
        <span className="text-[9px] text-text-muted tabular-nums">{formatTime(item.lastTime)}</span>
      </div>
      <div className={`w-5 h-5 rounded-md ${cfg.bg} flex items-center justify-center shrink-0`}>
        <Icon size={10} className={cfg.color} />
      </div>
      <span className="text-[10px] text-text-muted">{cfg.label}</span>
      <span className="text-[10px] text-text-muted/50 font-medium">×{item.count}</span>
    </div>
  )
}

/** Individual worklog entry */
function EntryCard({ entry }: { entry: WorklogEntry }) {
  const cfg = TYPE_CONFIG[entry.type] ?? DEFAULT_CONFIG
  const Icon = cfg.icon
  const meta = entry.metadata ?? {}
  const isSkipped = entry.type === 'email_skipped'
  const isMemory = entry.type === 'memory_learned' || entry.type === 'memory_updated'
  const isEmail = entry.type === 'email_processed' || entry.type === 'email_skipped'
  const actionBadge = cfg.actionBadge ? cfg.actionBadge(meta, entry.content) : null

  if (isMemory) return <MemoryCard entry={entry} />

  return (
    <div className={`flex gap-3 px-4 py-2.5 border-b border-hive-border/30 hover:bg-white/[0.015] transition-colors border-l-2 ${cfg.border} ${isSkipped ? 'opacity-50' : ''}`}>
      {/* Timestamp */}
      <div className="w-[52px] shrink-0 text-right pt-1">
        <span className="text-[9px] text-text-muted tabular-nums leading-none">{formatTime(entry.created_at)}</span>
      </div>

      {/* Icon */}
      <div className={`w-6 h-6 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0 mt-0.5`}>
        <Icon size={11} className={cfg.color} />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        {/* Email subject + sender */}
        {isEmail && !!meta.subject && (
          <div className="mb-0.5">
            <span className="text-[11px] font-semibold text-text-primary">{String(meta.subject)}</span>
            {!!meta.from && (
              <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 font-medium">
                <User size={7} className="inline mr-0.5 mb-px" />{String(meta.from).replace(/<.*?>/, '').trim()}
              </span>
            )}
          </div>
        )}

        {/* Topic for proactive checks */}
        {entry.type === 'proactive_check' && !!meta.topic && (
          <div className="text-[11px] font-semibold text-text-secondary mb-0.5">{String(meta.topic)}</div>
        )}

        {/* Message batch count */}
        {entry.type === 'message_batch' && !!meta.count && (
          <div className="text-[11px] font-medium text-text-secondary mb-0.5">
            You sent me {String(meta.count)} message{Number(meta.count) !== 1 ? 's' : ''}
          </div>
        )}

        {/* Inner monologue — italics, Sparkie's personality */}
        <p className="text-[11px] text-text-secondary leading-relaxed break-words italic">{entry.content}</p>

        {/* Conclusion if present */}
        {entry.conclusion && entry.conclusion !== entry.content && (
          <p className="text-[10px] text-text-muted mt-0.5 not-italic">{entry.conclusion}</p>
        )}

        {/* Bottom row: category badge + action badge */}
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {actionBadge && (
            <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>
              {actionBadge}
            </span>
          )}
          {entry.signal_priority && entry.signal_priority !== 'P3' && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
              entry.signal_priority === 'P0' ? 'bg-red-500/20 text-red-400' :
              entry.signal_priority === 'P1' ? 'bg-orange-500/20 text-orange-400' :
              'bg-yellow-500/20 text-yellow-400'
            }`}>
              {entry.signal_priority}
            </span>
          )}
          {entry.status === 'running' && (
            <span className="flex items-center gap-1 text-[9px] text-purple-400">
              <Loader2 size={8} className="animate-spin" />running
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function WorklogPage() {
  const [entries, setEntries] = useState<WorklogEntry[]>([])
  const [stats, setStats] = useState<Stats>({ emails: 0, messages: 0 })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [newEntryIds, setNewEntryIds] = useState<Set<string>>(new Set())
  const prevIdsRef = useRef<Set<string>>(new Set())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchEntries = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const res = await fetch('/api/worklog?limit=200')
      if (res.ok) {
        const data = await res.json() as { entries: WorklogEntry[]; stats: Stats }
        const fresh = data.entries ?? []
        // Track which IDs are new since last fetch for slide-in animation
        const freshIds = new Set(fresh.map(e => e.id))
        const added = fresh.filter(e => !prevIdsRef.current.has(e.id)).map(e => e.id)
        prevIdsRef.current = freshIds
        if (added.length > 0) {
          setNewEntryIds(prev => new Set([...prev, ...added]))
          // Clear new-entry highlight after animation completes
          setTimeout(() => setNewEntryIds(prev => { const next = new Set(prev); added.forEach(id => next.delete(id)); return next }), 800)
        }
        setEntries(fresh)
        setStats(data.stats ?? { emails: 0, messages: 0 })
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void fetchEntries(false)
    intervalRef.current = setInterval(() => { void fetchEntries(true) }, 30000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchEntries])

  // Live append from store worklog (in-memory entries during current session)
  useEffect(() => {
    const handler = () => { void fetchEntries(true) }
    window.addEventListener('sparkie:worklog-refresh', handler)
    return () => window.removeEventListener('sparkie:worklog-refresh', handler)
  }, [fetchEntries])

  const grouped = groupEntries(entries)
  const shown = grouped

  return (
    <div className="h-full flex flex-col bg-hive-800 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-hive-border shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-honey-500/15 flex items-center justify-center">
              <Brain size={15} className="text-honey-500" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-text-primary leading-none mb-0.5">AI Work Log</h2>
              <p className="text-[10px] text-text-muted leading-none">My inner monologue as I stay awake, sensing signals and changes all around.</p>
            </div>
          </div>
          <button
            onClick={() => void fetchEntries(false)}
            disabled={refreshing}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-hive-hover text-text-muted hover:text-honey-500 transition-colors"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Inbox summary */}
        {(stats.emails > 0 || stats.messages > 0) ? (
          <p className="text-[10px] text-text-muted flex items-center gap-1.5 flex-wrap">
            {stats.emails > 0 && (
              <span className="flex items-center gap-1">
                <Mail size={9} className="text-emerald-400" />
                Processed {stats.emails} email{stats.emails !== 1 ? 's' : ''} in last 24h
              </span>
            )}
            {stats.emails > 0 && stats.messages > 0 && <span className="opacity-30">·</span>}
            {stats.messages > 0 && <span>{stats.messages} messages</span>}
            <span className="opacity-30">·</span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
              I&apos;m waiting for more...
            </span>
          </p>
        ) : !loading ? (
          <p className="text-[10px] text-text-muted flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
            Listening for signals...
          </p>
        ) : null}
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto pb-12">
        {loading && (
          <div className="flex items-center gap-2 px-5 py-4 text-xs text-text-muted">
            <Loader2 size={12} className="animate-spin" />
            Loading work log...
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-8 gap-3 py-16">
            <div className="w-14 h-14 rounded-2xl bg-honey-500/10 flex items-center justify-center">
              <Brain size={22} className="text-honey-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-secondary mb-1">Sparkie is listening</p>
              <p className="text-xs text-text-muted">Her work log will appear here as she processes messages, emails, and background tasks.</p>
            </div>
            <div className="text-text-muted text-sm opacity-30 flex flex-col items-center gap-0.5 mt-1">
              <span>.</span><span>.</span><span>.</span>
            </div>
          </div>
        )}

        {shown.map((item, i) =>
          item.type === 'collapsed'
            ? <CollapsedRow key={`collapsed-${i}`} item={item} />
            : <div key={item.entry.id} style={newEntryIds.has(item.entry.id) ? { animation: 'worklog-slide-in 0.35s ease-out' } : undefined}>
                <EntryCard entry={item.entry} />
              </div>
        )}
        <style>{`@keyframes worklog-slide-in { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }`}</style>


        {entries.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-4 text-[10px] text-text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
            Active — watching for signals
          </div>
        )}
      </div>
    </div>
  )
}
