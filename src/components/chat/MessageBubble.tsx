'use client'

import { Message } from '@/store/appStore'
import { Sparkles, User, Copy, RefreshCw, ThumbsUp, ThumbsDown } from 'lucide-react'

interface Props {
  message: Message
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user'

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message.content)
  }

  return (
    <div className={`flex gap-3 animate-fade-in ${isUser ? 'justify-end' : ''}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-honey-500/15 flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles size={14} className="text-honey-500" />
        </div>
      )}

      {/* Content */}
      <div className={`max-w-[80%] ${isUser ? 'order-first' : ''}`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'bg-honey-500/15 text-text-primary rounded-br-md'
              : 'bg-hive-surface text-text-primary rounded-bl-md'
          }`}
        >
          <div className="whitespace-pre-wrap break-words">{message.content}</div>

          {message.isStreaming && (
            <span className="inline-flex gap-0.5 ml-1">
              <span className="w-1.5 h-1.5 rounded-full bg-honey-500" style={{ animation: 'typing 1.2s infinite 0s' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-honey-500" style={{ animation: 'typing 1.2s infinite 0.2s' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-honey-500" style={{ animation: 'typing 1.2s infinite 0.4s' }} />
            </span>
          )}
        </div>

        {/* Message Actions */}
        {!isUser && !message.isStreaming && (
          <div className="flex items-center gap-1 mt-1 ml-1">
            <button onClick={copyToClipboard} className="p-1 rounded hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors" title="Copy">
              <Copy size={12} />
            </button>
            <button className="p-1 rounded hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors" title="Regenerate">
              <RefreshCw size={12} />
            </button>
            <button className="p-1 rounded hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors" title="Good response">
              <ThumbsUp size={12} />
            </button>
            <button className="p-1 rounded hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors" title="Bad response">
              <ThumbsDown size={12} />
            </button>
            {message.model && (
              <span className="text-[10px] text-text-muted ml-2">{message.model.split('/').pop()}</span>
            )}
          </div>
        )}
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="w-7 h-7 rounded-lg bg-hive-elevated flex items-center justify-center shrink-0 mt-0.5">
          <User size={14} className="text-text-secondary" />
        </div>
      )}
    </div>
  )
}
