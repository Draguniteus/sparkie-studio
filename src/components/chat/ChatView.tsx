'use client'

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store/appStore'
import { ChatInput } from './ChatInput'
import { MessageBubble } from './MessageBubble'
import { Code, Share, MoreHorizontal } from 'lucide-react'

export function ChatView() {
  const { chats, currentChatId, ideOpen, toggleIDE } = useAppStore()
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
      <div className="h-11 flex items-center justify-between px-4 border-b border-hive-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate text-text-primary">{chat.title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded-md hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors" title="Share">
            <Share size={14} />
          </button>
          <button
            onClick={toggleIDE}
            className={`p-1.5 rounded-md transition-colors ${
              ideOpen
                ? 'bg-honey-500/15 text-honey-500'
                : 'hover:bg-hive-hover text-text-muted hover:text-text-secondary'
            }`}
            title="Toggle IDE"
          >
            <Code size={14} />
          </button>
          <button className="p-1.5 rounded-md hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors">
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {chat.messages.filter(msg => msg.isStreaming || msg.content).map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>

      {/* Chat Input */}
      <div className="px-4 pb-4">
        <ChatInput />
      </div>
    </div>
  )
}
