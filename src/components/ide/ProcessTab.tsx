'use client'

import { useEffect, useState } from 'react'
import { useAppStore, StepTrace } from '@/store/appStore'
import { useShallow } from 'zustand/react/shallow'
import { Brain, CheckCircle, AlertCircle, Loader2, Zap } from 'lucide-react'

const STEP_ICON_MAP: Record<string, string> = {
  file: '📄', edit: '✏️', terminal: '⚡', search: '🔍',
  database: '🗃️', globe: '🌐', brain: '🧠', scroll: '📋',
  rocket: '🚀', image: '🎨', music: '🎵', video: '🎬', mic: '🎤', zap: '⚡',
}

function TraceRow({ trace }: { trace: StepTrace }) {
  const icon = STEP_ICON_MAP[trace.icon] ?? '⚡'
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-[11px] ${
      trace.status === 'error'
        ? 'bg-red-500/5 border-red-500/15 text-red-400'
        : trace.status === 'running'
        ? 'bg-purple-500/8 border-purple-500/20 text-purple-300'
        : 'bg-hive-elevated/40 border-white/4 text-text-secondary'
    }`}>
      <span className="text-[13px] shrink-0">{icon}</span>
      <span className="flex-1 truncate">{trace.label}</span>
      {trace.status === 'running' && (
        <Loader2 size={10} className="shrink-0 text-purple-400 animate-spin" />
      )}
      {trace.status === 'done' && (
        <CheckCircle size={10} className="shrink-0 text-green-400" />
      )}
      {trace.status === 'error' && (
        <AlertCircle size={10} className="shrink-0 text-red-400" />
      )}
      {trace.duration != null && trace.status !== 'running' && (
        <span className="text-[9px] tabular-nums shrink-0 text-text-muted/60">
          {trace.duration < 1000 ? `${trace.duration}ms` : `${(trace.duration / 1000).toFixed(1)}s`}
        </span>
      )}
    </div>
  )
}

export function ProcessTab() {
  const { chats, currentChatId, longTaskLabel } = useAppStore(
    useShallow((s) => ({
      chats: s.chats,
      currentChatId: s.currentChatId,
      longTaskLabel: s.longTaskLabel,
    }))
  )

  const [liveTraces, setLiveTraces] = useState<StepTrace[]>([])

  // Subscribe to live step_trace SSE events
  useEffect(() => {
    const handler = (e: Event) => {
      const trace = (e as CustomEvent<StepTrace>).detail
      if (!trace) return
      setLiveTraces(prev => {
        if (trace.status === 'running') {
          const allSettled = prev.length > 0 && prev.every(t => t.status !== 'running')
          if (allSettled) return [trace]
          return [...prev, trace]
        }
        const idx = prev.findIndex(t => t.label === trace.label && t.status === 'running')
        if (idx >= 0) return prev.map((t, i) => i === idx ? trace : t)
        return [...prev, trace]
      })
    }
    window.addEventListener('sparkie_step_trace', handler)
    return () => window.removeEventListener('sparkie_step_trace', handler)
  }, [])

  // Clear live traces 3s after longTaskLabel clears (response done)
  useEffect(() => {
    if (!longTaskLabel && liveTraces.length > 0) {
      const t = setTimeout(() => setLiveTraces([]), 3000)
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
            {isLive ? `${liveTraces.length} steps` : `${recentFrozen.length} session${recentFrozen.length !== 1 ? 's' : ''}`}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {/* Live traces */}
        {liveTraces.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-[10px] text-text-muted px-1 mb-0.5 uppercase tracking-wide">Live</p>
            {liveTraces.map((trace, i) => (
              <TraceRow key={i} trace={trace} />
            ))}
          </div>
        )}

        {/* Frozen traces from recent messages */}
        {recentFrozen.map((group, gi) => (
          <div key={gi} className="flex flex-col gap-1">
            <p className="text-[10px] text-text-muted px-1 mb-0.5 truncate">
              {gi === 0 && liveTraces.length === 0 ? '↑ Last response' : `↑ ${gi + 1} response${gi > 0 ? 's' : ''} ago`}
            </p>
            {group.traces.map((trace, ti) => (
              <TraceRow key={ti} trace={trace} />
            ))}
          </div>
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
