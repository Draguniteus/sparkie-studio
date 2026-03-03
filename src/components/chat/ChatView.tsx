'use client'

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store/appStore'
import { ChatInput } from './ChatInput'
import { MessageBubble } from './MessageBubble'
import { Code, Share, MoreHorizontal, Brain } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export function ChatView() {
  const { chats, currentChatId, ideOpen, toggleIDE, userAvatarUrl, longTaskLabel } = useAppStore()
  const chat = chats.find(c => c.id === currentChatId)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chat?.messages])

  if (!chat) return null

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Chat Header */}
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
              ideOpen
                ? 'bg-honey-500/15 text-honey-500'
                : 'hover:bg-hive-hover text-text-muted hover:text-text-secondary'
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

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 md:px-4 py-3 md:py-4 space-y-3 md:space-y-4">
        {chat.messages.filter(msg => msg.isStreaming || msg.content).map((msg) => (
          <MessageBubble key={msg.id} message={msg} userAvatarUrl={userAvatarUrl} />
        ))}
      </div>

      {/* "In memory:..." long-task chip — slides in during extended AI operations */}
      <div className={`px-3 md:px-4 overflow-hidden transition-all duration-300 ease-out ${longTaskLabel ? 'max-h-10 opacity-100 mb-1.5' : 'max-h-0 opacity-0'}`}>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-600/15 via-blue-600/10 to-honey-500/10 border border-purple-500/20 w-fit max-w-full">
          <Brain size={11} className="text-purple-400 shrink-0 animate-pulse" />
          <span className="text-[11px] text-purple-300/80 truncate font-medium">{longTaskLabel ?? ''}</span>
        </div>
      </div>

      {/* Chat Input */}
      <div className="px-3 md:px-4 pb-3 md:pb-4">
        <ChatInput />
      </div>
    </div>
  )
}
