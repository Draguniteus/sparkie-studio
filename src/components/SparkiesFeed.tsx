"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Brain, Mail, RefreshCw, MailX, Cpu, Zap, BookOpen, Target, Shield, Clock, MessageSquare } from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────
interface WorklogEntry {
  id: string
  type: string
  content: string
  metadata: Record<string, unknown>
  created_at: string
  conclusion?: string
  reasoning?: string
  decision_type?: string
}

interface BrainStats {
  emails: number
  messages: number
}

// ─── Strip markdown ───────────────────────────────────────────────────────────
function stripMarkdown(text: string): string {
  return text
    .replace(/<minimax:tool_call>[\s\S]*?<\/minimax:tool_call>/g, '')
    .replace(/<invoke[\s\S]*?<\/invoke>/g, '')
    .replace(/<parameter[^>]*>[\s\S]*?<\/parameter>/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/\|[^\n]*/g, '')
    .replace(/^\s*---+\s*$/gm, '')
    .trim()
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function formatTs(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ─── Dot color by entry type ──────────────────────────────────────────────────
function getDotColor(type: string): string {
  if (type.startsWith('email')) return '#f59e0b'
  if (type === 'memory_learned') return '#a78bfa'
  if (type.includes('cron') || type.includes('proactive')) return '#14b8a6'
  if (type === 'self_reflection') return '#c084fc'
  if (type.includes('rule')) return '#f59e0b'
  if (type === 'goal_update' || type === 'goal_created') return '#22c55e'
  if (type === 'message_batch') return '#60a5fa'
  return '#6b7280'
}

// ─── Entry renderers ──────────────────────────────────────────────────────────

function EmailEntry({ entry }: { entry: WorklogEntry }) {
  const meta = entry.metadata ?? {}
  const sender = (meta.sender as string) ?? (meta.from as string) ?? ''
  const subject = (meta.subject as string) ?? ''
  const decision = (meta.decision as string) ?? (entry.decision_type as string) ?? ''
  const monologue = (meta.monologue as string) ?? (meta.inner_thought as string) ?? (entry.reasoning as string) ?? ''
  const skipped = entry.type === 'email_skipped' || decision?.toLowerCase().includes('skip')

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-1.5 flex-wrap">
        <span className="text-[10px] text-text-muted">{skipped ? <MailX size={10} className="inline text-text-muted/50" /> : <Mail size={10} className="inline text-honey-400/70" />}</span>
        {sender && (
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/8 bg-white/5 text-text-muted font-medium truncate max-w-[140px]">
            {sender.replace(/<[^>]+>/g, '').slice(0, 30)}
          </span>
        )}
        {subject && (
          <span className="text-[10px] text-text-secondary leading-tight truncate max-w-[180px]">{subject.slice(0, 50)}</span>
        )}
      </div>
      {monologue && (
        <p className="text-[10px] italic text-purple-200/70 leading-relaxed pl-1 border-l border-purple-500/20">
          &ldquo;{monologue.slice(0, 150)}&rdquo;
        </p>
      )}
      {decision && (
        <div className="flex items-center gap-1 text-[9px] text-text-muted/60">
          <span>▽</span>
          <span>{skipped ? 'I skipped this one' : decision.slice(0, 80)}</span>
        </div>
      )}
      {!monologue && !decision && (
        <p className="text-[10px] text-text-muted leading-relaxed">{(entry.conclusion ?? entry.content).slice(0, 100)}</p>
      )}
    </div>
  )
}

function LearnedEntry({ entry }: { entry: WorklogEntry }) {
  const meta = entry.metadata ?? {}
  const ruleName = (meta.rule_name as string) ?? (meta.category as string) ?? ''
  const content = entry.conclusion ?? entry.content

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold text-purple-300">I&apos;ve learned something new</span>
      </div>
      <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-2.5 relative">
        <p className="text-[10px] text-text-secondary leading-relaxed pr-12">{content.slice(0, 200)}</p>
        {ruleName && (
          <span className="absolute bottom-2 right-2 text-[8px] px-1.5 py-0.5 rounded bg-violet-600 text-white font-medium">
            {ruleName.slice(0, 12)}
          </span>
        )}
      </div>
    </div>
  )
}

