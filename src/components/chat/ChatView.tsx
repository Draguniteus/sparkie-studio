'use client'

import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { useShallow } from 'zustand/react/shallow'
import { ChatInput } from './ChatInput'
import { MessageBubble } from './MessageBubble'
import { Code, Share, MoreHorizontal } from 'lucide-react'

interface StepTrace { icon: string; label: string; status: 'running' | 'done' | 'error'; duration?: number }
const STEP_ICON_MAP: Record<string, string> = {
  file: '📄', edit: '✏️', terminal: '⚡', search: '🔍',
  database: '🗃️', globe: '🌐', brain: '🧠', scroll: '📋',
  rocket: '🚀', image: '🎨', music: '🎵', video: '🎬', mic: '🎤', zap: '⚡',
}

export function ChatView() {
  const { chats, currentChatId, ideOpen, toggleIDE, userAvatarUrl, longTaskLabel } = useAppStore(
    useShallow((s) => ({
      chats: s.chats,
      currentChatId: s.currentChatId,
      ideOpen: s.ideOpen,
      toggleIDE: s.toggleIDE,
      userAvatarUrl: s.userAvatarUrl,
      longTaskLabel: s.longTaskLabel,
    }))
  )
  const chat = chats.find(c => c.id === currentChatId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [traceOpen, setTraceOpen] = useState(false)
  const [streamTraces, setStreamTraces] = useState<StepTrace[]>([])

  useEffect(() => {
    // rAF: batch scroll to the paint cycle — prevents forced layout on every SSE token
    const raf = requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [chat?.messages, streamTraces.length, longTaskLabel])

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

  // Clear stale traces when a brand-new tool session starts (first 'running' trace of new message)
  // Detects new session by checking if all existing traces are already settled (done/error)
  useEffect(() => {
    const handler = (e: Event) => {
      const trace = (e as CustomEvent<{ status: string }>).detail
      if (trace?.status === 'running') {
        setStreamTraces(prev => {
          const allSettled = prev.length > 0 && prev.every(t => t.status !== 'running')
          if (allSettled) {
            setTraceOpen(false)
            return []
          }
          return prev
        })
      }
    }
    window.addEventListener('sparkie_step_trace', handler)
    return () => window.removeEventListener('sparkie_step_trace', handler)
  }, [])

  if (!chat) return null

  const hasActivity = !!longTaskLabel || streamTraces.length > 0

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

      {/* Live InMemoryPill — shows during active streaming */}
      {longTaskLabel && (
        <div className="px-3 md:px-4 pt-1.5 flex items-center">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-purple-600/12 via-blue-600/8 to-purple-500/8 border border-purple-500/25 w-fit max-w-full">
            <span className="text-[10px] animate-pulse">🧠</span>
            <span className="text-[10px] text-purple-300/85 font-medium truncate max-w-[280px]">{longTaskLabel}</span>
            {/* Stop button inline in the pill — click to abort */}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('sparkie_stop_stream'))}
              className="ml-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/20 text-[9px] font-medium transition-all shrink-0"
              title="Stop generating"
            >
              ■ Stop
            </button>
          </div>
        </div>
      )}
      {/* Thin pulse line for activity */}
      {hasActivity && (
        <div className="h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent animate-pulse" />
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 md:px-4 py-3 md:py-4 space-y-3 md:space-y-4">
        {chat.messages.filter(msg => msg.isStreaming || msg.content).map((msg) => (
          <MessageBubble key={msg.id} message={msg} userAvatarUrl={userAvatarUrl} />
        ))}
      </div>

      <div className="px-3 md:px-4 pb-3 md:pb-4">
        <ChatInput />
      </div>
    </div>
  )
}
