'use client'

import { useState, useEffect, useCallback, ComponentType } from 'react'
import { Brain, Trash2, RefreshCw, Sparkles, Shield, Clock, Zap, BookOpen, User } from 'lucide-react'

interface MemoryEntry {
  id: number
  category: string
  content: string
  source: string
  memory_type?: string
  stale_flagged?: boolean
  expires_at?: string
  created_at: string
}

const CATEGORY_STYLES: Record<string, { pill: string; card: string; dot: string; icon: ComponentType }> = {
  work_rule:      { pill: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',  card: 'border-l-purple-500/60 bg-gradient-to-br from-purple-900/20 to-purple-950/40', dot: 'bg-purple-500', icon: Shield },
  self:           { pill: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',        card: 'border-l-blue-500/60 bg-gradient-to-br from-blue-900/20 to-blue-950/40',       dot: 'bg-blue-500',   icon: Brain  },
  profile:        { pill: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',  card: 'border-l-indigo-500/60 bg-gradient-to-br from-indigo-900/20 to-indigo-950/40', dot: 'bg-indigo-400', icon: User   },
  api_behavior:   { pill: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',     card: 'border-l-amber-500/60 bg-gradient-to-br from-amber-900/15 to-amber-950/35',    dot: 'bg-amber-500',  icon: Zap    },
  failure:        { pill: 'bg-red-500/20 text-red-300 border border-red-500/30',           card: 'border-l-red-500/60 bg-gradient-to-br from-red-900/15 to-red-950/35',          dot: 'bg-red-500',    icon: BookOpen },
  workaround:     { pill: 'bg-green-500/20 text-green-300 border border-green-500/30',     card: 'border-l-green-500/60 bg-gradient-to-br from-green-900/15 to-green-950/35',    dot: 'bg-green-500',  icon: RefreshCw },
  self_assessment:{ pill: 'bg-honey-500/20 text-honey-300 border border-honey-500/30',     card: 'border-l-honey-500/60 bg-gradient-to-br from-yellow-900/15 to-yellow-950/35',  dot: 'bg-honey-500',  icon: Sparkles },
}

const DEFAULT_STYLE = {
  pill: 'bg-slate-500/20 text-slate-300 border border-slate-500/30',
  card: 'border-l-slate-500/60 bg-gradient-to-br from-slate-800/20 to-slate-900/40',
  dot: 'bg-slate-500',
  icon: BookOpen as ComponentType,
}

function getStyle(category: string) {
  return CATEGORY_STYLES[category] ?? DEFAULT_STYLE
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function ttlLabel(expiresAt?: string, stale?: boolean): { label: string; cls: string } | null {
  if (stale) return { label: '⚠ stale', cls: 'text-yellow-400' }
  if (!expiresAt) return null
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return { label: 'expired', cls: 'text-red-400' }
  if (days <= 3) return { label: `${days}d left`, cls: 'text-yellow-400' }
  if (days <= 14) return { label: `${days}d left`, cls: 'text-text-muted' }
  return null
}

export function MemoryTab() {
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [forgetting, setForgetting] = useState<Set<number>>(new Set())
  const [forgotten, setForgotten] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState<string>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/sparkie-self-memory?limit=80')
      const data = await res.json() as { memories: MemoryEntry[] }
      setMemories(data.memories || [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const forget = async (id: number) => {
    setForgetting(prev => new Set(prev).add(id))
    try {
      await fetch('/api/sparkie-self-memory', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      setForgotten(prev => new Set(prev).add(id))
      // Remove from list after animation
      setTimeout(() => {
        setMemories(prev => prev.filter(m => m.id !== id))
        setForgotten(prev => { const s = new Set(prev); s.delete(id); return s })
      }, 1200)
    } catch {
      // silent
    } finally {
      setForgetting(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const categories = ['all', ...Array.from(new Set(memories.map(m => m.category))).sort()]
  const visible = filter === 'all' ? memories : memories.filter(m => m.category === filter)

  // Group by "I already knew this" vs "I've learned something new" (last 24h = new)
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const fresh = visible.filter(m => new Date(m.created_at).getTime() > cutoff)
  const established = visible.filter(m => new Date(m.created_at).getTime() <= cutoff)

  if (loading) return (
    <div className="h-full flex items-center justify-center">
      <RefreshCw size={16} className="animate-spin text-text-muted" />
    </div>
  )

  if (memories.length === 0) return (
    <div className="h-full flex flex-col items-center justify-center text-text-muted p-8">
      <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-4">
        <Brain size={24} className="text-purple-400" />
      </div>
      <p className="text-sm font-medium text-text-secondary mb-1">No memories yet</p>
      <p className="text-xs text-center">Sparkie builds her memory as she works</p>
    </div>
  )

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-purple-500/20 flex items-center justify-center">
            <Brain size={11} className="text-purple-400" />
          </div>
          <span className="text-xs font-semibold text-text-primary">Sparkie's Memory</span>
          <span className="text-[10px] text-text-muted bg-hive-hover px-1.5 py-0.5 rounded-full">{memories.length}</span>
        </div>
        <button onClick={load} className="p-1 rounded hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors" title="Refresh">
          <RefreshCw size={11} />
        </button>
      </div>

      {/* Category filter pills */}
      <div className="flex gap-1.5 px-3 pb-2 overflow-x-auto shrink-0 scrollbar-hide">
        {categories.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
              filter === cat
                ? 'bg-purple-500/30 text-purple-200 border-purple-500/50'
                : 'bg-hive-hover text-text-muted border-transparent hover:border-purple-500/30'
            }`}>
            {cat === 'all' ? 'All' : cat.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* Memory feed */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-3">

        {fresh.length > 0 && (
          <section>
            <p className="text-[10px] text-text-muted font-medium mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block" />
              I&apos;ve learned something new:
            </p>
            <div className="space-y-2">
              {fresh.map(m => <MemoryCard key={m.id} m={m} onForget={forget} forgetting={forgetting.has(m.id)} forgotten={forgotten.has(m.id)} />)}
            </div>
          </section>
        )}

        {established.length > 0 && (
          <section>
            <p className="text-[10px] text-text-muted font-medium mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
              I already knew this:
            </p>
            <div className="space-y-2">
              {established.map(m => <MemoryCard key={m.id} m={m} onForget={forget} forgetting={forgetting.has(m.id)} forgotten={forgotten.has(m.id)} />)}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}

function MemoryCard({ m, onForget, forgetting, forgotten }: {
  m: MemoryEntry
  onForget: (id: number) => void
  forgetting: boolean
  forgotten: boolean
}) {
  const style = getStyle(m.category)
  const Icon = style.icon
  const ttl = ttlLabel(m.expires_at, m.stale_flagged)

  return (
    <div className={`relative rounded-xl border-l-2 p-3 transition-all duration-500 ${style.card} ${forgotten ? 'opacity-30 scale-95' : 'opacity-100'}`}>
      {/* Trash button */}
      <button
        onClick={() => onForget(m.id)}
        disabled={forgetting || forgotten}
        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/40 border border-white/5 flex items-center justify-center text-text-muted hover:text-red-400 hover:border-red-500/30 transition-colors"
        title="Forget this"
      >
        {forgetting ? <RefreshCw size={9} className="animate-spin" /> : <Trash2 size={9} />}
      </button>

      {/* Forgotten strikethrough */}
      {forgotten && (
        <div className="absolute inset-0 flex items-center pointer-events-none px-3">
          <div className="w-full h-px bg-white/30" />
        </div>
      )}
      {forgotten && (
        <p className="text-[10px] text-text-muted mb-1 font-medium">I&apos;ve forgotten this:</p>
      )}

      <div className="flex items-start gap-2 pr-6">
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 bg-gradient-to-br ${
          m.category === 'work_rule' ? 'from-purple-600/30 to-purple-800/30' :
          m.category === 'self' ? 'from-blue-600/30 to-blue-800/30' :
          'from-slate-600/30 to-slate-800/30'
        }`}>
          <Icon size={11} className={
            m.category === 'work_rule' ? 'text-purple-300' :
            m.category === 'self' ? 'text-blue-300' :
            m.category === 'api_behavior' ? 'text-amber-300' :
            'text-slate-300'
          } />
        </div>

        <div className="flex-1 min-w-0">
          <p className={`text-xs text-text-secondary leading-relaxed break-words ${forgotten ? 'line-through decoration-white/40' : ''}`}>
            {m.content}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${style.pill}`}>
              {m.category.replace(/_/g, ' ')}
            </span>
            <span className="text-[9px] text-text-muted flex items-center gap-0.5">
              <Clock size={8} />
              {formatDate(m.created_at)}
            </span>
            {ttl && <span className={`text-[9px] ${ttl.cls}`}>{ttl.label}</span>}
            {m.stale_flagged && <span className="text-[9px] text-yellow-400">needs re-verify</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
