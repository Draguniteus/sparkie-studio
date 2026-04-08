"use client"

import React, { useState, useEffect } from "react"
import { Message, PendingTask, StepTrace, AceMusicMetadata } from "@/store/appStore"
import { TaskApprovalCard } from "@/components/chat/TaskApprovalCard"
import { useAppStore } from "@/store/appStore"
import { useShallow } from "zustand/react/shallow"
import { Sparkles, User, Copy, RefreshCw, ThumbsUp, ThumbsDown, Download, Check, ExternalLink, FileCode, Layers, Eye, Clock, Brain, ChevronRight, CheckCircle, AlertCircle, Loader2, Square, Pause, Paperclip, FileText, FileImage, FileSpreadsheet } from "lucide-react"
import { SparkieCard } from "@/components/chat/SparkieCards"
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

// Pattern: [Uploaded file: name (mime, XKB) — call read_uploaded_file('id') ...]
const UPLOADED_FILE_RE = /\[Uploaded file: (.+?) \(([^,]+), (\d+)KB\) — call read_uploaded_file\('([^']+)'\)[^\]]*\]/

function parseUploadedFile(content: string) {
  const m = content.match(UPLOADED_FILE_RE)
  if (!m) return null
  return { name: m[1], mime: m[2], sizeKB: parseInt(m[3]), fileId: m[4] }
}

