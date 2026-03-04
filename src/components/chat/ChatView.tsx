'use client'

import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { ChatInput } from './ChatInput'
import { MessageBubble } from './MessageBubble'
import { Code, Share, MoreHorizontal, Brain, ChevronRight, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

interface StepTrace { icon: string; label: string; status: 'running' | 'done' | 'error'; duration?: number }
const STEP_ICON_MAP: Record<string, string> = {
  file: '📄', edit: '✏️', terminal: '⚡', search: '🔍',
  database: '🗃️', globe: '🌐', brain: '🧠', scroll: '📋',
  rocket: '🚀', image: '🎨', music: '🎵', video: '🎬', mic: '🎤', zap: '⚡',
}

export function ChatView() {
  const { chats, currentChatId, ideOpen, toggleIDE, userAvatarUrl, longTaskLabel } = useAppStore()
  const chat = chats.find(c => c.id === currentChatId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [traceOpen, setTraceOpen] = useState(false)
  const [streamTraces, setStreamTraces] = useState<StepTrace[]>([])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chat?.messages, longTaskLabel])

  useEffect(() => {
    const handler = (e: Event) => {
      const trace = (e as CustomEvent<StepTrace>).detail
      if (!trace) return
      setStreamTraces(prev => {
        if (trace.status === 'running') return [...prev, trace]
        const existing = prev.findIndex(t => t.label === trace.label && t.status === 'running')
        if (existing >= 0) return prev.map((t, i) => i === existing ? trace : t)
        return [...prev, trace]
      })
    }
    window.addEventListener('sparkie_step_trace', handler)
    return () => window.removeEventListener('sparkie_step_trace', handler)
  }, [])

  useEffect(() => {
    if (!longTaskLabel) {
      const t = setTimeout(() => setStreamTraces([]), 3000)
      return () => clearTimeout(t)
    }
  }, [longTaskLabel])

  if (!chat) return null

  const hasActivity = !!longTaskLabel || streamTraces.length > 0
  const doneTraces = streamTraces.filter(t => t.status === 'done').length
  const errorTraces = streamTraces.filter(t => t.status === 'error').length

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="h-11 flex items-center justify-between px-3 md:px-4 border-b border-hive-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate text-text-primary">{chat.title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-2 md:p-1.5 rounded-md hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors" title="Share">
            <Share size={14} />
          </button>
          <button
            onClick={toggleIDE}
            className={`p-2 md:p-1.5 rounded-md transition-colors hidden md:flex ${
              ideOpen ? 'bg-honey-500/15 text-honey-500' : 'hover:bg-hive-hover text-text-muted hover:text-text-secondary'
            }`}
            title="Toggle Sparkie's Brain"
          >
            <Code size={14} />
          </button>
          <button className="p-2 md:p-1.5 rounded-md hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors">
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 md:px-4 py-3 md:py-4 space-y-3 md:space-y-4">
        {chat.messages.filter(msg => msg.isStreaming || msg.content).map((msg) => (
          <MessageBubble key={msg.id} message={msg} userAvatarUrl={userAvatarUrl} />
        ))}

        {hasActivity && (
          <div className="flex flex-col gap-1.5 pb-1">
            <button
              onClick={() => setTraceOpen(v => !v)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-gradient-to-r from-purple-600/12 via-blue-600/8 to-honey-500/8 border border-purple-500/25 w-fit max-w-full hover:border-purple-500/40 transition-all"
            >
              <Brain size={12} className="text-purple-400 shrink-0 animate-pulse" />
              <span className="text-[11px] text-purple-300/90 font-medium truncate max-w-[260px]">
                {longTaskLabel
                  ? `In memory: ${longTaskLabel}`
                  : streamTraces.length > 0
                    ? `In memory: ${doneTraces}/${streamTraces.length} steps${errorTraces > 0 ? ` · ${errorTraces} error` : ''}`
                    : 'In memory: working…'
                }
              </span>
              <ChevronRight
                size={10}
                className={`shrink-0 text-purple-400/60 transition-transform ${traceOpen ? 'rotate-90' : ''}`}
              />
            </button>

            {traceOpen && streamTraces.length > 0 && (
              <div className="ml-2 flex flex-col gap-1 border-l-2 border-purple-500/20 pl-3">
                {streamTraces.map((trace, i) => (
                  <div key={i} className={`flex items-center gap-2 text-[11px] ${
                    trace.status === 'running' ? 'text-honey-400' :
                    trace.status === 'error' ? 'text-red-400' : 'text-text-muted'
                  }`}>
                    <span className="text-[12px] shrink-0">{STEP_ICON_MAP[trace.icon] ?? '⚡'}</span>
                    <span className="flex-1 truncate">{trace.label}</span>
                    {trace.status === 'running' && <Loader2 size={9} className="animate-spin shrink-0" />}
                    {trace.status === 'done' && <CheckCircle size={9} className="text-green-400 shrink-0" />}
                    {trace.status === 'error' && <AlertCircle size={9} className="text-red-400 shrink-0" />}
                    {trace.duration != null && trace.status !== 'running' && (
                      <span className="text-[9px] tabular-nums shrink-0 text-text-muted">
                        {trace.duration < 1000 ? `${trace.duration}ms` : `${(trace.duration / 1000).toFixed(1)}s`}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-3 md:px-4 pb-3 md:pb-4">
        <ChatInput />
      </div>
    </div>
  )
}
