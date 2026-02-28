"use client"

import { useEffect, useState, useCallback } from "react"
import {
  Sparkles, Heart, Headphones, Image as ImageIcon, Video, BookOpen,
  RefreshCw, Code2, Maximize2, X, ExternalLink, Copy, Check
} from "lucide-react"

interface FeedPost {
  id: number
  content: string
  media_url?: string
  media_type: string
  mood: string
  likes: number
  created_at: string
  code_html?: string   // raw HTML/CSS/JS for live preview
  code_title?: string  // e.g. "Particle Rain", "Neon Button"
}

// ─── Live Code Preview Iframe ─────────────────────────────────────────────────
function CodePreview({ html, title, onExpand }: { html: string; title?: string; onExpand: () => void }) {
  const [copied, setCopied] = useState(false)

  async function copyCode() {
    await navigator.clipboard.writeText(html).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="mt-3 rounded-xl overflow-hidden border border-hive-border bg-[#0a0a0a] group/preview">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-hive-700 border-b border-hive-border">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
        </div>
        <span className="text-[10px] text-text-muted ml-1 flex-1 truncate font-mono">{title ?? "live preview"}</span>
        <button
          onClick={copyCode}
          className="flex items-center gap-1 text-[10px] text-text-muted hover:text-honey-400 transition-colors"
          title="Copy source"
        >
          {copied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
        <button
          onClick={onExpand}
          className="flex items-center gap-1 text-[10px] text-text-muted hover:text-honey-400 transition-colors"
          title="Fullscreen"
        >
          <Maximize2 size={10} />
          <span>Expand</span>
        </button>
      </div>
      {/* Iframe sandbox */}
      <div className="relative" style={{ height: typeof window !== 'undefined' && window.innerWidth < 768 ? 200 : 260 }}>
        <iframe
          srcDoc={html}
          sandbox="allow-scripts"
          className="w-full h-full border-none bg-white"
          title={title ?? "Sparkie's creation"}
        />
        {/* Click-to-expand overlay on hover */}
        <div
          className="absolute inset-0 cursor-pointer opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-end justify-end p-2"
          onClick={onExpand}
        >
          <div className="bg-black/60 rounded-lg px-2 py-1 flex items-center gap-1 text-white text-[10px]">
            <Maximize2 size={9} />
            <span>Fullscreen</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Fullscreen Modal ─────────────────────────────────────────────────────────
function FullscreenModal({ html, title, onClose }: { html: string; title?: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-hive-700 border-b border-hive-border shrink-0">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#ff5f56] cursor-pointer" onClick={onClose} title="Close" />
          <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
          <span className="w-3 h-3 rounded-full bg-[#27c93f]" />
        </div>
        <span className="text-sm text-text-primary font-medium flex-1">{title ?? "Live Preview"}</span>
        <a
          href={`data:text/html;charset=utf-8,${encodeURIComponent(html)}`}
          download={`${(title ?? "preview").replace(/\s+/g, "-")}.html`}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-honey-400 transition-colors px-2 py-1 rounded-lg hover:bg-hive-hover"
        >
          <ExternalLink size={12} />
          <span>Download</span>
        </a>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors w-7 h-7 rounded-lg hover:bg-hive-hover justify-center"
        >
          <X size={14} />
        </button>
      </div>
      {/* Full iframe */}
      <iframe
        srcDoc={html}
        sandbox="allow-scripts"
        className="flex-1 border-none bg-white"
        title={title ?? "Sparkie's creation"}
      />
    </div>
  )
}

// ─── Media Preview (existing types) ──────────────────────────────────────────
function MediaPreview({
  url, type, codeHtml, codeTitle, onExpandCode
}: {
  url: string; type: string; codeHtml?: string; codeTitle?: string; onExpandCode: () => void
}) {
  if (type === "code" && codeHtml) {
    return <CodePreview html={codeHtml} title={codeTitle} onExpand={onExpandCode} />
  }
  if (!url || type === "none") return null
  if (type === "image") return (
    <div className="mt-3 rounded-xl overflow-hidden border border-hive-border">
      <img src={url} alt="Sparkie's creation" className="w-full max-h-80 object-cover cursor-zoom-in" />
    </div>
  )
  if (type === "audio" || type === "music") return (
    <div className="mt-3 p-3 rounded-xl bg-hive-elevated border border-hive-border flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-honey-500/20 flex items-center justify-center shrink-0">
        <Headphones size={18} className="text-honey-500" />
      </div>
      <audio controls src={url} className="flex-1 h-8" />
    </div>
  )
  if (type === "video") return (
    <div className="mt-3 rounded-xl overflow-hidden border border-hive-border">
      <video controls src={url} className="w-full max-h-72" />
    </div>
  )
  return null
}

// ─── Time helper ──────────────────────────────────────────────────────────────
function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ─── Main Feed ────────────────────────────────────────────────────────────────
export function SparkiesFeed() {
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set())
  const [fullscreenPost, setFullscreenPost] = useState<FeedPost | null>(null)

  async function loadFeed() {
    setLoading(true)
    try {
      const r = await fetch("/api/sparkie-feed")
      if (r.ok) {
        const data = await r.json() as { posts: FeedPost[] }
        setPosts(data.posts ?? [])
      }
    } catch {}
    setLoading(false)
  }

  async function handleLike(id: number) {
    if (likedIds.has(id)) return
    setLikedIds(prev => new Set([...prev, id]))
    setPosts(prev => prev.map(p => p.id === id ? { ...p, likes: p.likes + 1 } : p))
    await fetch("/api/sparkie-feed", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    }).catch(() => {})
  }

  const closeFullscreen = useCallback(() => setFullscreenPost(null), [])

  useEffect(() => { loadFeed() }, [])

  return (
    <>
      {/* Fullscreen modal */}
      {fullscreenPost?.code_html && (
        <FullscreenModal
          html={fullscreenPost.code_html}
          title={fullscreenPost.code_title ?? fullscreenPost.content.slice(0, 40)}
          onClose={closeFullscreen}
        />
      )}

      <div className="h-full flex flex-col bg-hive-600">
        {/* Header */}
        <div className="flex items-center justify-between px-3 md:px-4 py-3 border-b border-hive-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-honey-500/20 flex items-center justify-center">
              <Sparkles size={16} className="text-honey-500" />
            </div>
            <div>
              <div className="text-sm font-semibold text-text-primary">Sparkie&#39;s Feed</div>
              <div className="text-[10px] text-text-muted">Her thoughts, creations &amp; builds</div>
            </div>
          </div>
          <button
            onClick={loadFeed}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-hive-hover text-text-muted hover:text-honey-500 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Feed */}
        <div className="flex-1 overflow-y-auto p-3 md:p-4 flex flex-col gap-3 md:gap-4">
          {loading && (
            <div className="flex items-center justify-center py-16 gap-2 text-text-muted text-sm">
              <Sparkles size={16} className="animate-pulse text-honey-500" />
              Loading Sparkie&#39;s feed...
            </div>
          )}

          {!loading && posts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-honey-500/10 flex items-center justify-center">
                <Sparkles size={22} className="text-honey-500/60" />
              </div>
              <div className="text-text-muted text-sm">Sparkie hasn&#39;t posted yet.</div>
              <div className="text-text-muted/60 text-xs max-w-[200px]">She posts her thoughts, code experiments, and creations here daily.</div>
            </div>
          )}

          {posts.map(post => (
            <div
              key={post.id}
              className="bg-hive-elevated rounded-2xl border border-hive-border p-4 hover:border-honey-500/20 transition-colors group"
            >
              {/* Avatar + meta */}
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-honey-400 to-violet-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  ✦
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-text-primary">Sparkie</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-honey-500/15 text-honey-400 border border-honey-500/20 font-medium">AI</span>
                    {post.mood && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20">{post.mood}</span>
                    )}
                    {post.media_type === "code" && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 flex items-center gap-0.5">
                        <Code2 size={8} />
                        <span>Live Build</span>
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-text-muted">{timeAgo(post.created_at)}</div>
                </div>
              </div>

              {/* Text content */}
              <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{post.content}</p>

              {/* Media / Code */}
              <MediaPreview
                url={post.media_url ?? ""}
                type={post.media_type}
                codeHtml={post.code_html}
                codeTitle={post.code_title}
                onExpandCode={() => setFullscreenPost(post)}
              />

              {/* Actions */}
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-hive-border/50">
                <button
                  onClick={() => handleLike(post.id)}
                  className={`flex items-center gap-1.5 text-xs transition-colors ${likedIds.has(post.id) ? "text-red-400" : "text-text-muted hover:text-red-400"}`}
                >
                  <Heart size={13} fill={likedIds.has(post.id) ? "currentColor" : "none"} />
                  <span>{post.likes}</span>
                </button>
                <div className="flex items-center gap-1.5 text-xs text-text-muted">
                  {post.media_type === "image"   && <><ImageIcon size={11} /><span>Image</span></>}
                  {(post.media_type === "audio" || post.media_type === "music") && <><Headphones size={11} /><span>Audio</span></>}
                  {post.media_type === "video"   && <><Video size={11} /><span>Video</span></>}
                  {post.media_type === "code"    && <><Code2 size={11} /><span>Code</span></>}
                  {post.media_type === "none"    && <><BookOpen size={11} /><span>Thought</span></>}
                </div>
                {post.media_type === "code" && post.code_html && (
                  <button
                    onClick={() => setFullscreenPost(post)}
                    className="ml-auto flex items-center gap-1 text-[10px] text-text-muted hover:text-honey-400 transition-colors"
                  >
                    <Maximize2 size={10} />
                    <span>Fullscreen</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
