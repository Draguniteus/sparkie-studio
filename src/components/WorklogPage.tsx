'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Brain, Zap, CheckCircle, AlertCircle, Code, Loader2,
  Mail, MessageSquare, Sparkles, RefreshCw, Cpu
} from 'lucide-react'

interface WorklogEntry {
  id: string
  type: string
  content: string
  metadata: Record<string, unknown>
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

const TYPE_CONFIG: Record<string, { icon: typeof Brain; color: string; bg: string; label: string }> = {
  proactive_check:  { icon: Sparkles,     color: 'text-honey-500',  bg: 'bg-honey-500/10',  label: 'Proactive check' },
  message_batch:    { icon: MessageSquare, color: 'text-blue-400',   bg: 'bg-blue-400/10',   label: 'Messages' },
  email_processed:  { icon: Mail,          color: 'text-green-400',  bg: 'bg-green-400/10',  label: 'Email' },
  email_skipped:    { icon: Mail,          color: 'text-text-muted', bg: 'bg-hive-elevated', label: 'Skipped' },
  memory_learned:   { icon: Brain,         color: 'text-purple-400', bg: 'bg-purple-400/10', label: "I've learned" },
  memory_updated:   { icon: RefreshCw,     color: 'text-cyan-400',   bg: 'bg-cyan-400/10',   label: 'Updated' },
  memory_forgotten: { icon: Brain,         color: 'text-orange-400', bg: 'bg-orange-400/10', label: "I've forgotten" },
  task_executed:    { icon: Zap,           color: 'text-honey-500',  bg: 'bg-honey-500/10',  label: 'Task executed' },
  code_push:        { icon: Code,          color: 'text-indigo-400', bg: 'bg-indigo-400/10', label: 'Code pushed' },
  error:            { icon: AlertCircle,   color: 'text-red-400',    bg: 'bg-red-400/10',    label: 'Error' },
  heartbeat:        { icon: Cpu,           color: 'text-text-muted', bg: 'bg-hive-elevated', label: 'Heartbeat' },
  ai_response:      { icon: CheckCircle,   color: 'text-green-400',  bg: 'bg-green-400/10',  label: 'Response' },
}

const DEFAULT_CONFIG = { icon: Sparkles, color: 'text-text-muted', bg: 'bg-hive-elevated', label: 'Note' }

function EntryCard({ entry }: { entry: WorklogEntry }) {
  const cfg = TYPE_CONFIG[entry.type] ?? DEFAULT_CONFIG
  const Icon = cfg.icon
  const meta = entry.metadata ?? {}
  const isSkipped = entry.type === 'email_skipped'

  return (
    <div className={`flex gap-3 px-4 py-3 border-b border-hive-border/40 hover:bg-hive-hover/20 transition-colors ${isSkipped ? 'opacity-55' : ''}`}>
      <div className="w-[52px] shrink-0 text-right pt-0.5">
        <span className="text-[10px] text-text-muted tabular-nums leading-none">{formatTime(entry.created_at)}</span>
      </div>
      <div className={`w-6 h-6 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0 mt-0.5`}>
        <Icon size={12} className={cfg.color} />
      </div>
      <div className="flex-1 min-w-0">
        {entry.type === 'proactive_check' && !!meta.topic && (
          <div className="text-[11px] font-semibold text-text-secondary mb-0.5">{String(meta.topic)}</div>
        )}
        {entry.type === 'message_batch' && !!meta.count && (
          <div className="text-xs font-medium text-text-secondary mb-0.5">
            You just sent me {String(meta.count)} message{Number(meta.count) !== 1 ? 's' : ''}
          </div>
        )}
        {(entry.type === 'email_processed' || entry.type === 'email_skipped') && !!meta.subject && (
          <div className="mb-0.5">
            <span className="text-xs font-medium text-text-primary">{String(meta.subject)}</span>
            {!!meta.from && <div className="text-[10px] text-text-muted">from {String(meta.from)}</div>}
          </div>
        )}
        <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap break-words">{entry.content}</p>
        {(entry.type === 'memory_learned' || entry.type === 'memory_updated') && !!meta.category && (
          <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-purple-400/10 text-purple-400 font-medium capitalize">
            {String(meta.category)}
          </span>
        )}
        {entry.type === 'email_skipped' && !!meta.reason && (
          <p className="text-[10px] text-text-muted mt-0.5 italic">I skipped this one - {String(meta.reason)}</p>
        )}
      </div>
    </div>
  )
}

export function WorklogPage() {
  const [entries, setEntries] = useState<WorklogEntry[]>([])
  const [stats, setStats] = useState<Stats>({ emails: 0, messages: 0 })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchEntries = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const res = await fetch('/api/worklog?limit=80')
      if (res.ok) {
        const data = await res.json() as { entries: WorklogEntry[]; stats: Stats }
        setEntries(data.entries ?? [])
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

        {(stats.emails > 0 || stats.messages > 0) ? (
          <p className="text-[10px] text-text-muted flex items-center gap-1.5 flex-wrap">
            {stats.emails > 0 && <span>Processed {stats.emails} email{stats.emails !== 1 ? 's' : ''}</span>}
            {stats.emails > 0 && stats.messages > 0 && <span className="opacity-40">,</span>}
            {stats.messages > 0 && <span>{stats.messages} messages in last 24h</span>}
            <span className="opacity-40">·</span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
              I&apos;m waiting for more
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
      <div className="flex-1 overflow-y-auto">
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
        {entries.map((entry) => (
          <EntryCard key={entry.id} entry={entry} />
        ))}
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
