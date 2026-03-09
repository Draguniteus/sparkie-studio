"use client"

import React, { useState } from "react"
import { Message, PendingTask, StepTrace, AceMusicMetadata } from "@/store/appStore"
import { TaskApprovalCard } from "@/components/chat/TaskApprovalCard"
import { useAppStore } from "@/store/appStore"
import { useShallow } from "zustand/react/shallow"
import { Sparkles, User, Copy, RefreshCw, ThumbsUp, ThumbsDown, Download, Check, ExternalLink, FileCode, Layers, Eye, Clock, Brain, ChevronRight, CheckCircle, AlertCircle, Loader2 } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { AnimatedMarkdown } from "./AnimatedMarkdown"

interface Props {
  message: Message
  userAvatarUrl?: string | null
}

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
      <div className="flex items-center gap-2 px-4 py-2.5 border-t border-honey-500/10">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('sparkie:open-preview'))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-honey-500 text-black text-xs font-semibold hover:bg-honey-400 transition-colors"
        >
          <Eye size={11} />
          Open Preview
        </button>
        {isStaticSite && !isFullStack && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('sparkie:open-deploy-tip'))}
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

const STEP_ICON_MAP: Record<string, string> = {
  file: '📄', edit: '✏️', terminal: '⚡', search: '🔍',
  database: '🗃️', globe: '🌐', brain: '🧠', scroll: '📋',
  rocket: '🚀', image: '🎨', music: '🎵', video: '🎬', mic: '🎤', zap: '⚡',
}

