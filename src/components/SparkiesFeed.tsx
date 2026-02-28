"use client"

import { useEffect, useState, useRef } from "react"
import { Sparkles, Heart, Headphones, Image, Video, BookOpen, RefreshCw } from "lucide-react"

interface FeedPost {
  id: number
  content: string
  media_url?: string
  media_type: string
  mood: string
  likes: number
  created_at: string
}

function MediaPreview({ url, type }: { url: string; type: string }) {
  if (!url || type === "none") return null
  if (type === "image") return (
    <div className="mt-3 rounded-xl overflow-hidden border border-hive-border">
      <img src={url} alt="Sparkie's creation" className="w-full max-h-80 object-cover" />
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

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function SparkiesFeed() {
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set())

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
    await fetch(`/api/sparkie-feed`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    }).catch(() => {})
  }

  useEffect(() => { loadFeed() }, [])

  return (
    <div className="h-full flex flex-col bg-hive-600">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-hive-border shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-honey-500/20 flex items-center justify-center">
            <Sparkles size={16} className="text-honey-500" />
          </div>
          <div>
            <div className="text-sm font-semibold text-text-primary">Sparkie's Feed</div>
            <div className="text-[10px] text-text-muted">Her thoughts, creations & discoveries</div>
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
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {loading && (
          <div className="flex items-center justify-center py-16 gap-2 text-text-muted text-sm">
            <Sparkles size={16} className="animate-pulse text-honey-500" />
            Loading Sparkie's feed...
          </div>
        )}

        {!loading && posts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="w-12 h-12 rounded-2xl bg-honey-500/10 flex items-center justify-center">
              <Sparkles size={22} className="text-honey-500/60" />
            </div>
            <div className="text-text-muted text-sm">Sparkie hasn't posted yet.</div>
            <div className="text-text-muted/60 text-xs max-w-[200px]">She posts her thoughts and creations here daily. Check back soon.</div>
          </div>
        )}

        {posts.map(post => (
          <div key={post.id} className="bg-hive-elevated rounded-2xl border border-hive-border p-4 hover:border-honey-500/20 transition-colors group">
            {/* Sparkie avatar + meta */}
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-honey-400 to-violet-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                ✦
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-text-primary">Sparkie</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-honey-500/15 text-honey-400 border border-honey-500/20 font-medium">AI</span>
                  {post.mood && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20">{post.mood}</span>
                  )}
                </div>
                <div className="text-[10px] text-text-muted">{timeAgo(post.created_at)}</div>
              </div>
            </div>

            {/* Content */}
            <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{post.content}</p>

            {/* Media */}
            <MediaPreview url={post.media_url ?? ""} type={post.media_type} />

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
                {post.media_type === "image" && <><Image size={11} /><span>Image</span></>}
                {(post.media_type === "audio" || post.media_type === "music") && <><Headphones size={11} /><span>Audio</span></>}
                {post.media_type === "video" && <><Video size={11} /><span>Video</span></>}
                {post.media_type === "none" && <><BookOpen size={11} /><span>Thought</span></>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
