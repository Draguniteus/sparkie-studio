"use client"

import { useState } from "react"
import { Message, PendingTask } from "@/store/appStore"
import { TaskApprovalCard } from "@/components/chat/TaskApprovalCard"
import { useAppStore } from "@/store/appStore"
import { Sparkles, User, Copy, RefreshCw, ThumbsUp, ThumbsDown, Download, Check, ExternalLink, FileCode, Layers, Eye } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { AnimatedMarkdown } from "./AnimatedMarkdown"

interface Props {
  message: Message
  userAvatarUrl?: string | null  // user's uploaded profile picture
}

// File type → icon color
function fileIconColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['html', 'htm'].includes(ext)) return 'text-orange-400'
  if (['css', 'scss'].includes(ext)) return 'text-blue-400'
  if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) return 'text-yellow-400'
  if (['py'].includes(ext)) return 'text-green-400'
  if (['json'].includes(ext)) return 'text-purple-400'
  if (['md'].includes(ext)) return 'text-gray-400'
  return 'text-text-muted'
}

function BuildCard({ card }: { card: NonNullable<Message["buildCard"]> }) {
  const isStaticSite = card.files.some(f => f.endsWith('.html'))
  const isFullStack = card.files.some(f => f === 'package.json' || f.includes('server'))

  return (
    <div className="mt-1 rounded-xl border border-honey-500/20 bg-honey-500/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-honey-500/15">
        <div className="w-7 h-7 rounded-lg bg-honey-500/15 flex items-center justify-center shrink-0">
          <Layers size={14} className="text-honey-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary truncate">{card.title || "Project"}</span>
            <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-honey-500/15 text-honey-500">
              {card.isEdit ? "UPDATED" : "BUILT"}
            </span>
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            {card.fileCount} file{card.fileCount !== 1 ? "s" : ""} · {card.languages.slice(0, 3).join(", ")}
          </p>
        </div>
      </div>

      {/* File list */}
      <div className="px-4 py-2.5 space-y-1.5 max-h-32 overflow-y-auto">
        {card.files.slice(0, 8).map((f, i) => (
          <div key={i} className="flex items-center gap-2">
            <FileCode size={12} className={fileIconColor(f)} />
            <span className="text-xs text-text-secondary font-mono truncate">{f}</span>
          </div>
        ))}
        {card.files.length > 8 && (
          <p className="text-xs text-text-muted pl-5">+{card.files.length - 8} more files</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-t border-honey-500/10">
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('sparkie:open-preview'))
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-honey-500 text-black text-xs font-semibold hover:bg-honey-400 transition-colors"
        >
          <Eye size={11} />
          Open Preview
        </button>

        {isStaticSite && !isFullStack && (
          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent('sparkie:open-deploy-tip'))
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-hive-border text-text-secondary text-xs hover:bg-hive-hover hover:text-text-primary transition-colors"
          >
            <ExternalLink size={11} />
            Deploy to GitHub Pages
          </button>
        )}
      </div>
    </div>
  )
}

export function MessageBubble({ message, userAvatarUrl }: Props) {
  const isUser = message.role === "user"
  const [copied, setCopied] = useState(false)

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isImage = message.type === "image" && message.imageUrl
  const isVideo = message.type === "video" && message.imageUrl
  const isAudio = (message.type === "music" || message.type === "speech") && message.imageUrl
  const isBuildCard = message.type === "build_card" && message.buildCard
  const isPendingTask = !!message.pendingTask
  const { updateMessage, currentChatId } = useAppStore()

  return (
    <div className={`flex gap-3 animate-fade-in ${isUser ? "justify-end" : ""}`}>
      {/* Sparkie avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 mt-0.5 border border-honey-500/20">
          <img
            src="/sparkie-avatar.jpg"
            alt="Sparkie"
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className={`max-w-[80%] ${isUser ? "order-first" : ""}`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "bg-honey-500/15 text-text-primary rounded-br-md"
              : "bg-hive-surface text-text-primary rounded-bl-md"
          }`}
        >
          {/* Video Display */}
          {isVideo && !message.isStreaming ? (
            <div className="space-y-2">
              <div className="relative group rounded-lg overflow-hidden">
                <video
                  src={message.imageUrl}
                  controls
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full max-w-md rounded-lg"
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
          ) : isAudio && !message.isStreaming ? (
            /* Audio Player */
            <div className="space-y-2">
              <div className="rounded-xl bg-hive-elevated border border-hive-border p-3">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-honey-500/15 flex items-center justify-center shrink-0">
                    <span className="text-base">{message.type === "music" ? "🎵" : "🎤"}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-text-primary capitalize">{message.type}</p>
                    {message.imagePrompt && (
                      <p className="text-[10px] text-text-muted truncate">{message.imagePrompt}</p>
                    )}
                  </div>
                  <a
                    href={message.imageUrl}
                    download={`sparkie-${message.type}.mp3`}
                    className="p-1.5 rounded-md bg-hive-hover text-text-muted hover:text-text-primary transition-colors"
                    title="Download"
                  >
                    <Download size={13} />
                  </a>
                </div>
                <audio
                   src={message.imageUrl}
                   controls
                   className="w-full"
                   style={{ height: 40, colorScheme: "dark" }}
                 />
              </div>
            </div>
          ) : isImage && !message.isStreaming ? (
            /* Image Display */
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
          ) : isBuildCard && !message.isStreaming ? (
            /* Build Completion Card */
            <BuildCard card={message.buildCard!} />
          ) : isPendingTask && message.pendingTask ? (
            /* HITL Task Approval Card */
            <div>
              {message.content && (
                <p className="text-sm text-text-secondary mb-2">{message.content}</p>
              )}
              <TaskApprovalCard
                task={message.pendingTask}
                onResolve={(taskId, status) => {
                  if (currentChatId) {
                    updateMessage(currentChatId, message.id, {
                      pendingTask: { ...message.pendingTask!, status },
                    })
                  }
                }}
              />
            </div>
          ) : (
            /* Markdown Content */
            <div className="prose prose-invert prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre]:bg-hive-elevated [&_pre]:border [&_pre]:border-hive-border [&_pre]:rounded-lg [&_pre]:p-3 [&_code]:text-honey-400 [&_a]:text-honey-500 [&_a:hover]:text-honey-400 [&_strong]:text-text-primary [&_h1]:text-text-primary [&_h2]:text-text-primary [&_h3]:text-text-primary [&_ul]:text-text-secondary [&_ol]:text-text-secondary [&_li]:text-text-secondary [&_p]:text-text-secondary [&_blockquote]:border-honey-500/30 [&_blockquote]:text-text-muted [&_hr]:border-hive-border [&_table]:border-hive-border [&_th]:border-hive-border [&_td]:border-hive-border [&_th]:px-3 [&_th]:py-1.5 [&_td]:px-3 [&_td]:py-1.5 [&_thead]:bg-hive-elevated">
              {isUser ? (
                <div className="whitespace-pre-wrap break-words">{message.content}</div>
              ) : (
                <AnimatedMarkdown
                  content={message.content || " "}
                  isStreaming={message.isStreaming ?? false}
                  messageId={message.id}
                />
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

        {!isUser && !message.isStreaming && !isBuildCard && !isPendingTask && (
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

      {/* User avatar */}
      {isUser && (
        <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 mt-0.5 border border-hive-border">
          {userAvatarUrl ? (
            <img
              src={userAvatarUrl}
              alt="You"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-hive-elevated flex items-center justify-center">
              <User size={14} className="text-text-secondary" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