function ProactiveEntry({ entry }: { entry: WorklogEntry }) {
  const meta = entry.metadata ?? {}
  const topicName = (meta.topic as string) ?? (meta.topic_name as string) ?? ''
  const result = entry.conclusion ?? entry.content

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-teal-300/80 font-medium">Proactive check:</span>
        {topicName && (
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/20">
            {topicName.slice(0, 30)}
          </span>
        )}
      </div>
      {result && (
        <p className="text-[10px] text-text-muted leading-relaxed">{result.slice(0, 120)}</p>
      )}
    </div>
  )
}

function CronEntry({ entry }: { entry: WorklogEntry }) {
  const meta = entry.metadata ?? {}
  const checks = (meta.checks_passed as number) ?? 0
  const result = entry.conclusion ?? entry.content

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Clock size={9} className="text-teal-400/60 shrink-0" />
        <span className="text-[10px] text-teal-300/70 font-medium">
          Cron sweep complete
          {checks > 0 && <span className="ml-1 text-text-muted/60">— {checks} checks passed</span>}
        </span>
      </div>
      {result && result !== entry.content && (
        <p className="text-[10px] text-text-muted/70 leading-relaxed">{result.slice(0, 100)}</p>
      )}
    </div>
  )
}

function ReflectionEntry({ entry }: { entry: WorklogEntry }) {
  return (
    <div className="space-y-1">
      <span className="text-[10px] text-purple-300/70 font-medium">🪞 Self-reflection</span>
      <p className="text-[10px] italic text-text-muted leading-relaxed">{(entry.conclusion ?? entry.content).slice(0, 180)}</p>
    </div>
  )
}

function GoalEntry({ entry }: { entry: WorklogEntry }) {
  const meta = entry.metadata ?? {}
  const goalName = (meta.goal_name as string) ?? (meta.name as string) ?? ''
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Target size={9} className="text-green-400/70 shrink-0" />
        <span className="text-[10px] text-green-300/80 font-medium">{goalName || 'Goal update'}</span>
      </div>
      <p className="text-[10px] text-text-muted leading-relaxed">{(entry.conclusion ?? entry.content).slice(0, 120)}</p>
    </div>
  )
}

function RuleEntry({ entry }: { entry: WorklogEntry }) {
  const meta = entry.metadata ?? {}
  const condition = (meta.condition as string) ?? ''
  const action = (meta.action as string) ?? ''
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Shield size={9} className="text-honey-400/70 shrink-0" />
        <span className="text-[10px] text-honey-300/80 font-medium">Behavior rule</span>
      </div>
      {condition && action ? (
        <p className="text-[10px] text-text-muted font-mono">IF {condition.slice(0, 50)} → {action.slice(0, 40)}</p>
      ) : (
        <p className="text-[10px] text-text-muted leading-relaxed">{(entry.conclusion ?? entry.content).slice(0, 120)}</p>
      )}
    </div>
  )
}

function MessageBatchEntry({ entry }: { entry: WorklogEntry }) {
  const meta = entry.metadata ?? {}
  const count = (meta.count as number) ?? 1
  return (
    <div className="flex items-center gap-1.5">
      <MessageSquare size={9} className="text-blue-400/60 shrink-0" />
      <span className="text-[10px] text-text-muted/70">{count > 1 ? `${count} messages` : '1 message'} — {(entry.conclusion ?? entry.content).slice(0, 80)}</span>
    </div>
  )
}