function FileAttachmentCard({ name, mime, sizeKB }: { name: string; mime: string; sizeKB: number }) {
  const isImage = mime.startsWith('image/')
  const isPdf = mime === 'application/pdf'
  const isSpreadsheet = mime.includes('spreadsheet') || mime.includes('excel') || name.endsWith('.csv')
  const Icon = isImage ? FileImage : isPdf || isSpreadsheet ? FileSpreadsheet : FileText
  const ext = name.split('.').pop()?.toUpperCase() ?? 'FILE'
  return (
    <div className="flex items-center gap-2.5 mb-2 px-3 py-2.5 rounded-xl bg-hive-elevated border border-hive-border max-w-xs">
      <div className="w-9 h-9 rounded-lg bg-honey-500/10 border border-honey-500/20 flex items-center justify-center shrink-0 flex-col gap-0.5">
        <Icon size={14} className="text-honey-500" />
        <span className="text-[8px] font-bold text-honey-500/70 leading-none">{ext}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-text-primary truncate">{name}</p>
        <p className="text-[10px] text-text-muted">{sizeKB}KB · {mime}</p>
      </div>
      <Paperclip size={11} className="text-text-muted shrink-0" />
    </div>
  )
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
  const toolTraces = traces.filter(t => t.type !== 'thought')
  const finishedCount = toolTraces.filter(t => t.status === 'done' || t.status === 'error').length
  const errorCount = toolTraces.filter(t => t.status === 'error').length
  const memoryTrace = traces.find(t => t.type === 'memory')
  // Smart label: "Resuming: [Topic]" > "Memory recalled: [Name]" > "In memory: N steps"
  const label = memoryTrace?.resuming && memoryTrace?.memoryName
    ? `Resuming: ${memoryTrace.memoryName}`
    : memoryTrace?.memoryName
      ? `Memory recalled: ${memoryTrace.memoryName}`
      : `In memory: ${finishedCount}/${toolTraces.length} steps${errorCount > 0 ? ` · ${errorCount} error` : ''}`
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
            trace.type === 'thought' ? (
              <div key={i} className="flex items-start gap-1.5 text-[10px] text-purple-300/70 italic">
                <span className="text-[11px] shrink-0">🧠</span>
                <span className="flex-1 break-words leading-snug">{(trace.text ?? trace.label).slice(0, 120)}</span>
              </div>
            ) : (
              <div key={i} className={`flex items-center gap-1.5 text-[10px] ${
                trace.status === 'error' ? 'text-red-400' : trace.type === 'memory' ? 'text-purple-300/80' : 'text-text-muted'
              }`}>
                <span className="text-[11px] shrink-0">{trace.type === 'memory' ? '💾' : STEP_ICON_MAP[trace.icon] ?? '⚡'}</span>
                <span className="flex-1 truncate">{trace.label}</span>
                {trace.status === 'done' && <CheckCircle size={8} className="text-green-400 shrink-0" />}
                {trace.status === 'error' && <AlertCircle size={8} className="text-red-400 shrink-0" />}
                {trace.duration != null && (
                  <span className="text-[9px] tabular-nums shrink-0 text-text-muted/60">
                    {trace.duration < 1000 ? `${trace.duration}ms` : `${(trace.duration / 1000).toFixed(1)}s`}
                  </span>
                )}
              </div>
            )
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
        <p className="text-[10px] font-semibold tracking-widest text-honey-400/70 uppercase mb-0.5">Sparkie's Music Studio</p>
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
  const [thinkingPreview, setThinkingPreview] = useState('')

  // Listen for live thought_step events to show think block preview in bubble
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<string>).detail
      const firstLine = text.split('\n')[0].trim()
      setThinkingPreview(firstLine.length > 60 ? firstLine.slice(0, 60) + '…' : firstLine)
    }
    window.addEventListener('sparkie:thought-step', handler)
    return () => window.removeEventListener('sparkie:thought-step', handler)
  }, [])

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
  const isSparkieCard = message.type === "sparkie_card" && message.sparkieCard
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
        <>
          {message.isProactiveNudge && (
            <div className="nudge-pill">
              <Sparkles size={7} />
              <span>Sparkie reached out</span>
            </div>
          )}
          <div className={`w-7 h-7 rounded-lg overflow-hidden shrink-0 mt-0.5 border ${
            message.isProactiveNudge
              ? 'border-purple-400/40 glow-sparkie-working'
              : 'border-purple-500/30 glow-sparkie-avatar'
          }`}>
            <img src="/sparkie-avatar.jpg" alt="Sparkie" className="w-full h-full object-cover" />
          </div>
        </>
      )}

      <div className={`max-w-[90%] md:max-w-[80%] min-w-0 overflow-hidden ${isUser ? "order-first" : ""}`}>
        {!isUser && message.isStreaming && (
          <div className="mb-1.5 flex items-center gap-2 px-2.5 py-1 rounded-lg bg-gradient-to-r from-purple-600/10 via-blue-600/6 to-purple-500/6 border border-purple-500/20 w-fit">
            {/* Shimmer thinking dots */}
            <div className="thinking-dots shimmer flex gap-0.5 items-center">
              <span /><span /><span />
            </div>
            <span className="text-[10px] text-purple-300/85 font-medium">{thinkingPreview || 'Sparkie is thinking…'}</span>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('sparkie_pause_stream'))}
              className="flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/25 text-amber-400 hover:bg-amber-500/25 transition-colors"
              title="Pause — add more context then resume"
            >
              <Pause size={8} className="shrink-0" />
              <span className="text-[9px] font-medium">Pause</span>
            </button>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('sparkie_stop_stream'))}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/25 transition-colors"
              title="Stop generating"
            >
              <Square size={8} className="shrink-0" />
              <span className="text-[9px] font-medium">Stop</span>
            </button>
          </div>
        )}
        {!isUser && !message.isStreaming && message.toolTraces && message.toolTraces.length > 0 && (
          <InMemoryPill traces={message.toolTraces} />
        )}
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-honey-500/15 text-text-primary rounded-br-md"
            : "bg-sparkie-deep text-text-primary rounded-bl-md border border-purple-500/15"
        }`}>
          {!isUser && message.reasoning && !message.isStreaming && (
            <div className="reasoning-header flex items-center gap-1.5 mb-0.5">
              <span>✦</span>
              <span>Thinking</span>
            </div>
          )}
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
                <audio
                  src={message.imageUrl}
                  controls
                  className="w-full"
                  style={{ height: 40, colorScheme: "dark" }}
                  onPlay={() => window.dispatchEvent(new CustomEvent('sparkie:tts-start'))}
                  onPause={() => window.dispatchEvent(new CustomEvent('sparkie:tts-end'))}
                  onEnded={() => window.dispatchEvent(new CustomEvent('sparkie:tts-end'))}
                />
              </div>
            </div>
          ) : isImage && !message.isStreaming ? (
            <div
              style={{
                background: '#0f0f14',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '12px',
                overflow: 'hidden',
                maxWidth: '420px',
                display: 'inline-block',
                transition: 'box-shadow 0.2s, transform 0.2s',
              }}
              className="group hover:shadow-[0_0_0_2px_rgba(139,92,246,0.3)] hover:-translate-y-0.5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={message.imageUrl}
                alt={message.imagePrompt || "Generated image"}
                style={{ width: '100%', display: 'block', objectFit: 'cover' }}
                loading="lazy"
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                {message.imagePrompt && (
                  <span style={{ fontSize: '11px', color: '#9ca3af', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {message.imagePrompt.slice(0, 80)}
                  </span>
                )}
                <a href={message.imageUrl} download target="_blank" rel="noopener noreferrer"
                  className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors shrink-0 ml-1">
                  <Download size={12} />
                </a>
              </div>
            </div>
          ) : isBuildCard && !message.isStreaming ? (
            <BuildCard card={message.buildCard!} />
          ) : isSparkieCard && message.sparkieCard ? (
            <div>
              {message.content && <p className="text-sm text-text-secondary mb-1">{message.content}</p>}
              <SparkieCard
                card={message.sparkieCard}
                onAction={async (actionId, cardType) => {
                  const taskId = message.sparkieCard?.metadata?.taskId as string | undefined
                  // email_draft and calendar_event: call /api/cards to execute via HITL
                  if ((cardType === 'email_draft' || cardType === 'calendar_event') && taskId) {
                    try {
                      await fetch('/api/cards', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ actionId, cardType, metadata: { taskId } }),
                      })
                    } catch { /* silent */ }
                  }
                  // cta: open URL in browser
                  if (cardType === 'cta') {
                    const url = message.sparkieCard?.metadata?.url as string | undefined
                    if (url) window.open(url, '_blank')
                  }
                }}
              />
            </div>
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
              {isUser ? (() => {
                const fileAttach = parseUploadedFile(message.content)
                const displayText = fileAttach
                  ? message.content.replace(UPLOADED_FILE_RE, '').trim()
                  : message.content
                return (
                  <div>
                    {fileAttach && (
                      <FileAttachmentCard name={fileAttach.name} mime={fileAttach.mime} sizeKB={fileAttach.sizeKB} />
                    )}
                    {displayText && <div className="whitespace-pre-wrap break-words">{displayText}</div>}
                  </div>
                )
              })() : (
                <AnimatedMarkdown
                  content={sanitizeContent(message.content) || " "}
                  isStreaming={message.isStreaming ?? false}
                  messageId={message.id}
                />
              )}
            </div>
          )}

          {message.isStreaming && (
            <span className="inline-flex gap-0.5 ml-1.5 mt-0.5">
              <div className="thinking-dots"><span /><span /><span /></div>
            </span>
          )}
        </div>

        {!isUser && !message.isStreaming && !isBuildCard && !isPendingTask && !isSparkieCard && (
          <div className="flex items-center gap-1 mt-1.5 ml-1">
            <button onClick={copyToClipboard}
              className="action-btn"
              title={copied ? "Copied!" : "Copy"}>
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
            </button>
            <button className="action-btn" title="Regenerate">
              <RefreshCw size={12} />
            </button>
            <button className="action-btn" title="Loved this">
              <ThumbsUp size={12} />
            </button>
            <button className="action-btn" title="Needs work">
              <ThumbsDown size={12} />
            </button>
            {message.model && (() => {
              const TEAM_NAMES: Record<string, string> = {
                "MiniMax-M2.7": "Sparkie",
                "minimax-m2.5-free": "Sparkie",
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