function InMemoryPill({ traces }: { traces: StepTrace[] }) {
  const [open, setOpen] = React.useState(false)
  const doneCount = traces.filter(t => t.status === 'done').length
  const errorCount = traces.filter(t => t.status === 'error').length
  const label = `In memory: ${doneCount}/${traces.length} steps${errorCount > 0 ? ` · ${errorCount} error` : ''}`
  return (
    <div className="mb-1.5 flex flex-col gap-1">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-gradient-to-r from-purple-600/10 via-blue-600/6 to-purple-500/6 border border-purple-500/20 w-fit max-w-full hover:border-purple-500/35 transition-all"
      >
        <Brain size={11} className="text-purple-400 shrink-0" />
        <span className="text-[10px] text-purple-300/85 font-medium truncate max-w-[280px]">{label}</span>
        <ChevronRight size={9} className={`shrink-0 text-purple-400/50 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="ml-1 flex flex-col gap-0.5 border-l-2 border-purple-500/20 pl-2.5 pb-0.5">
          {traces.map((trace, i) => (
            <div key={i} className={`flex items-center gap-1.5 text-[10px] ${
              trace.status === 'error' ? 'text-red-400' : 'text-text-muted'
            }`}>
              <span className="text-[11px] shrink-0">{STEP_ICON_MAP[trace.icon] ?? '⚡'}</span>
              <span className="flex-1 truncate">{trace.label}</span>
              {trace.status === 'done' && <CheckCircle size={8} className="text-green-400 shrink-0" />}
              {trace.status === 'error' && <AlertCircle size={8} className="text-red-400 shrink-0" />}
              {trace.duration != null && (
                <span className="text-[9px] tabular-nums shrink-0 text-text-muted/60">
                  {trace.duration < 1000 ? `${trace.duration}ms` : `${(trace.duration / 1000).toFixed(1)}s`}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function sanitizeContent(content: string): string {
  if (!content) return content
  const stripped = content
    .replace(/^\s*\{[\s\S]*?"type"\s*:\s*"function"[\s\S]*?\}\s*$/m, '')
    .replace(/^\s*\{[\s\S]*?"name"\s*:\s*"create_task"[\s\S]*?\}\s*$/m, '')
    .replace(/^\s*\{[\s\S]*?"name"\s*:\s*"(send_email|create_task|schedule_task|search_web)"[\s\S]*?\}\s*$/m, '')
    .trim()
  return stripped || content
}

// ─── AceMusicPlayer ────────────────────────────────────────────────────────
function AceMusicPlayer({ message }: { message: Message }) {
  const _typeCheck: AceMusicMetadata | undefined = message.aceMetadata
  void _typeCheck
  const meta = message.aceMetadata!
  const [version, setVersion] = React.useState<1 | 2>(1)
  const [playing, setPlaying] = React.useState(false)
  const [currentTime, setCurrentTime] = React.useState(0)
  const [duration, setDuration] = React.useState(0)
  const [showLyrics, setShowLyrics] = React.useState(false)
  const [showStyle, setShowStyle] = React.useState(false)
  const audioRef = React.useRef<HTMLAudioElement>(null)

  const activeUrl = version === 1 ? message.imageUrl! : (meta.url2 || message.imageUrl!)

  const togglePlay = () => {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause() } else { a.play().catch(() => {}) }
    setPlaying(!playing)
  }

  const handleTimeUpdate = () => { if (audioRef.current) setCurrentTime(audioRef.current.currentTime) }
  const handleLoadedMetadata = () => { if (audioRef.current) setDuration(audioRef.current.duration) }
  const handleEnded = () => setPlaying(false)
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current
    if (!a) return
    a.currentTime = Number(e.target.value)
    setCurrentTime(a.currentTime)
  }

  const switchVersion = (v: 1 | 2) => {
    const a = audioRef.current
    if (a) { a.pause(); a.currentTime = 0 }
    setPlaying(false); setCurrentTime(0); setDuration(0); setVersion(v)
  }

  const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) return "0:00"
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`
  }

  const bars = [60,80,45,90,55,75,40,85,65,95,50,70,80,45,90,60,75,55,85,65]
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="w-full max-w-md rounded-2xl overflow-hidden border border-purple-500/30 bg-gradient-to-b from-[#1a0533] to-[#0d0118] shadow-xl shadow-purple-900/30">
      <div className="px-4 pt-4 pb-2">
        <p className="text-[10px] font-semibold tracking-widest text-honey-400/70 uppercase mb-0.5">ACE STEP 1.5</p>
        <h3 className="text-lg font-bold text-white leading-tight truncate">{meta.title}</h3>
      </div>

      {meta.url2 && (
        <div className="px-4 pb-2 flex gap-2">
          {([1, 2] as const).map(v => (
            <button key={v} onClick={() => switchVersion(v)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                version === v
                  ? "bg-purple-600 text-white shadow shadow-purple-900/50"
                  : "bg-white/10 text-text-muted hover:bg-white/15"
              }`}>
              v{v}
            </button>
          ))}
        </div>
      )}

      <div className="px-4 py-2">
        <div className="flex items-end gap-[2px] h-12 justify-center">
          {bars.map((h, i) => {
            const barPct = (i / bars.length) * 100
            const active = playing && barPct <= progressPct
            return (
              <div key={i}
                className={`w-[3px] rounded-full transition-all duration-75 ${
                  active ? "bg-purple-400" : barPct <= progressPct ? "bg-honey-500/80" : "bg-white/20"
                }`}
                style={{ height: `${h * 0.4}px` }}
              />
            )
          })}
        </div>
      </div>

      <div className="px-4 pb-1">
        <input type="range" min={0} max={duration || 100} value={currentTime} onChange={handleSeek}
          className="w-full h-0.5 cursor-pointer" style={{ accentColor: "#9333ea" }} />
        <div className="flex justify-between text-[10px] text-text-muted mt-0.5">
          <span>{fmt(currentTime)}</span><span>{fmt(duration)}</span>
        </div>
      </div>

      <div className="px-4 pb-3 flex items-center justify-between">
        <button onClick={togglePlay}
          className="w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-500 flex items-center justify-center transition-colors shadow shadow-purple-900/50">
          {playing
            ? <span className="text-white text-sm">⏸</span>
            : <span className="text-white text-sm pl-0.5">▶</span>
          }
        </button>
        <a href={activeUrl} download={`sparkie-ace-v${version}.mp3`}
          className="px-3 py-1.5 rounded-md text-xs font-semibold bg-honey-500/20 text-honey-400 hover:bg-honey-500/30 transition-colors flex items-center gap-1.5">
          <Download size={11} />Save
        </a>
      </div>

      <div className="border-t border-white/10 px-4 py-2 space-y-1">
        <button onClick={() => setShowStyle(!showStyle)}
          className="w-full flex items-center justify-between text-[10px] font-semibold text-text-muted uppercase tracking-widest py-1 hover:text-text-primary transition-colors">
          <span>Style</span><span>{showStyle ? "▴" : "▾"}</span>
        </button>
        {showStyle && <p className="text-xs text-text-muted leading-relaxed pb-2">{meta.style}</p>}

        {meta.lyrics && (
          <>
            <button onClick={() => setShowLyrics(!showLyrics)}
              className="w-full flex items-center justify-between text-[10px] font-semibold text-text-muted uppercase tracking-widest py-1 hover:text-text-primary transition-colors">
              <span>Lyrics</span><span>{showLyrics ? "▴" : "▾"}</span>
            </button>
            {showLyrics && (
              <pre className="text-xs text-text-muted whitespace-pre-wrap leading-relaxed pb-2 max-h-48 overflow-y-auto font-sans">{meta.lyrics}</pre>
            )}
          </>
        )}
      </div>

      <audio ref={audioRef} src={activeUrl}
        onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded} preload="metadata" />
    </div>
  )
}

function MessageBubbleInner({ message, userAvatarUrl }: Props) {
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
  const isAceMusic = message.type === "ace_music" && message.imageUrl && message.aceMetadata
  const isBuildCard = message.type === "build_card" && message.buildCard
  const isPendingTask = !!message.pendingTask
  const isTimerFired = (message.type as string) === "timer_fired"

  if (isTimerFired) {
    const triggerType = message.model ?? 'One-time'
    return (
      <div className="flex gap-3 animate-fade-in">
        <div className="flex-1 max-w-[90%] md:max-w-[80%]">
          <div className="rounded-xl border border-orange-500/40 bg-orange-950/30 px-4 py-3 flex items-center gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <Clock size={14} className="text-orange-400/70" />
              <span className="text-xs text-text-muted">Timer fired</span>
            </div>
            <span className="flex-1 text-sm font-semibold text-text-primary">{message.content}</span>
            <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
              {triggerType}
            </span>
          </div>
        </div>
      </div>
    )
  }

  const { updateMessage, currentChatId } = useAppStore(
    useShallow((s) => ({ updateMessage: s.updateMessage, currentChatId: s.currentChatId }))
  )

  return (
    <div className={`flex gap-3 animate-fade-in ${isUser ? "justify-end" : ""}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 mt-0.5 border border-honey-500/20">
          <img src="/sparkie-avatar.jpg" alt="Sparkie" className="w-full h-full object-cover" />
        </div>
      )}

      <div className={`max-w-[90%] md:max-w-[80%] min-w-0 overflow-hidden ${isUser ? "order-first" : ""}`}>
        {!isUser && !message.isStreaming && message.toolTraces && message.toolTraces.length > 0 && (
          <InMemoryPill traces={message.toolTraces} />
        )}
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-honey-500/15 text-text-primary rounded-br-md"
            : "bg-hive-surface text-text-primary rounded-bl-md"
        }`}>
          {isVideo && !message.isStreaming ? (
            <div className="space-y-2">
              <div className="relative group rounded-lg overflow-hidden">
                <video src={message.imageUrl} controls autoPlay loop muted playsInline className="w-full max-w-md rounded-lg" />
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a href={message.imageUrl} download target="_blank" rel="noopener noreferrer"
                    className="p-1.5 rounded-md bg-black/60 text-white hover:bg-black/80 transition-colors">
                    <Download size={14} />
                  </a>
                </div>
              </div>
              {message.imagePrompt && <p className="text-xs text-text-muted italic">{message.imagePrompt}</p>}
            </div>
          ) : isAceMusic && !message.isStreaming ? (
            <AceMusicPlayer message={message} />
          ) : isAudio && !message.isStreaming ? (
            <div className="space-y-2">
              <div className="rounded-xl bg-hive-elevated border border-hive-border p-3">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-honey-500/15 flex items-center justify-center shrink-0">
                    <span className="text-base">{message.type === "music" ? "🎵" : "🎤"}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-text-primary capitalize">{message.type}</p>
                    {message.imagePrompt && <p className="text-[10px] text-text-muted truncate">{message.imagePrompt}</p>}
                  </div>
                  <a href={message.imageUrl} download={`sparkie-${message.type}.mp3`}
                    className="p-1.5 rounded-md bg-hive-hover text-text-muted hover:text-text-primary transition-colors" title="Download">
                    <Download size={13} />
                  </a>
                </div>
                <audio src={message.imageUrl} controls className="w-full" style={{ height: 40, colorScheme: "dark" }} />
              </div>
            </div>
          ) : isImage && !message.isStreaming ? (
            <div className="space-y-2">
              <div className="relative group rounded-lg overflow-hidden">
                <img src={message.imageUrl} alt={message.imagePrompt || "Generated image"} className="w-full max-w-md rounded-lg" loading="lazy" />
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a href={message.imageUrl} download target="_blank" rel="noopener noreferrer"
                    className="p-1.5 rounded-md bg-black/60 text-white hover:bg-black/80 transition-colors">
                    <Download size={14} />
                  </a>
                </div>
              </div>
              {message.imagePrompt && <p className="text-xs text-text-muted italic">{message.imagePrompt}</p>}
            </div>
          ) : isBuildCard && !message.isStreaming ? (
            <BuildCard card={message.buildCard!} />
          ) : isPendingTask && message.pendingTask ? (
            <div>
              {message.content && <p className="text-sm text-text-secondary mb-2">{message.content}</p>}
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
            <div className="prose prose-invert prose-sm max-w-none overflow-hidden [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre]:bg-hive-elevated [&_pre]:border [&_pre]:border-hive-border [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_code]:text-honey-400 [&_code]:break-all [&_a]:text-honey-500 [&_a:hover]:text-honey-400 [&_a]:break-all [&_strong]:text-text-primary [&_h1]:text-text-primary [&_h2]:text-text-primary [&_h3]:text-text-primary [&_ul]:text-text-secondary [&_ol]:text-text-secondary [&_li]:text-text-secondary [&_p]:text-text-secondary [&_p]:break-words [&_blockquote]:border-honey-500/30 [&_blockquote]:text-text-muted [&_hr]:border-hive-border [&_table]:border-hive-border [&_th]:border-hive-border [&_td]:border-hive-border [&_th]:px-3 [&_th]:py-1.5 [&_td]:px-3 [&_td]:py-1.5 [&_thead]:bg-hive-elevated">
              {isUser ? (
                <div className="whitespace-pre-wrap break-words">{message.content}</div>
              ) : (
                <AnimatedMarkdown
                  content={sanitizeContent(message.content) || " "}
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
            <button onClick={copyToClipboard}
              className="p-1 rounded hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors"
              title={copied ? "Copied!" : "Copy"}>
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
            {message.model && (() => {
              const TEAM_NAMES: Record<string, string> = {
                "anthropic-claude-4.5-haiku": "Sparkie",
                "claude-4.5-haiku": "Sparkie",
                "llama3.3-70b-instruct": "Flame",
                "llama-3.3-70b-instruct": "Flame",
                "big-pickle": "Ember",
                "minimax-m2.5-free": "Atlas",
                "minimax-m2.5": "Atlas",
                "trinity-large-preview-free": "Trinity",
                "trinity-large-preview": "Trinity",
                "Agent Loop": "Sparkie",
              }
              const modelSlug = message.model.split("/").pop() || message.model
              const teamName = TEAM_NAMES[modelSlug] || TEAM_NAMES[message.model]
              if (!teamName) return null
              return (
                <span className="ml-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-[10px] text-purple-300/80 font-medium">
                  <span style={{ color: "rgba(245,197,66,0.6)" }}>✦</span>
                  <span>{teamName}</span>
                </span>
              )
            })()}
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 mt-0.5 border border-hive-border">
          {userAvatarUrl ? (
            <img src={userAvatarUrl} alt="You" className="w-full h-full object-cover" />
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

export const MessageBubble = React.memo(MessageBubbleInner)
