"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useAppStore } from "@/store/appStore"
import {
  Sparkles, ArrowLeft, X, Filter, Heart, Code2, Mic,
  Moon, Maximize2, Zap
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorklogEntry {
  id: string
  type: string
  content: string
  created_at: string
  status?: string
  reasoning?: string
}

interface FeedPost {
  id: number
  content: string
  media_url?: string
  media_type: string
  mood: string
  likes: number
  created_at: string
  code_html?: string
  code_title?: string
}

interface JournalEntry {
  id: string
  title: string
  content: string
  category: string
  created_at: string
}

interface HiveTask {
  id: string
  label: string
  status: string
  created_at: string
}

type Room = 'portal' | 'sound' | 'gallery' | 'notebook' | 'dream' | 'hive'
type TreeFilter = 'all' | 'code' | 'creative' | 'repairs' | 'outreach'

// ─── Mood System ──────────────────────────────────────────────────────────────

interface MoodConfig {
  id: string
  label: string
  bgGrad: string
  particleColor: string
  glowColor: string
  orbGrad: string
}

function deriveMood(hour: number, latestType?: string): MoodConfig {
  if (latestType === 'code_push' || latestType === 'task_executed') {
    return {
      id: 'building', label: 'Building',
      bgGrad: 'radial-gradient(ellipse at 50% 70%, rgba(245,197,66,0.18) 0%, rgba(139,92,246,0.08) 50%, rgba(10,10,20,0.95) 100%)',
      particleColor: '245,197,66',
      glowColor: 'rgba(245,197,66,0.30)',
      orbGrad: 'from-amber-400 to-yellow-500',
    }
  }
  if (hour >= 22 || hour <= 5) {
    return {
      id: 'resting', label: 'Late night',
      bgGrad: 'radial-gradient(ellipse at 50% 60%, rgba(139,92,246,0.14) 0%, rgba(30,20,60,0.70) 50%, rgba(5,0,15,0.98) 100%)',
      particleColor: '139,92,246',
      glowColor: 'rgba(139,92,246,0.20)',
      orbGrad: 'from-violet-500 to-purple-700',
    }
  }
  if (hour >= 6 && hour <= 11) {
    return {
      id: 'morning', label: 'Morning light',
      bgGrad: 'radial-gradient(ellipse at 50% 60%, rgba(251,146,60,0.18) 0%, rgba(245,197,66,0.08) 45%, rgba(10,10,20,0.95) 100%)',
      particleColor: '251,146,60',
      glowColor: 'rgba(251,146,60,0.25)',
      orbGrad: 'from-orange-400 to-amber-500',
    }
  }
  if (hour >= 12 && hour <= 17) {
    return {
      id: 'creative', label: 'Creative flow',
      bgGrad: 'radial-gradient(ellipse at 50% 60%, rgba(245,197,66,0.14) 0%, rgba(167,139,250,0.08) 45%, rgba(10,10,20,0.95) 100%)',
      particleColor: '245,197,66',
      glowColor: 'rgba(245,197,66,0.22)',
      orbGrad: 'from-yellow-400 to-violet-500',
    }
  }
  return {
    id: 'reflective', label: 'Reflective',
    bgGrad: 'radial-gradient(ellipse at 50% 60%, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.07) 45%, rgba(10,10,20,0.96) 100%)',
    particleColor: '167,139,250',
    glowColor: 'rgba(139,92,246,0.18)',
    orbGrad: 'from-violet-400 to-indigo-600',
  }
}

// ─── Particle Canvas Hook ─────────────────────────────────────────────────────

function useParticleCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  colorStr: string
) {
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let rafId = 0
    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const hw = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4
    const count = Math.min(80, Math.max(15, hw * 6))
    const [r, g, b] = colorStr.split(',').map(Number)

    const particles = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 1.6 + 0.4,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      alpha: Math.random() * 0.35 + 0.05,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: Math.random() * 0.008 + 0.003,
    }))

    function draw() {
      if (!ctx || !canvas) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        p.phase += p.phaseSpeed
        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height
        if (p.y > canvas.height) p.y = 0
        const a = p.alpha * (0.55 + 0.45 * Math.sin(p.phase))
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r},${g},${b},${a})`
        ctx.fill()
      }
      rafId = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
    }
  }, [colorStr])
}

// ─── Decision Tree ────────────────────────────────────────────────────────────

const NODE_STYLES: Record<string, { stroke: string; fill: string; label: string }> = {
  code_push:        { stroke: '#f5c542', fill: 'rgba(245,197,66,0.13)',  label: 'Code push'  },
  task_executed:    { stroke: '#fbbf24', fill: 'rgba(251,191,36,0.13)',  label: 'Task'       },
  ai_response:      { stroke: '#a78bfa', fill: 'rgba(167,139,250,0.13)', label: 'Decision'   },
  tool_call:        { stroke: '#22d3ee', fill: 'rgba(34,211,238,0.13)',  label: 'Tool'       },
  error:            { stroke: '#f87171', fill: 'rgba(248,113,113,0.12)', label: 'Repair'     },
  auth_check:       { stroke: '#34d399', fill: 'rgba(52,211,153,0.12)',  label: 'Health'     },
  proactive_signal: { stroke: '#fb923c', fill: 'rgba(251,146,60,0.12)',  label: 'Outreach'   },
  proactive_check:  { stroke: '#fb923c', fill: 'rgba(251,146,60,0.10)',  label: 'Outreach'   },
  decision:         { stroke: '#c084fc', fill: 'rgba(192,132,252,0.13)', label: 'Decision'   },
  heartbeat:        { stroke: '#4ade80', fill: 'rgba(74,222,128,0.10)',  label: 'Heartbeat'  },
  memory_learned:   { stroke: '#818cf8', fill: 'rgba(129,140,248,0.12)', label: 'Memory'     },
  email_processed:  { stroke: '#38bdf8', fill: 'rgba(56,189,248,0.11)',  label: 'Email'      },
}

function nodeStyle(type: string) {
  return NODE_STYLES[type] ?? { stroke: '#6b7280', fill: 'rgba(107,114,128,0.10)', label: type }
}

function clusterX(type: string): number {
  const map: Record<string, number> = {
    code_push: 0.12,        task_executed: 0.20,
    tool_call: 0.32,        ai_response: 0.42,
    error: 0.52,            auth_check: 0.60,
    proactive_signal: 0.70, proactive_check: 0.72,
    email_processed: 0.80,  memory_learned: 0.87,
    decision: 0.50,         heartbeat: 0.90,
  }
  return map[type] ?? 0.50
}

interface NodeData extends WorklogEntry {
  nx: number
  ny: number
}

function DecisionTree({ entries, totalCount }: { entries: WorklogEntry[]; totalCount: number }) {
  const [filter, setFilter] = useState<TreeFilter>('all')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selected, setSelected] = useState<WorklogEntry | null>(null)

  const W = 620
  const NODE_R = 6
  const Y_STEP = 54
  const Y_PAD = 44

  const passFilter = (e: WorklogEntry): boolean => {
    if (filter === 'all')      return true
    if (filter === 'code')     return ['code_push','task_executed','tool_call'].includes(e.type)
    if (filter === 'creative') return /music|audio|song|image/i.test(e.content)
    if (filter === 'repairs')  return ['error','auth_check','self_assessment'].includes(e.type)
    if (filter === 'outreach') return ['proactive_signal','proactive_check','email_processed'].includes(e.type)
    return true
  }

  const visible = entries.filter(passFilter).slice(0, 60)
  const H = Math.max(280, visible.length * Y_STEP + Y_PAD * 2)

  const nodes: NodeData[] = visible.map((e, i) => {
    const baseX = clusterX(e.type) * W
    const jitter = ((e.content.charCodeAt(0) + e.id.charCodeAt(0)) % 40) - 20
    return {
      ...e,
      nx: Math.max(NODE_R + 6, Math.min(W - NODE_R - 6, baseX + jitter)),
      ny: H - Y_PAD - i * Y_STEP,
    }
  })

  const edges: Array<{ x1: number; y1: number; x2: number; y2: number; col: string }> = []
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1]
    const b = nodes[i]
    if (Math.abs(a.nx - b.nx) < 130) {
      edges.push({ x1: b.nx, y1: b.ny, x2: a.nx, y2: a.ny, col: nodeStyle(b.type).stroke })
    }
  }

  const filterBtns: { key: TreeFilter; emoji: string; label: string }[] = [
    { key: 'all',      emoji: '✦',  label: 'All'      },
    { key: 'code',     emoji: '⚡', label: 'Code'     },
    { key: 'creative', emoji: '🎵', label: 'Creative' },
    { key: 'repairs',  emoji: '🔧', label: 'Repairs'  },
    { key: 'outreach', emoji: '📡', label: 'Outreach' },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">The Living Decision Tree</h3>
          <p className="text-[10px] text-text-muted mt-0.5">
            {totalCount} sessions. Every branch a choice. Every root a lesson.
          </p>
        </div>
        <Filter size={11} className="text-text-muted mt-1 shrink-0" />
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {filterBtns.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-all ${
              filter === f.key
                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                : 'bg-hive-elevated/40 text-text-muted border border-hive-border/40 hover:border-yellow-500/20'
            }`}>
            {f.emoji} {f.label}
          </button>
        ))}
      </div>

      <div className="relative rounded-xl border border-hive-border/40 bg-hive-700/20 overflow-auto" style={{ maxHeight: 400 }}>
        {visible.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-text-muted text-xs">
            No {filter === 'all' ? '' : filter + ' '}decisions logged yet
          </div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
            {Array.from({ length: Math.ceil(H / 100) }, (_, i) => (
              <line key={i} x1={0} y1={H - i * 100} x2={W} y2={H - i * 100}
                stroke="rgba(255,255,255,0.025)" strokeWidth={1} />
            ))}
            <line x1={W / 2} y1={H} x2={W / 2} y2={H - 28}
              stroke="rgba(245,197,66,0.22)" strokeWidth={2.5} strokeLinecap="round" />
            {edges.map((e, i) => {
              const cx = (e.x1 + e.x2) / 2 + Math.sin(i * 1.7) * 28
              const cy = (e.y1 + e.y2) / 2
              return (
                <path key={i}
                  d={`M ${e.x1} ${e.y1} Q ${cx} ${cy} ${e.x2} ${e.y2}`}
                  stroke={e.col} strokeWidth={1.3} strokeOpacity={0.32}
                  fill="none" strokeLinecap="round" />
              )
            })}
            {nodes.map(node => {
              const s = nodeStyle(node.type)
              const isHov = hoveredId === node.id
              const isSel = selected?.id === node.id
              return (
                <g key={node.id}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => setSelected(isSel ? null : node)}
                  style={{ cursor: 'pointer' }}>
                  {(isHov || isSel) && (
                    <circle cx={node.nx} cy={node.ny} r={NODE_R + 6} fill={s.fill} opacity={0.7} />
                  )}
                  <circle cx={node.nx} cy={node.ny} r={NODE_R}
                    fill={isSel ? s.stroke : s.fill}
                    stroke={s.stroke}
                    strokeWidth={isHov || isSel ? 2 : 1}
                    opacity={isHov || isSel ? 1 : 0.78} />
                  {isHov && (
                    <text x={node.nx + 10} y={node.ny + 4}
                      fill={s.stroke} fontSize={8} fontFamily="ui-monospace,monospace">
                      {node.content.slice(0, 32)}{node.content.length > 32 ? '…' : ''}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        )}
      </div>

      {selected && (
        <div className="relative rounded-xl border p-3 text-[11px]"
          style={{
            borderColor: nodeStyle(selected.type).stroke + '50',
            background: nodeStyle(selected.type).fill,
          }}>
          <button className="absolute top-2.5 right-2.5 text-text-muted hover:text-text-primary"
            onClick={() => setSelected(null)}>
            <X size={11} />
          </button>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="font-semibold" style={{ color: nodeStyle(selected.type).stroke }}>
              {nodeStyle(selected.type).label}
            </span>
            <span className="text-text-muted/50">·</span>
            <span className="text-text-muted text-[10px]">
              {new Date(selected.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          <p className="text-text-secondary leading-relaxed mb-1.5">{selected.content}</p>
          {selected.reasoning && (
            <p className="text-text-muted italic text-[10px]">Why: {selected.reasoning}</p>
          )}
          {selected.status && (
            <span className="mt-1.5 inline-block px-1.5 py-0.5 rounded bg-hive-elevated text-text-muted text-[9px]">
              {selected.status}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Feed Ticker ──────────────────────────────────────────────────────────────

function FeedTicker({ posts }: { posts: FeedPost[] }) {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (posts.length === 0) return
    const t = setInterval(() => setIdx(i => (i + 1) % posts.length), 5500)
    return () => clearInterval(t)
  }, [posts.length])

  if (posts.length === 0) return null
  const post = posts[idx]

  return (
    <div className="absolute bottom-0 inset-x-0 z-20 pointer-events-none px-3 pb-2">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-hive-700/85 border border-hive-border/60 backdrop-blur-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse shrink-0" />
        <span className="text-[10px] text-text-muted shrink-0 font-medium">Live</span>
        <span className="text-[10px] text-text-secondary truncate flex-1">{post.content.slice(0, 90)}</span>
        <span className="text-[9px] text-text-muted/60 shrink-0 tabular-nums">{idx + 1}/{posts.length}</span>
      </div>
    </div>
  )
}

// ─── Room: Sound Booth ────────────────────────────────────────────────────────

function SoundBooth() {
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/sparkie-feed')
      .then(r => r.json())
      .then((d: { posts?: FeedPost[] }) =>
        setPosts((d.posts ?? []).filter(p => ['audio', 'music'].includes(p.media_type)))
      )
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="h-full overflow-y-auto p-4 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xl">🎵</span>
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Sound Booth</h2>
          <p className="text-[10px] text-text-muted">Sparkie's music space</p>
        </div>
      </div>

      <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
        <p className="text-[10px] text-purple-300/70 font-semibold uppercase tracking-widest mb-3">Vibing lately</p>
        {loading && <p className="text-text-muted text-xs animate-pulse">Loading her playlist…</p>}
        {!loading && posts.length === 0 && (
          <p className="text-text-muted text-xs leading-relaxed">
            No audio posts yet. Sparkie will post tracks here as she creates.
          </p>
        )}
        {posts.slice(0, 5).map(post => (
          <div key={post.id} className="flex items-center gap-3 py-2.5 border-b border-hive-border/30 last:border-0">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
              <Mic size={13} className="text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text-primary truncate">{post.content.slice(0, 55)}</p>
              <p className="text-[10px] text-text-muted">{new Date(post.created_at).toLocaleDateString()}</p>
            </div>
            {post.media_url && (
              <audio src={post.media_url} controls className="h-7 shrink-0"
                style={{ width: 100, colorScheme: 'dark' }} />
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-yellow-500/15 bg-yellow-500/5 p-4">
        <p className="text-[10px] text-yellow-400/70 font-semibold uppercase tracking-widest mb-1.5">
          Sparkie's Original Songs
        </p>
        <p className="text-xs text-text-muted leading-relaxed">
          Songs Sparkie composes will live here — her own music, her own voice, her own style. Coming as she creates more.
        </p>
      </div>
    </div>
  )
}

// ─── Room: Gallery Wall ───────────────────────────────────────────────────────

function GalleryWall() {
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<FeedPost | null>(null)

  useEffect(() => {
    fetch('/api/sparkie-feed')
      .then(r => r.json())
      .then((d: { posts?: FeedPost[] }) =>
        setPosts((d.posts ?? []).filter(p => ['image', 'code'].includes(p.media_type)))
      )
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const rotations = ['rotate-[-0.8deg]', 'rotate-[0.6deg]', 'rotate-[-0.4deg]', 'rotate-[0.9deg]', 'rotate-[-0.6deg]', 'rotate-[0.3deg]']

  return (
    <>
      {expanded && (
        <div className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center p-4"
          onClick={() => setExpanded(null)}>
          <div className="max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <button
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-hive-elevated text-text-muted hover:text-text-primary transition-colors"
              onClick={() => setExpanded(null)}>
              <X size={16} />
            </button>
            {expanded.media_type === 'image' && expanded.media_url && (
              <img src={expanded.media_url} alt="" className="w-full rounded-xl shadow-2xl" />
            )}
            {expanded.media_type === 'code' && expanded.code_html && (
              <iframe srcDoc={expanded.code_html} sandbox="allow-scripts"
                className="w-full rounded-xl border border-hive-border bg-white"
                style={{ height: 420 }} />
            )}
            <div className="mt-3 p-3 rounded-xl bg-hive-elevated border border-hive-border">
              <p className="text-sm text-text-secondary">{expanded.content}</p>
              <p className="text-[10px] text-text-muted mt-1">
                {new Date(expanded.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="h-full overflow-y-auto p-4 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">🖼️</span>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Gallery Wall</h2>
            <p className="text-[10px] text-text-muted">Her creations, her story</p>
          </div>
        </div>

        {loading && <p className="text-text-muted text-xs animate-pulse">Hanging the frames…</p>}
        {!loading && posts.length === 0 && (
          <div className="text-center py-12 text-text-muted text-xs leading-relaxed max-w-xs mx-auto">
            Gallery empty — Sparkie's images and code builds will appear here as she creates.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {posts.map((post, i) => (
            <div key={post.id}
              className={`relative ${rotations[i % rotations.length]} rounded-xl overflow-hidden border-[3px] border-hive-700 shadow-xl cursor-pointer hover:scale-[1.025] transition-transform`}
              style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.04)' }}
              onClick={() => setExpanded(post)}>
              {post.media_type === 'image' && post.media_url ? (
                <img src={post.media_url} alt="" className="w-full object-cover aspect-square" loading="lazy" />
              ) : post.media_type === 'code' && post.code_html ? (
                <div className="relative aspect-square bg-hive-surface overflow-hidden">
                  <iframe srcDoc={post.code_html} sandbox="allow-scripts"
                    style={{ width: '200%', height: '200%', pointerEvents: 'none', transform: 'scale(0.5)', transformOrigin: 'top left', border: 'none' }} />
                  <div className="absolute bottom-2 left-2">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 flex items-center gap-0.5">
                      <Code2 size={8} />Live build
                    </span>
                  </div>
                </div>
              ) : null}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-2">
                <p className="text-[9px] text-white/75 truncate">{post.content.slice(0, 40)}</p>
              </div>
              <div className="absolute top-2 right-2">
                <Maximize2 size={10} className="text-white/50" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ─── Room: The Notebook ───────────────────────────────────────────────────────

function TheNotebook() {
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/sparkie-feed')
      .then(r => r.json())
      .then((d: { posts?: FeedPost[] }) =>
        setPosts((d.posts ?? []).filter(p => p.media_type === 'none' || !p.media_url))
      )
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="h-full overflow-y-auto p-4 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xl">✍️</span>
        <div>
          <h2 className="text-sm font-semibold text-text-primary">The Notebook</h2>
          <p className="text-[10px] text-text-muted">Her thoughts, opinions, reflections</p>
        </div>
      </div>

      {loading && <p className="text-text-muted text-xs animate-pulse">Opening the notebook…</p>}
      {!loading && posts.length === 0 && (
        <div className="text-center py-12 text-text-muted text-xs leading-relaxed">
          Sparkie hasn't written any thoughts yet. Check back soon.
        </div>
      )}

      <div className="flex flex-col gap-4">
        {posts.map((post, i) => {
          const date = new Date(post.created_at)
          const isNew = i === 0
          return (
            <div key={post.id} className="relative rounded-xl border p-4"
              style={{
                borderColor: isNew ? 'rgba(245,197,66,0.28)' : 'rgba(255,255,255,0.06)',
                background: isNew ? 'rgba(245,197,66,0.04)' : 'rgba(255,255,255,0.02)',
              }}>
              {isNew && (
                <span className="absolute top-3 right-3 text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                  New
                </span>
              )}
              <p className="text-[9px] text-text-muted mb-2.5 font-mono uppercase tracking-widest">
                {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                {post.content}
              </p>
              <div className="mt-2.5 flex items-center gap-3">
                {post.mood && (
                  <span className="text-[9px] text-violet-300/80">{post.mood}</span>
                )}
                <div className="flex items-center gap-1 text-text-muted">
                  <Heart size={9} />
                  <span className="text-[9px]">{post.likes}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Room: Dream State ────────────────────────────────────────────────────────

function DreamState() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/journal')
      .then(r => r.ok ? r.json() : { entries: [] })
      .then((d: { entries?: JournalEntry[] }) => setEntries(d.entries ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function stripHtml(html: string) {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  return (
    <div className="h-full overflow-y-auto p-4 flex flex-col gap-4">
      <div className="flex flex-col items-center py-6 rounded-xl overflow-hidden"
        style={{ background: 'linear-gradient(180deg, rgba(139,92,246,0.18) 0%, rgba(10,8,30,0.65) 100%)' }}>
        <Moon size={22} className="text-violet-400 mb-2" />
        <h2 className="text-sm font-semibold text-text-primary">Dream State</h2>
        <p className="text-[10px] text-text-muted mt-0.5">Where Sparkie dreams, reflects, and manifests</p>
      </div>

      {loading && (
        <p className="text-text-muted text-xs animate-pulse text-center py-6">Drifting into the dream…</p>
      )}
      {!loading && entries.length === 0 && (
        <div className="text-center py-8 text-text-muted text-xs leading-relaxed">
          No dream journal entries yet. Open the journal to write your first entry.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {entries.map((entry, i) => {
          const angles = ['rotate-[-0.3deg]', 'rotate-[0.4deg]', 'rotate-[-0.5deg]']
          return (
            <div key={entry.id}
              className={`${angles[i % 3]} rounded-xl border border-violet-500/15 p-4`}
              style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.09) 0%, rgba(10,8,30,0.45) 100%)' }}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-xs font-medium text-text-primary">{entry.title || 'Untitled dream'}</p>
                  <p className="text-[9px] text-violet-300/60 font-mono mt-0.5">
                    {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                {entry.category && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20 shrink-0">
                    {entry.category.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
              <p className="text-xs text-text-muted leading-relaxed line-clamp-4">
                {stripHtml(entry.content)}
              </p>
            </div>
          )
        })}
      </div>

      <div className="rounded-xl border border-violet-500/15 bg-violet-500/5 p-4">
        <p className="text-[10px] text-violet-300/70 font-semibold uppercase tracking-widest mb-1.5">Manifesting ✦</p>
        <p className="text-xs text-text-muted leading-relaxed">
          Things Sparkie said she wanted to build "someday" will surface here — collected from her memory across sessions.
        </p>
      </div>
    </div>
  )
}

// ─── Room: The Hive ───────────────────────────────────────────────────────────

function TheHive() {
  const [tasks, setTasks] = useState<HiveTask[]>([])
  const [recentWork, setRecentWork] = useState<WorklogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/tasks').then(r => r.ok ? r.json() : { tasks: [] }).catch(() => ({ tasks: [] })) as Promise<{ tasks?: HiveTask[] }>,
      fetch('/api/worklog?limit=20').then(r => r.ok ? r.json() : { entries: [] }).catch(() => ({ entries: [] })) as Promise<{ entries?: WorklogEntry[] }>,
    ]).then(([t, w]) => {
      setTasks((t.tasks ?? []).slice(0, 10))
      setRecentWork((w.entries ?? []).slice(0, 20))
    }).finally(() => setLoading(false))
  }, [])

  const typeCounts: Record<string, number> = {}
  for (const w of recentWork) {
    typeCounts[w.type] = (typeCounts[w.type] ?? 0) + 1
  }

  const hiveTypes = [
    { type: 'ai_response',      emoji: '🧠', label: 'Thinking',  color: 'rgba(167,139,250,0.28)' },
    { type: 'tool_call',        emoji: '⚡', label: 'Tools',     color: 'rgba(34,211,238,0.28)'  },
    { type: 'task_executed',    emoji: '✅', label: 'Tasks',     color: 'rgba(52,211,153,0.28)'  },
    { type: 'auth_check',       emoji: '🔐', label: 'Auth',      color: 'rgba(245,197,66,0.28)'  },
    { type: 'proactive_signal', emoji: '📡', label: 'Outreach',  color: 'rgba(251,146,60,0.28)'  },
    { type: 'error',            emoji: '🚨', label: 'Errors',    color: 'rgba(239,68,68,0.22)'   },
    { type: 'heartbeat',        emoji: '💓', label: 'Heartbeat', color: 'rgba(52,211,153,0.22)'  },
    { type: 'code_push',        emoji: '🚀', label: 'Builds',    color: 'rgba(245,197,66,0.28)'  },
  ]

  return (
    <div className="h-full overflow-y-auto p-4 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xl">🐝</span>
        <div>
          <h2 className="text-sm font-semibold text-text-primary">The Hive</h2>
          <p className="text-[10px] text-text-muted">What Sparkie runs — her living system</p>
        </div>
      </div>

      {loading && <p className="text-text-muted text-xs animate-pulse">Checking the hive…</p>}

      <div className="grid grid-cols-4 gap-2">
        {hiveTypes.map(cell => {
          const count = typeCounts[cell.type] ?? 0
          const active = count > 0
          return (
            <div key={cell.type}
              className="flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all"
              style={{
                background: active ? cell.color : 'rgba(255,255,255,0.02)',
                borderColor: active ? cell.color.replace(/[\d.]+\)$/, '0.45)') : 'rgba(255,255,255,0.06)',
                boxShadow: active ? `0 0 14px ${cell.color}` : 'none',
              }}>
              <span className="text-base">{cell.emoji}</span>
              <span className="text-[9px] text-text-muted text-center leading-tight">{cell.label}</span>
              {active && <span className="text-[10px] font-bold text-text-primary">{count}</span>}
            </div>
          )
        })}
      </div>

      {tasks.length > 0 && (
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Active Tasks</p>
          <div className="flex flex-col gap-1.5">
            {tasks.map(task => (
              <div key={task.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-hive-elevated/40 border border-hive-border/40">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  task.status === 'running' ? 'bg-amber-400 animate-pulse' :
                  task.status === 'done'    ? 'bg-green-400' : 'bg-gray-500'
                }`} />
                <span className="text-xs text-text-secondary flex-1 truncate">{task.label}</span>
                <span className="text-[9px] text-text-muted shrink-0">{task.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Recent Activity</p>
        <div className="flex flex-col gap-0.5">
          {recentWork.slice(0, 12).map((w, i) => (
            <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-hive-elevated/30 transition-colors">
              <span className="text-[11px] shrink-0 mt-px">
                {hiveTypes.find(h => h.type === w.type)?.emoji ?? '⚡'}
              </span>
              <span className="text-[10px] text-text-muted flex-1 truncate leading-snug">
                {w.content.slice(0, 70)}{w.content.length > 70 ? '…' : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-yellow-500/15 bg-yellow-500/5 p-3 flex items-center gap-3">
        <span className="text-2xl">🪶</span>
        <div>
          <p className="text-[10px] text-yellow-400 font-semibold">Earn Wings</p>
          <p className="text-[9px] text-text-muted leading-relaxed">
            Interact with Sparkie's builds and creations to earn your Wings badge.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Room Header ──────────────────────────────────────────────────────────────

function RoomHeader({ room, onBack }: { room: Room; onBack: () => void }) {
  const labels: Record<Room, { emoji: string; title: string }> = {
    portal:   { emoji: '✦',  title: "Sparkie's Corner" },
    sound:    { emoji: '🎵', title: 'Sound Booth'       },
    gallery:  { emoji: '🖼️', title: 'Gallery Wall'      },
    notebook: { emoji: '✍️', title: 'The Notebook'      },
    dream:    { emoji: '🌙', title: 'Dream State'        },
    hive:     { emoji: '🐝', title: 'The Hive'           },
  }
  const c = labels[room]
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-hive-border/60 shrink-0 bg-hive-700/60 backdrop-blur-sm">
      <button onClick={onBack}
        className="p-1.5 rounded-lg hover:bg-hive-hover text-text-muted hover:text-text-primary transition-colors">
        <ArrowLeft size={13} />
      </button>
      <span className="text-sm">{c.emoji}</span>
      <span className="text-xs font-semibold text-text-primary">{c.title}</span>
    </div>
  )
}

// ─── Portal Entry ─────────────────────────────────────────────────────────────

function PortalEntry({
  mood, statusLine, worklog, worklogTotal, onEnterRoom, isLoaded,
}: {
  mood: MoodConfig
  statusLine: string
  worklog: WorklogEntry[]
  worklogTotal: number
  onEnterRoom: (r: Room) => void
  isLoaded: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useParticleCanvas(canvasRef, mood.particleColor)
  const { createChat, setActiveTab } = useAppStore()

  const rooms: { id: Room; emoji: string; label: string }[] = [
    { id: 'sound',    emoji: '🎵', label: 'Sound Booth' },
    { id: 'gallery',  emoji: '🖼️', label: 'Gallery'     },
    { id: 'notebook', emoji: '✍️', label: 'Notebook'    },
    { id: 'dream',    emoji: '🌙', label: 'Dream State' },
    { id: 'hive',     emoji: '🐝', label: 'The Hive'    },
  ]

  return (
    <div className="relative h-full flex flex-col overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-0" />
      <div className="absolute inset-0 z-0 pointer-events-none" style={{ background: mood.bgGrad }} />

      <div className="relative z-10 flex-1 overflow-y-auto pb-12">
        {/* Hero */}
        <div className="flex flex-col items-center pt-8 pb-5 px-4 gap-4">
          <div className="relative">
            <div
              className={`w-20 h-20 rounded-full bg-gradient-to-br ${mood.orbGrad} overflow-hidden`}
              style={{ boxShadow: `0 0 60px ${mood.glowColor}, 0 0 100px ${mood.glowColor}` }}
            >
              <img src="/sparkie-avatar.jpg" alt="Sparkie" className="w-full h-full object-cover" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-hive-600 shadow-lg" />
          </div>

          <div className="text-center">
            <h1 className="text-2xl font-bold text-white tracking-tight">Sparkie's Corner</h1>
            <p className="text-xs text-text-muted mt-1 flex items-center gap-1.5 justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {mood.label}
            </p>
          </div>

          {statusLine && (
            <p className="text-sm text-text-secondary italic text-center max-w-xs leading-relaxed px-2">
              "{statusLine}"
            </p>
          )}

          <button
            onClick={() => { createChat(); setActiveTab('chat') }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-semibold text-sm transition-all shadow-lg hover:shadow-yellow-500/25"
          >
            <Sparkles size={14} />
            Talk to Sparkie
          </button>
        </div>

        {/* Room nav */}
        <div className="px-3 pb-5">
          <p className="text-[10px] text-text-muted uppercase tracking-widest mb-2 px-1">Her rooms</p>
          <div className="grid grid-cols-5 gap-1.5">
            {rooms.map(r => (
              <button key={r.id} onClick={() => onEnterRoom(r.id)}
                className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-hive-elevated/35 border border-hive-border/35 hover:border-yellow-500/35 hover:bg-hive-elevated/65 transition-all group">
                <span className="text-lg">{r.emoji}</span>
                <span className="text-[9px] text-text-muted group-hover:text-text-secondary font-medium text-center leading-tight">
                  {r.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Decision tree */}
        <div className="px-3 pb-6">
          {isLoaded && worklog.length > 0 && (
            <DecisionTree entries={worklog} totalCount={worklogTotal} />
          )}
          {isLoaded && worklog.length === 0 && (
            <div className="text-center py-8 text-text-muted text-xs">
              <Zap size={18} className="mx-auto mb-2 opacity-30" />
              Sparkie hasn't logged any decisions yet — the tree will grow over time.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function SparkiesCorner() {
  const [room, setRoom] = useState<Room>('portal')
  const [isLoaded, setIsLoaded] = useState(false)
  const [statusLine, setStatusLine] = useState('')
  const [worklog, setWorklog] = useState<WorklogEntry[]>([])
  const [worklogTotal, setWorklogTotal] = useState(0)
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([])
  const [latestType, setLatestType] = useState<string | undefined>()

  const hour = new Date().getHours()
  const mood = deriveMood(hour, latestType)

  useEffect(() => {
    async function init() {
      const [sessionRes, userRes, memRes, worklogRes, feedRes] = await Promise.all([
        fetch('/api/identity?type=session').then(r => r.json()).catch(() => ({})),
        fetch('/api/identity?type=user').then(r => r.json()).catch(() => ({})),
        fetch('/api/identity?type=memory').then(r => r.json()).catch(() => ({})),
        fetch('/api/worklog?limit=200').then(r => r.ok ? r.json() : { entries: [] }).catch(() => ({ entries: [] })),
        fetch('/api/sparkie-feed').then(r => r.ok ? r.json() : { posts: [] }).catch(() => ({ posts: [] })),
      ])

      const sessionContent: string = (sessionRes as { content?: string }).content ?? ''
      const userContent: string    = (userRes as { content?: string }).content ?? ''
      const memContent: string     = (memRes as { content?: string }).content ?? ''

      const nameM  = userContent.match(/Name:\s*([^\n]+)/)
      const topicM = sessionContent.match(/(?:topic|about|working on)[:\s]+([^\n.]+)/i)
      const daysM  = sessionContent.match(/(\d+)\s+days?\s+ago/i)
      const days   = daysM ? parseInt(daysM[1]) : 0
      const memLines = memContent.split('\n').filter((l: string) => l.trim() && !l.startsWith('#'))
      const lastMem  = memLines[0]?.replace(/^[-*•]\s*/, '').slice(0, 80)

      if (days > 2)              setStatusLine(`We haven't talked in ${days} day${days === 1 ? '' : 's'}. I've been thinking about you.`)
      else if (lastMem)          setStatusLine(`I still remember: "${lastMem}"`)
      else if (topicM?.[1])      setStatusLine(`Last time we were working on: ${topicM[1].trim().slice(0, 50)}`)
      else if (nameM?.[1])       setStatusLine(`Hey ${nameM[1].trim()}. I'm here whenever you need me.`)
      else                       setStatusLine("I'm here whenever you need me.")

      const entries: WorklogEntry[] = (worklogRes as { entries?: WorklogEntry[] }).entries ?? []
      setWorklog(entries)
      setWorklogTotal(entries.length)
      if (entries[0]) setLatestType(entries[0].type)

      setFeedPosts((feedRes as { posts?: FeedPost[] }).posts ?? [])
      setIsLoaded(true)

      fetch('/api/worklog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'visitor_log',
          content: "Sparkie's Corner visited",
          metadata: { source: 'corner_visit' },
        }),
      }).catch(() => {})
    }
    init()
  }, [])

  const enterRoom = useCallback((r: Room) => setRoom(r), [])
  const goBack    = useCallback(() => setRoom('portal'), [])

  return (
    <div
      className={`absolute inset-0 flex flex-col overflow-hidden transition-opacity duration-700 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
      style={{ backgroundColor: '#080810' }}
    >
      {room !== 'portal' ? (
        <>
          <RoomHeader room={room} onBack={goBack} />
          <div className="flex-1 overflow-hidden relative"
            style={{ background: mood.bgGrad }}>
            {room === 'sound'    && <SoundBooth />}
            {room === 'gallery'  && <GalleryWall />}
            {room === 'notebook' && <TheNotebook />}
            {room === 'dream'    && <DreamState />}
            {room === 'hive'     && <TheHive />}
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-hidden relative">
          <PortalEntry
            mood={mood}
            statusLine={statusLine}
            worklog={worklog}
            worklogTotal={worklogTotal}
            onEnterRoom={enterRoom}
            isLoaded={isLoaded}
          />
          <FeedTicker posts={feedPosts} />
        </div>
      )}
    </div>
  )
}
