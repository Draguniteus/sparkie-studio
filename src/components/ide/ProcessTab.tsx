'use client'

import { useEffect, useRef, useState } from 'react'
import { useAppStore, StepTrace } from '@/store/appStore'
import { useShallow } from 'zustand/react/shallow'
import { Brain, CheckCircle, AlertCircle, Loader2, Zap, Cpu, Database, ChevronRight } from 'lucide-react'

// Map model IDs to human-readable tier names
function modelToTier(model: string): { label: string; color: string } {
  if (model.includes('qwen3-8b')) return { label: 'Sparkie · Conversational', color: 'text-blue-400' }
  if (model.includes('qwen2.5-vl')) return { label: 'Vision', color: 'text-amber-400' }
  if (model.includes('MiniMax')) return { label: 'Flame · Task Execution', color: 'text-honey-400' }
  return { label: model.slice(0, 24), color: 'text-text-muted' }
}

const STEP_ICON_MAP: Record<string, string> = {
  file: '📄', edit: '✏️', terminal: '⚡', search: '🔍',
  database: '🗃️', globe: '🌐', brain: '🧠', scroll: '📋',
  rocket: '🚀', image: '🎨', music: '🎵', video: '🎬', mic: '🎤', zap: '⚡',
}

// Stable key for React list rendering — prefer id, fallback to label+status
function traceKey(trace: StepTrace, i: number) {
  return trace.id ? `${trace.id}__${trace.status}` : `${i}__${trace.label}__${trace.status}`
}

function ThoughtCard({ text, isNew }: { text: string; isNew?: boolean }) {
  const [visible, setVisible] = useState(!isNew)
  useEffect(() => {
    if (isNew) {
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    }
  }, [isNew])
  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-6px)',
        transition: 'opacity 220ms ease, transform 220ms ease',
      }}
      className="flex items-start gap-2.5 px-3 py-2 rounded-lg border border-purple-500/20 bg-purple-500/5 text-[11px] border-l-2 border-l-purple-400"
    >
      <span className="text-[13px] shrink-0 mt-px">🧠</span>
      <span className="flex-1 leading-snug text-purple-200/80 italic break-words">{text}</span>
    </div>
  )
}