function DefaultEntry({ entry }: { entry: WorklogEntry }) {
  const text = (entry.conclusion ?? entry.content ?? '').slice(0, 140)
  return <p className="text-[10px] text-text-muted leading-relaxed">{text}</p>
}

function renderEntry(entry: WorklogEntry) {
  const t = entry.type
  if (t === 'email_processed' || t === 'email_skipped' || t.startsWith('email')) return <EmailEntry entry={entry} />
  if (t === 'memory_learned' || t === 'memory_updated') return <LearnedEntry entry={entry} />
  if (t.includes('proactive')) return <ProactiveEntry entry={entry} />
  if (t.includes('cron')) return <CronEntry entry={entry} />
  if (t === 'self_reflection' || t === 'reflection') return <ReflectionEntry entry={entry} />
  if (t === 'goal_update' || t === 'goal_created' || t === 'goal_completed') return <GoalEntry entry={entry} />
  if (t.includes('rule')) return <RuleEntry entry={entry} />
  if (t === 'message_batch') return <MessageBatchEntry entry={entry} />
  return <DefaultEntry entry={entry} />
}

// ─── Timeline item ────────────────────────────────────────────────────────────
function TimelineItem({ entry, isLast }: { entry: WorklogEntry; isLast: boolean }) {
  const dot = getDotColor(entry.type)
  return (
    <div className="flex gap-0" style={{ minHeight: 40 }}>
      {/* Left: timestamp */}
      <div className="shrink-0 w-14 flex flex-col items-end pr-2 pt-1">
        <span className="text-[8px] text-text-muted/50 tabular-nums leading-tight">{formatTs(entry.created_at)}</span>
      </div>
      {/* Center: line + dot */}
      <div className="shrink-0 flex flex-col items-center" style={{ width: 16 }}>
        <div
          className="w-2 h-2 rounded-full shrink-0 mt-1 ring-2 ring-hive-600"
          style={{ background: dot }}
        />
        {!isLast && (
          <div className="w-px flex-1 mt-1" style={{ background: 'rgba(139, 92, 246, 0.12)' }} />
        )}
      </div>
      {/* Right: content */}
      <div className="flex-1 pl-2.5 pb-4 pt-0.5 min-w-0">
        {renderEntry(entry)}
      </div>
    </div>
  )
}

