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
  const [thinkingDisplay, setThinkingDisplay] = useState<string | null>(null)

  useEffect(() => {
    // rAF: batch scroll to the paint cycle — prevents forced layout on every SSE token
    const raf = requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [chat?.messages?.length, streamTraces.length, longTaskLabel])

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

  // thinking_display — render Sparkie's reasoning as italic gray text before response
  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent<{ text: string; timestamp: number }>).detail
      if (!data?.text?.trim()) return
      setThinkingDisplay(data.text)
      // Auto-clear when streaming ends (longTaskLabel goes away)
    }
    window.addEventListener('sparkie:thinking-display', handler)
    return () => window.removeEventListener('sparkie:thinking-display', handler)
  }, [])

  // Clear thinking display when longTaskLabel clears (streaming ends)
  useEffect(() => {
    if (!longTaskLabel && thinkingDisplay) {
      const t = setTimeout(() => setThinkingDisplay(null), 2000)
      return () => clearTimeout(t)
    }
  }, [longTaskLabel, thinkingDisplay])

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

  const hasActivity = !!longTaskLabel || streamTraces.length > 0 || !!thinkingDisplay

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className={`h-11 flex items-center justify-between px-3 md:px-4 border-b shrink-0 transition-colors ${
        longTaskLabel
          ? 'bg-purple-950/30 border-purple-500/20'
          : 'border-hive-border'
      }`}>
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
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-sparkie-deep border border-purple-500/25 w-fit max-w-full">
            {/* Mini avatar */}
            <div className="w-4 h-4 rounded-full overflow-hidden border border-purple-500/30 shrink-0">
              <img src="/sparkie-avatar.jpg" alt="Sparkie" className="w-full h-full object-cover" />
            </div>
            {/* Shimmer thinking dots */}
            <div className="thinking-dots shimmer flex gap-0.5 items-center">
              <span /><span /><span />
            </div>
            <span className="text-[10px] text-purple-200/80 font-medium truncate max-w-[240px]">{longTaskLabel}</span>
            {/* Stop button */}
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
        <div className="h-0.5 bg-gradient-to-r from-transparent via-purple-500/40 to-transparent animate-pulse" />
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 md:px-4 py-3 md:py-4 space-y-3 md:space-y-4">
        {/* Sparkie's thinking — shown as italic muted text before response */}
        {thinkingDisplay && (
          <div className="text-sm italic text-text-muted/70 pl-2 border-l-2 border-purple-500/30 leading-relaxed">
            {thinkingDisplay}
          </div>
        )}
        {chat.messages.filter(msg => msg.isStreaming || msg.content || msg.pendingTask).map((msg) => (
          <MessageBubble key={msg.id} message={msg} userAvatarUrl={userAvatarUrl} />
        ))}
      </div>

      <div className="px-3 md:px-4 pb-3 md:pb-4">
        <ChatInput />
      </div>
    </div>
  )
}
