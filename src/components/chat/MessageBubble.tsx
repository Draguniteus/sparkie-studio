"use client"

import { useState } from "react"
import { Message } from "@/store/appStore"
import { Sparkles, User, Copy, RefreshCw, ThumbsUp, ThumbsDown, Download, Check } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface Props {
  message: Message
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === "user"
  const [copied, setCopied] = useState(false)

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isImage = message.type === "image" && message.imageUrl

  return (
    <div className={`flex gap-3 animate-fade-in ${isUser ? "justify-end" : ""}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-honey-500/15 flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles size={14} className="text-honey-500" />
        </div>
      )}

      {/* Content */}
      <div className={`max-w-[80%] ${isUser ? "order-first" : ""}`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "bg-honey-500/15 text-text-primary rounded-br-md"
              : "bg-hive-surface text-text-primary rounded-bl-md"
          }`}
        >
          {/* Image Display */}
          {isImage && !message.isStreaming ? (
            <div className="space-y-2">
              <div className="relative group rounded-lg overflow-hidden">
                <img
                  src={message.imageUrl}
                  alt={message.imagePrompt || "Generated image"}
                  className="w-full max-w-md rounded-lg"
                  loading="lazy"
                />
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href={message.imageUrl}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-md bg-black/60 text-white hover:bg-black/80 transition-colors"
                  >
                    <Download size={14} />
                  </a>
                </div>
              </div>
              {message.imagePrompt && (
                <p className="text-xs text-text-muted italic">{message.imagePrompt}</p>
              )}
            </div>
          ) : (
            /* Markdown Content */
            <div className="prose prose-invert prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre]:bg-hive-elevated [&_pre]:border [&_pre]:border-hive-border [&_pre]:rounded-lg [&_pre]:p-3 [&_code]:text-honey-400 [&_a]:text-honey-500 [&_a:hover]:text-honey-400 [&_strong]:text-text-primary [&_h1]:text-text-primary [&_h2]:text-text-primary [&_h3]:text-text-primary [&_ul]:text-text-secondary [&_ol]:text-text-secondary [&_li]:text-text-secondary [&_p]:text-text-secondary [&_blockquote]:border-honey-500/30 [&_blockquote]:text-text-muted [&_hr]:border-hive-border [&_table]:border-hive-border [&_th]:border-hive-border [&_td]:border-hive-border [&_th]:px-3 [&_th]:py-1.5 [&_td]:px-3 [&_td]:py-1.5 [&_thead]:bg-hive-elevated">
              {isUser ? (
                <div className="whitespace-pre-wrap break-words">{message.content}</div>
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content || " "}
                </ReactMarkdown>
              )}
            </div>
          )}

          {message.isStreaming && (
            <span className="inline-flex gap-0.5 ml-1">
              <span className="w-1.5 h-1.5 rounded-full bg-honey-500" style={{ animation: "typing 1.2s infinite 0s" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-honey-500" style={{ animation: "typing 1.2s infinite 0.2s" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-honey-500" style={{ animation: "typing 1.2s infinite 0.4s" }} />
            </span>
          )}
        </div>

        {/* Message Actions */}
        {!isUser && !message.isStreaming && (
          <div className="flex items-center gap-1 mt-1 ml-1">
            <button
              onClick={copyToClipboard}
              className="p-1 rounded hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors"
              title={copied ? "Copied!" : "Copy"}
            >
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
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
              <span className="text-[10px] text-text-muted ml-2">
                {message.model.split("/").pop()?.replace(/-free$/, "") || message.model}
              </span>
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