function TraceRow({ trace, isNew }: { trace: StepTrace; isNew?: boolean }) {
  const icon = STEP_ICON_MAP[trace.icon] ?? '⚡'
  const [visible, setVisible] = useState(!isNew)

  useEffect(() => {
    if (isNew) {
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    }
  }, [isNew])

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-6px)',
        transition: 'opacity 220ms ease, transform 220ms ease',
      }}
      className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border text-[11px] ${
        trace.status === 'error'
          ? 'bg-red-500/5 border-red-500/15 text-red-400'
          : trace.status === 'running'
          ? 'bg-purple-500/8 border-purple-500/20 text-purple-300'
          : 'bg-hive-elevated/40 border-white/4 text-text-secondary'
      }`}
    >
      <span className="text-[13px] shrink-0 mt-px">{icon}</span>
      <span className="flex-1 break-all leading-snug">{trace.label}</span>
      {trace.status === 'running' && (
        <Loader2 size={10} className="shrink-0 text-purple-400 animate-spin mt-0.5" />
      )}
      {trace.status === 'done' && (
        <CheckCircle size={10} className="shrink-0 text-green-400 mt-0.5" />
      )}
      {trace.status === 'error' && (
        <AlertCircle size={10} className="shrink-0 text-red-400 mt-0.5" />
      )}
      {trace.duration != null && trace.status !== 'running' && (
        <span className="text-[9px] tabular-nums shrink-0 text-text-muted/60 mt-0.5">
          {trace.duration < 1000 ? `${trace.duration}ms` : `${(trace.duration / 1000).toFixed(1)}s`}
        </span>
      )}
    </div>
  )
}

function FrozenCard({ group, index, hasLive }: { group: { chipLabel: string; traces: StepTrace[] }; index: number; hasLive: boolean }) {
  const [open, setOpen] = useState(index === 0 && !hasLive)
  const doneTraces = group.traces.filter(t => t.status === 'done')
  const errorTraces = group.traces.filter(t => t.status === 'error')
  const totalMs = group.traces.reduce((sum, t) => sum + (t.duration ?? 0), 0)

  const label = index === 0 && !hasLive ? 'Last response' : `${index + 1} response${index > 0 ? 's' : ''} ago`

  return (
    <div className="rounded-lg border border-hive-border/60 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-hive-elevated/30 hover:bg-hive-elevated/50 transition-colors text-left"
      >
        <ChevronRight size={10} className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="text-[10px] text-text-muted flex-1 truncate">{label}</span>
        <div className="flex items-center gap-2 shrink-0">
          {errorTraces.length > 0 && (
            <span className="text-[9px] text-red-400">{errorTraces.length} err</span>
          )}
          <span className="text-[9px] text-text-muted/60 tabular-nums">
            {doneTraces.length}/{group.traces.length} steps
          </span>
          {totalMs > 0 && (
            <span className="text-[9px] text-text-muted/60 tabular-nums">
              {totalMs < 1000 ? `${totalMs}ms` : `${(totalMs / 1000).toFixed(1)}s`}
            </span>
          )}
        </div>
      </button>
      {open && (
        <div className="p-2 flex flex-col gap-1 bg-hive-600/20">
          {group.traces.map((trace, ti) => (
            trace.type === 'thought'
              ? <ThoughtCard key={ti} text={trace.text ?? trace.label} />
              : <TraceRow key={ti} trace={trace} />
          ))}
        </div>
      )}
    </div>
  )
}

export function ProcessTab() {
  const { chats, currentChatId, longTaskLabel, selectedModel } = useAppStore(
    useShallow((s) => ({
      chats: s.chats,
      currentChatId: s.currentChatId,
      longTaskLabel: s.longTaskLabel,
      selectedModel: s.selectedModel,
    }))
  )
  const tier = modelToTier(selectedModel)

  const [liveTraces, setLiveTraces] = useState<StepTrace[]>([])
  // Track which trace keys are brand-new (for enter animation)
  const seenKeysRef = useRef<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevLongTaskRef = useRef<string | null>(null)

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
      const text = (e as CustomEvent<string>).detail
      if (!text?.trim()) return
      setLiveTraces(prev => [
        ...prev,
        { type: 'thought', icon: 'brain', label: text.slice(0, 200), text, status: 'done', timestamp: Date.now() },
      ])
    }
    window.addEventListener('sparkie:thought-step', handler)
    return () => window.removeEventListener('sparkie:thought-step', handler)
  }, [])

  // Auto-scroll to bottom as new traces arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [liveTraces.length])

  // Clear live traces immediately when a new execution starts (longTaskLabel transitions null → non-null)
  useEffect(() => {
    if (longTaskLabel && !prevLongTaskRef.current) {
      setLiveTraces([])
      seenKeysRef.current = new Set()
    }
    prevLongTaskRef.current = longTaskLabel ?? null
  }, [longTaskLabel])

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

  // Collect frozen toolTraces from recent assistant messages (last 3)
  const chat = chats.find(c => c.id === currentChatId)
  const recentFrozen: Array<{ chipLabel: string; traces: StepTrace[] }> = []
  if (chat) {
    const assistantMsgs = [...chat.messages]
      .filter(m => m.role === 'assistant' && m.toolTraces && m.toolTraces.length > 0)
      .slice(-3)
      .reverse()
    for (const msg of assistantMsgs) {
      recentFrozen.push({
        chipLabel: msg.chipLabel ?? 'In memory',
        traces: msg.toolTraces!,
      })
    }
  }

  const isLive = !!longTaskLabel || liveTraces.some(t => t.status === 'running')
  const hasContent = liveTraces.length > 0 || recentFrozen.length > 0

  // Determine which trace keys are new (for enter animation)
  const newKeys = new Set<string>()
  for (let i = 0; i < liveTraces.length; i++) {
    const k = traceKey(liveTraces[i], i)
    if (!seenKeysRef.current.has(k)) {
      newKeys.add(k)
      seenKeysRef.current.add(k)
    }
  }

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
            {isLive ? `${liveTraces.filter(t => t.type !== 'thought').length} steps` : `${recentFrozen.length} session${recentFrozen.length !== 1 ? 's' : ''}`}
          </span>
        )}
      </div>

      {/* Model / session metrics bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-hive-border/60 shrink-0 bg-hive-700/40">
        <Cpu size={9} className="text-text-muted shrink-0" />
        <span className={`text-[10px] font-medium ${tier.color}`}>{tier.label}</span>
        <span className="text-text-muted/40 text-[9px]">·</span>
        <Database size={9} className="text-text-muted shrink-0" />
        <span className="text-[10px] text-text-muted">
          {liveTraces.length > 0
            ? `${liveTraces.filter(t => t.status === 'done' && t.type !== 'thought').length}/${liveTraces.filter(t => t.type !== 'thought').length} steps done`
            : recentFrozen.length === 0 ? 'No sessions yet' : `${recentFrozen.length} session${recentFrozen.length !== 1 ? 's' : ''} in memory`}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {/* Live traces — interleaved thoughts + tool cards */}
        {liveTraces.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-[10px] text-text-muted px-1 mb-0.5 uppercase tracking-wide">Live</p>
            {liveTraces.map((trace, i) => {
              const k = traceKey(trace, i)
              const isNew = newKeys.has(k)
              if (trace.type === 'thought') {
                return <ThoughtCard key={k} text={trace.text ?? trace.label} isNew={isNew} />
              }
              return <TraceRow key={k} trace={trace} isNew={isNew} />
            })}
          </div>
        )}

        {/* Frozen traces from recent messages — collapsible cards */}
        {recentFrozen.map((group, gi) => (
          <FrozenCard key={gi} group={group} index={gi} hasLive={liveTraces.length > 0} />
        ))}

        {/* Empty state */}
        {!hasContent && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className="w-10 h-10 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <Zap size={18} className="text-purple-400/60" />
            </div>
            <div>
              <p className="text-xs font-medium text-text-secondary">No activity yet</p>
              <p className="text-[10px] text-text-muted mt-1">Step traces appear here when Sparkie uses tools</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
