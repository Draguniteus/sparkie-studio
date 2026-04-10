'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useAppStore, StepTrace } from '@/store/appStore'
import { useShallow } from 'zustand/react/shallow'
import { Brain, CheckCircle, AlertCircle, Loader2, Zap, Cpu, Database, ChevronRight, FileText, Pencil, Terminal, Search, Globe, Scroll, Rocket, Image, Music, Video, Mic, Hash, Clock, Hash as HashIcon, Mail, Calendar, Code2, GitBranch, Trash2, CalendarDays } from 'lucide-react'

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

// Map model IDs to human-readable tier names
function modelToTier(model: string): { label: string; color: string } {
  if (model.includes('MiniMax')) return { label: 'Sparkie · M2.7', color: 'text-honey-400' }
  return { label: model.slice(0, 24), color: 'text-text-muted' }
}

// Lucide icon map for step traces — replaces emoji
type SparkieIcon = React.ComponentType<{ size?: number | string; className?: string }>
const STEP_ICON_MAP: Record<string, { icon: SparkieIcon; color: string; tag: string; category: string }> = {
  file:      { icon: FileText,    color: 'text-blue-400',    tag: 'file',     category: 'code' },
  edit:      { icon: Pencil,      color: 'text-amber-400',  tag: 'edit',     category: 'code' },
  terminal:  { icon: Terminal,    color: 'text-green-400',  tag: 'terminal', category: 'code' },
  search:    { icon: Search,      color: 'text-purple-400', tag: 'search',   category: 'web' },
  database:  { icon: Database,    color: 'text-cyan-400',   tag: 'database', category: 'system' },
  globe:     { icon: Globe,       color: 'text-blue-400',   tag: 'web',      category: 'web' },
  brain:     { icon: Brain,        color: 'text-pink-400',   tag: 'memory',   category: 'memory' },
  scroll:    { icon: Scroll,       color: 'text-amber-300',  tag: 'log',      category: 'system' },
  rocket:    { icon: Rocket,      color: 'text-orange-400', tag: 'deploy',   category: 'code' },
  image:     { icon: Image,       color: 'text-violet-400', tag: 'image',    category: 'media' },
  music:     { icon: Music,       color: 'text-pink-300',   tag: 'music',    category: 'media' },
  video:     { icon: Video,       color: 'text-fuchsia-400',tag: 'video',    category: 'media' },
  mic:       { icon: Mic,         color: 'text-rose-400',   tag: 'audio',    category: 'media' },
  zap:       { icon: Zap,         color: 'text-yellow-400', tag: 'tool',     category: 'system' },
  mail:      { icon: Mail,        color: 'text-blue-400',   tag: 'email',    category: 'email' },
  calendar:  { icon: Calendar,    color: 'text-emerald-400', tag: 'calendar', category: 'calendar' },
  calendarToday: { icon: CalendarDays, color: 'text-emerald-400', tag: 'calendar', category: 'calendar' },
  code:      { icon: Code2,       color: 'text-blue-400',   tag: 'code',     category: 'code' },
  git:       { icon: GitBranch,   color: 'text-orange-400', tag: 'git',      category: 'code' },
  trash:     { icon: Trash2,     color: 'text-red-400',    tag: 'delete',   category: 'code' },
  check:     { icon: CheckCircle, color: 'text-emerald-400', tag: 'success',  category: 'system' },
  alert:     { icon: AlertCircle, color: 'text-amber-400',   tag: 'warning',  category: 'system' },
}

// Stable key for React list rendering — prefer id, fallback to label+status+index
function traceKey(trace: StepTrace, i: number) {
  if (trace.id) return `${trace.id}__${trace.status}`
  return `auto_${i}__${trace.label}__${trace.status}`
}

const THOUGHT_ICON_MAP: Record<string, { icon: SparkieIcon; color: string }> = {
  brain:  { icon: Brain,    color: 'text-pink-400' },
  zap:    { icon: Zap,      color: 'text-yellow-400' },
  flag:   { icon: Hash,    color: 'text-orange-400' },
  memory: { icon: Brain,   color: 'text-purple-400' },
}