// ─── Live Activity Ticker (real-time stream indicator) ────────────────────────
function LiveActivityTicker() {
  const [text, setText] = useState('')
  const [thoughtText, setThoughtText] = useState('')
  const [active, setActive] = useState(false)
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onChunk = (e: Event) => {
      const chunk = (e as CustomEvent<string>).detail
      if (!chunk) return
      const clean = stripMarkdown(chunk)
      if (!clean) return
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current)
        clearTimerRef.current = null
        setText('')
        setThoughtText('')
      }
      setActive(true)
      setText(prev => (prev + clean).slice(-600))
    }
    const onThought = (e: Event) => {
      const t = (e as CustomEvent<string>).detail
      if (!t?.trim()) return
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current)
        clearTimerRef.current = null
      }
      setActive(true)
      setThoughtText((t ?? '').slice(0, 300))
      setText('')
    }
    const onDone = () => {
      setActive(false)
      clearTimerRef.current = setTimeout(() => {
        setText('')
        setThoughtText('')
        clearTimerRef.current = null
      }, 20000)
    }
    window.addEventListener('sparkie:live-chunk', onChunk)
    window.addEventListener('sparkie:thought-step', onThought)
    window.addEventListener('sparkie:live-done', onDone)
    return () => {
      window.removeEventListener('sparkie:live-chunk', onChunk)
      window.removeEventListener('sparkie:thought-step', onThought)
      window.removeEventListener('sparkie:live-done', onDone)
    }
  }, [])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [text, thoughtText])

  if (!active && !text && !thoughtText) return null

  return (
    <div className="mx-3 mt-2 mb-1 rounded-xl border border-purple-500/25 bg-purple-500/5 overflow-hidden shrink-0">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-purple-500/15">
        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse shrink-0" />
        <span className="text-[10px] font-semibold text-purple-300/80 uppercase tracking-wide">Sparkie is thinking</span>
      </div>
      <div ref={scrollRef} className="px-3 py-2 min-h-[200px] max-h-64 overflow-y-auto">
        {thoughtText ? (
          <p className="text-[11px] text-purple-200/80 leading-relaxed italic whitespace-pre-wrap break-words">
            🧠 {thoughtText}
            {active && <span className="inline-block w-1 h-3 bg-purple-400/70 animate-pulse ml-0.5 rounded-sm align-middle" />}
          </p>
        ) : (
          <p className="text-[11px] text-text-secondary leading-relaxed whitespace-pre-wrap break-words font-mono">
            {text}
            {active && <span className="inline-block w-1 h-3 bg-purple-400/70 animate-pulse ml-0.5 rounded-sm align-middle" />}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Main Brain Log ───────────────────────────────────────────────────────────
export function SparkiesFeed() {
  const [entries, setEntries] = useState<WorklogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<BrainStats>({ emails: 0, messages: 0 })

  const loadEntries = useCallback(async () => {
    try {
      const r = await fetch('/api/worklog?limit=200')
      if (r.ok) {
        const data = await r.json() as { entries: WorklogEntry[]; stats: BrainStats }
        setEntries(data.entries ?? [])
        setStats(data.stats ?? { emails: 0, messages: 0 })
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadEntries() }, [loadEntries])

  useEffect(() => {
    const handler = () => { loadEntries() }
    window.addEventListener('sparkie:worklog-refresh', handler)
    return () => window.removeEventListener('sparkie:worklog-refresh', handler)
  }, [loadEntries])

  useEffect(() => {
    const interval = setInterval(loadEntries, 30_000)
    return () => clearInterval(interval)
  }, [loadEntries])

  return (
    <div className="h-full flex flex-col bg-hive-600 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-hive-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
            <Brain size={13} className="text-purple-400" />
          </div>
          <div>
            <div className="text-xs font-semibold text-text-primary">Brain Log</div>
            <div className="text-[10px] text-text-muted">Sparkie&apos;s inner world</div>
          </div>
        </div>
        <button
          onClick={() => { setLoading(true); loadEntries() }}
          className="w-6 h-6 rounded flex items-center justify-center hover:bg-hive-hover text-text-muted hover:text-purple-400 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Summary bar */}
      <div className="px-3 py-1.5 border-b border-hive-border/40 shrink-0" style={{ background: 'rgba(139,92,246,0.04)' }}>
        <div className="flex items-center gap-3 text-[9px] text-text-muted/70">
          <span className="flex items-center gap-1">
            <Mail size={8} />
            <span>Processed {stats.emails} emails in last 24h</span>
          </span>
          <span className="text-text-muted/30">·</span>
          <span className="flex items-center gap-1">
            <Cpu size={8} />
            <span>{stats.messages} conversations</span>
          </span>
          <span className="text-text-muted/30">·</span>
          <span className="text-text-muted/50">I&apos;m waiting for more…</span>
        </div>
      </div>

      {/* Live Activity */}
      <LiveActivityTicker />

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto py-3 px-1" style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, black 8px, black calc(100% - 24px), transparent 100%)' }}>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Brain size={18} className="text-purple-400/30 animate-pulse" />
            <span className="text-[10px] text-text-muted/50">Loading brain activity…</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <div className="w-9 h-9 rounded-full bg-purple-500/10 flex items-center justify-center">
              <BookOpen size={16} className="text-purple-400/40" />
            </div>
            <p className="text-[10px] text-text-muted/60 max-w-[160px]">No brain activity yet — logs appear here as Sparkie works</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {entries.map((entry, i) => (
              <TimelineItem key={entry.id} entry={entry} isLast={i === entries.length - 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