function ThoughtCard({ text, icon, label }: { text: string; icon?: string; label?: string }) {
  const entry = THOUGHT_ICON_MAP[icon ?? 'brain'] ?? THOUGHT_ICON_MAP.brain
  const IconComponent = entry.icon
  const displayLabel = label || stripMarkdown(text).slice(0, 80) + (text.length > 80 ? '…' : '')
  return (
    <details className="group pl-4 py-0.5 border-l border-purple-500/30 ml-1">
      <summary className="flex items-center gap-2 cursor-pointer list-none text-[11px] text-purple-300/80 italic hover:text-purple-200 transition-colors">
        <IconComponent size={11} className={`shrink-0 ${entry.color}`} />
        <span className="flex-1">{displayLabel}</span>
        {text.length > 80 && <ChevronRight size={10} className="shrink-0 text-purple-400/40 group-open:rotate-90 transition-transform" />}
      </summary>
      {text.length > 80 && (
        <p className="text-[10px] text-purple-200/50 mt-0.5 pl-5 leading-relaxed break-words">{stripMarkdown(text)}</p>
      )}
    </details>
  )
}

function TraceRow({ trace }: { trace: StepTrace }) {
  const entry = STEP_ICON_MAP[trace.icon] ?? { icon: Zap, color: 'text-yellow-400', tag: 'tool', category: 'system' }
  const IconComponent = entry.icon

  // Format timestamp as HH:MM:SS
  const timeStr = trace.timestamp
    ? new Date(trace.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  return (
    <div className="flex items-start gap-2 pl-4 py-1 border-l border-white/10 ml-1 hover:bg-white/[0.02] transition-colors">
      <IconComponent size={12} className={`shrink-0 mt-0.5 ${entry.color}`} />
      <span className="text-[11px] text-text-secondary flex-1 break-words">{trace.label}</span>

      {/* toolName badge */}
      {trace.toolName && (
        <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-text-muted font-mono">{trace.toolName}</span>
      )}

      {/* timestamp */}
      {timeStr && (
        <span className="text-[9px] text-text-muted/60 tabular-nums shrink-0">{timeStr}</span>
      )}

      {/* duration */}
      {trace.duration != null && trace.status !== 'running' && (
        <span className="text-[9px] text-text-muted/60 tabular-nums shrink-0">
          {trace.duration < 1000 ? `${trace.duration}ms` : `${(trace.duration / 1000).toFixed(1)}s`}
        </span>
      )}

      {/* status indicators */}
      {trace.status === 'running' && <Loader2 size={10} className="shrink-0 text-purple-400 animate-spin" />}
      {trace.status === 'done' && <CheckCircle size={10} className="shrink-0 text-green-400/60" />}
      {trace.status === 'error' && <AlertCircle size={10} className="shrink-0 text-red-400" />}
    </div>
  )
}

// Returns true if a trace matches the given tag filter
function matchesTagFilter(trace: StepTrace, filter: string): boolean {
  if (filter === 'all') return true
  if (filter === 'thought') return trace.type === 'thought'
  if (filter === 'memory') return trace.type === 'memory'
  if (filter === 'tool') return trace.type === 'tool'
  // Category-level filters
  const entry = STEP_ICON_MAP[trace.icon]
  if (filter === 'code')    return trace.type === 'tool' && entry?.category === 'code'
  if (filter === 'web')     return trace.type === 'tool' && entry?.category === 'web'
  if (filter === 'media')   return trace.type === 'tool' && entry?.category === 'media'
  if (filter === 'system')  return trace.type === 'tool' && (entry?.category === 'system' || !entry)
  return true
}

function FrozenCard({ group, index, hasLive, isSettled, tagFilter, prevMsgId }: { group: { chipLabel: string; traces: StepTrace[]; msgId?: string }; index: number; hasLive: boolean; isSettled?: boolean; tagFilter: string; prevMsgId?: string }) {
  const [open, setOpen] = useState(index === 0 && !hasLive)
  // Count only non-thought traces for the step counter
  const toolTraces = group.traces.filter(t => t.type !== 'thought')
  const doneTraces = toolTraces.filter(t => t.status === 'done' || t.status === 'error')
  const errorTraces = toolTraces.filter(t => t.status === 'error')
  const totalMs = group.traces.reduce((sum, t) => sum + (t.duration ?? 0), 0)
  // 11c: detect session change — new msgId means a different conversation turn
  const isNewSession = prevMsgId != null && group.msgId !== prevMsgId

  const firstMeaningful = group.traces.find(t => t.type === 'thought' && (t.text ?? t.label ?? '').length > 20 && !/sparkie thinking/i.test(t.text ?? t.label ?? ''))
  const toolTraceLabels = group.traces.filter(t => t.type !== 'thought').map(t => t.label ?? t.toolName ?? '').filter(Boolean)
  const raw = firstMeaningful?.text ?? firstMeaningful?.label ?? toolTraceLabels[0] ?? ''
  const toolSummary = toolTraceLabels.length > 0 ? toolTraceLabels.slice(0, 3).join(' → ') : ''
  const labelRaw = raw || toolSummary || (index === 0 && !hasLive ? 'Last response' : `${index + 1} responses ago`)
  // 11a: truncate label to ~80 chars with ellipsis
  const label = labelRaw.length > 80 ? labelRaw.slice(0, 80) + '…' : labelRaw

  return (
    <>
      {/* 11c: visual divider between sessions */}
      {isNewSession && (
        <div className="flex items-center gap-2 px-2">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent" />
          <span className="text-[8px] text-purple-400/40 uppercase tracking-widest">new session</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent" />
        </div>
      )}
      <div className={`rounded-lg border overflow-hidden transition-colors duration-500 ${isSettled ? 'border-purple-400/60 bg-purple-500/10' : 'border-hive-border/60 bg-hive-elevated/30'}`}>
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 bg-hive-elevated/30 hover:bg-hive-elevated/50 transition-colors text-left"
        >
          <ChevronRight size={10} className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
          <span title={label} className="text-[10px] text-text-muted flex-1">{label}</span>
          <div className="flex items-center gap-2 shrink-0">
            {errorTraces.length > 0 && (
              <span className="text-[9px] text-red-400">{errorTraces.length} err</span>
            )}
            <span className="text-[9px] text-text-muted/60 tabular-nums">
              {doneTraces.length}/{toolTraces.length} steps
            </span>
            {totalMs > 0 && (
              <span className="text-[9px] text-text-muted/60 tabular-nums">
                {totalMs < 1000 ? `${totalMs}ms` : `${(totalMs / 1000).toFixed(1)}s`}
              </span>
            )}
          </div>
        </button>
        {open && (
          <div className="p-2 flex flex-col gap-1 bg-hive-600/20 max-h-72 overflow-y-auto">
            {group.traces
              .filter(t => matchesTagFilter(t, tagFilter))
              .map((trace, ti) => (
              trace.type === 'thought'
                ? <ThoughtCard key={ti} text={trace.text ?? trace.label ?? ''} icon={trace.icon} label={trace.label} />
                : <TraceRow key={ti} trace={trace} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

export function ProcessTab() {
  const { chats, currentChatId, longTaskLabel, selectedModel, ideTab, setIdeTab } = useAppStore(
    useShallow((s) => ({
      chats: s.chats,
      currentChatId: s.currentChatId,
      longTaskLabel: s.longTaskLabel,
      selectedModel: s.selectedModel,
      ideTab: s.ideTab,
      setIdeTab: s.setIdeTab,
    }))
  )
  const tier = modelToTier(selectedModel)

  const [liveTraces, setLiveTraces] = useState<StepTrace[]>([])
  // Track which trace keys are brand-new (for enter animation)
  const seenKeysRef = useRef<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevLongTaskRef = useRef<string | null>(null)
  const [tagFilter, setTagFilter] = useState<string>('all') // 'all' | 'tool' | 'thought' | 'memory' | 'code' | 'web' | 'media' | 'system'

  // Subscribe to live step_trace SSE events (id-based upsert for per-tool spinner→checkmark)
  useEffect(() => {
    const handler = (e: Event) => {
      const trace = (e as CustomEvent<StepTrace>).detail
      if (!trace) return
      setLiveTraces(prev => {
        if (trace.status === 'running') {
          return [...prev, trace]
        }
        // id-based upsert: find running trace with same id → update (spinner→checkmark)
        let idx = trace.id ? prev.findIndex(t => t.id === trace.id) : -1
        if (idx < 0) idx = prev.findIndex(t => t.label === trace.label && t.status === 'running')
        if (idx >= 0) return prev.map((t, i) => i === idx ? { ...t, ...trace } : t)
        return [...prev, trace]
      })
    }
    window.addEventListener('sparkie_step_trace', handler)
    return () => window.removeEventListener('sparkie_step_trace', handler)
  }, [])

  // Subscribe to thought_step events — insert as thought card BEFORE next tool batch
  useEffect(() => {
    const handler = (e: Event) => {
      const raw = (e as CustomEvent<string>).detail
      if (!raw?.trim()) return

      // Parse bold headers — each **Header** starts a new thought card
      const headerPattern = /\*\*([^*]+)\*\*(?:\s*—?\s*)?/g
      const segments: Array<{ label?: string; content: string; icon: string }> = []
      let lastIndex = 0
      let match

      while ((match = headerPattern.exec(raw)) !== null) {
        // Content before this header
        const before = raw.slice(lastIndex, match.index).trim()
        if (before && segments.length === 0) {
          // First header — any text before it is a preamble
          segments.push({ content: before, icon: 'brain' })
        }
        const label = match[1].trim()
        const afterStart = match.index + match[0].length
        const nextHeader = raw.indexOf('**', afterStart)
        const content = nextHeader > 0
          ? raw.slice(afterStart, nextHeader).trim()
          : raw.slice(afterStart).trim()

        const icon = label.toLowerCase().includes('look') || label.toLowerCase().includes('read') || label.toLowerCase().includes('check')
          ? 'search' : label.toLowerCase().includes('run') || label.toLowerCase().includes('execut')
          ? 'rocket' : label.toLowerCase().includes('save') || label.toLowerCase().includes('memory')
          ? 'memory' : 'brain'

        segments.push({ label, content: content || label, icon })
        lastIndex = nextHeader > 0 ? nextHeader : raw.length
      }

      // No headers found — treat entire text as one card
      if (segments.length === 0) {
        const clean = stripMarkdown(raw)
        if (!clean) return
        setLiveTraces(prev => [
          ...prev,
          { type: 'thought', icon: 'brain', label: clean.slice(0, 80), text: clean, status: 'done', timestamp: Date.now() },
        ])
        return
      }

      // Add each parsed segment as a separate thought card
      setLiveTraces(prev => {
        const newTraces = segments
          .filter(s => s.content || s.label)
          .map(s => ({
            type: 'thought' as const,
            icon: s.icon,
            label: s.label ? `${s.label}${s.content && s.label !== s.content ? ' — ' + s.content.slice(0, 60) : ''}` : s.content.slice(0, 80),
            text: s.content || s.label || '',
            status: 'done' as const,
            timestamp: Date.now(),
          }))
        return [...prev, ...newTraces]
      })
    }
    window.addEventListener('sparkie:thought-step', handler)
    return () => window.removeEventListener('sparkie:thought-step', handler)
  }, [])

  // rule_fired — show as a dim rule card in the live trace list
  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent<{ condition: string; action: string; tool: string }>).detail
      if (!data) return
      setLiveTraces(prev => [
        ...prev,
        { type: 'thought', icon: 'zap', label: `Rule: ${data.condition.slice(0, 80)}`, text: `IF ${data.condition} → ${data.action}`, status: 'done', timestamp: Date.now() },
      ])
    }
    window.addEventListener('sparkie:rule-fired', handler)
    return () => window.removeEventListener('sparkie:rule-fired', handler)
  }, [])

  // memory_recalled — show as a dedicated memory card
  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent<{ name: string; content: string; resuming?: boolean }>).detail
      if (!data) return
      const label = data.resuming ? `Resuming: ${data.name}` : `Memory recalled: ${data.name}`
      setLiveTraces(prev => [
        ...prev,
        { type: 'memory' as const, icon: 'memory', label, text: data.content?.slice(0, 200) ?? '', status: 'done', timestamp: Date.now(), memoryName: data.name },
      ])
    }
    window.addEventListener('sparkie:memory-recalled', handler)
    return () => window.removeEventListener('sparkie:memory-recalled', handler)
  }, [])

  // checkpoint_event — show round milestone card
  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent<{ round: number; message: string }>).detail
      if (!data) return
      setLiveTraces(prev => [
        ...prev,
        { type: 'thought', icon: 'flag', label: data.message, status: 'done', timestamp: Date.now() },
      ])
    }
    window.addEventListener('sparkie:checkpoint', handler)
    return () => window.removeEventListener('sparkie:checkpoint', handler)
  }, [])

  // Issue 16: auto-switch to Process tab when sparkie_step_trace fires while on Worklog
  useEffect(() => {
    const handler = () => {
      if (ideTab === 'worklog') {
        setIdeTab('process')
      }
    }
    window.addEventListener('sparkie_step_trace', handler)
    return () => window.removeEventListener('sparkie_step_trace', handler)
  }, [ideTab, setIdeTab])

  // Auto-scroll to top as new traces arrive (newest at top)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [liveTraces.length])

  // Clear live traces when starting a new execution or switching conversations
  useEffect(() => {
    if (longTaskLabel && !prevLongTaskRef.current) {
      setLiveTraces([])
      seenKeysRef.current = new Set()
    }
    prevLongTaskRef.current = longTaskLabel ?? null
  }, [longTaskLabel])

  // Clear traces on conversation switch to prevent stale cards stacking
  useEffect(() => {
    setLiveTraces([])
    seenKeysRef.current = new Set()
  }, [currentChatId])

  // On sparkie:live-done — immediately mark all running traces as done (stops spinner + "Working..." header)
  useEffect(() => {
    const handler = () => {
      setLiveTraces(prev => prev.map(t => t.status === 'running' ? { ...t, status: 'done' as const } : t))
    }
    window.addEventListener('sparkie:live-done', handler)
    return () => window.removeEventListener('sparkie:live-done', handler)
  }, [])


  // Clear live traces 3s after longTaskLabel clears (response done)
  useEffect(() => {
    if (!longTaskLabel && liveTraces.length > 0) {
      const t = setTimeout(() => {
        setLiveTraces([])
        seenKeysRef.current = new Set()
      }, 3000)
      return () => clearTimeout(t)
    }
  }, [longTaskLabel])

  // Collect frozen toolTraces from recent assistant messages
  const chat = chats.find(c => c.id === currentChatId)
  const frozenTraces: StepTrace[] = []
  if (chat) {
    const assistantMsgs = [...chat.messages]
      .filter(m => m.role === 'assistant' && m.toolTraces && m.toolTraces.length > 0)
      .reverse()
    for (const msg of assistantMsgs) {
      frozenTraces.push(...msg.toolTraces!)
    }
  }

  const isLive = !!longTaskLabel
  const hasContent = liveTraces.length > 0 || frozenTraces.length > 0

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-hive-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-purple-500/20 flex items-center justify-center">
            <Brain size={9} className="text-purple-400" />
          </div>
          <span className="text-xs font-semibold text-text-primary">Process</span>
          {isLive && (
            <span className="flex items-center gap-1 text-[10px] text-purple-300/80">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              {longTaskLabel ?? 'Working…'}
            </span>
          )}
        </div>
        {hasContent && (
          <span className="text-[10px] text-text-muted">
            {isLive ? `${liveTraces.filter(t => t.type !== 'thought').length} steps` : `${frozenTraces.filter(t => t.type !== 'thought').length} steps`}
          </span>
        )}
      </div>

      {/* Tag filter chips */}
      {hasContent && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-hive-border/40 shrink-0 overflow-x-auto scrollbar-hide">
          {[
            { key: 'all',    label: 'All' },
            { key: 'tool',   label: 'Tools' },
            { key: 'thought',label: 'Thoughts' },
            { key: 'memory', label: 'Memory' },
            { key: 'code',   label: 'Code' },
            { key: 'web',    label: 'Web' },
            { key: 'media',  label: 'Media' },
            { key: 'system', label: 'System' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setTagFilter(f.key)}
              className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                tagFilter === f.key
                  ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                  : 'bg-hive-elevated/40 border-hive-border/40 text-text-muted hover:text-text-secondary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Model / session metrics bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-hive-border/60 shrink-0 bg-hive-700/40">
        <Cpu size={9} className="text-text-muted shrink-0" />
        <span className={`text-[10px] font-medium ${tier.color}`}>{tier.label}</span>
        <span className="text-text-muted/40 text-[9px]">·</span>
        <Database size={9} className="text-text-muted shrink-0" />
        <span className="text-[10px] text-text-muted">
          {liveTraces.length > 0
            ? `${liveTraces.filter(t => t.status === 'done' && t.type !== 'thought').length}/${liveTraces.filter(t => t.type !== 'thought').length} steps done`
            : frozenTraces.length === 0 ? 'No steps yet' : `${frozenTraces.filter(t => t.status === 'done' && t.type !== 'thought').length} steps done`}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-0.5">
        {/* All traces — newest at TOP */}
        {[...liveTraces, ...frozenTraces].reverse()
          .filter(t => matchesTagFilter(t, tagFilter))
          .map((trace, i) => {
            const k = traceKey(trace, i)
            if (trace.type === 'thought') {
              return <ThoughtCard key={k} text={trace.text ?? trace.label ?? ''} icon={trace.icon} label={trace.label} />
            }
            return <TraceRow key={k} trace={trace} />
          })}

        {/* Empty state */}
        {!hasContent && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className="w-12 h-12 rounded-xl bg-purple-500/8 border border-purple-500/20 flex items-center justify-center animate-pulse glow-sparkie-avatar">
              <Zap size={20} className="text-purple-400/50" />
            </div>
            <div>
              <p className="text-xs font-medium text-text-secondary">Sparkie is idle</p>
              <p className="text-[10px] text-text-muted mt-1">She'll think out loud here when she works</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
