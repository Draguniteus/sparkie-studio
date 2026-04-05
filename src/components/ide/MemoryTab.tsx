'use client'

import { useState, useEffect, useCallback } from 'react'
import { Brain, Trash2, RefreshCw, Sparkles, Shield, Clock, Zap, BookOpen, User, Calendar, MessageSquare, Search, type LucideIcon } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────
interface UserMemoryEntry {
  id: number
  content: string
  category: string
  source?: string
  created_at: string
}

interface SelfMemoryEntry {
  id: number
  category: string
  content: string
  source: string
  memory_type?: string
  stale_flagged?: boolean
  expires_at?: string
  created_at: string
}

// ── Category styles — full 20+ category coverage ─────────────────────────
const USER_CATEGORY_STYLES: Record<string, { pill: string; card: string; dot: string; icon: LucideIcon; label: string }> = {
  work_rule:       { pill: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',   card: 'border-l-orange-500/60 bg-gradient-to-br from-orange-900/25 to-orange-950/40',  dot: 'bg-orange-500',  icon: Shield,        label: 'Work Rule'    },
  profile:         { pill: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',   card: 'border-l-indigo-500/60 bg-gradient-to-br from-indigo-900/25 to-indigo-950/45',  dot: 'bg-indigo-400',  icon: User,          label: 'Profile'      },
  comm_style:      { pill: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',      card: 'border-l-amber-500/60 bg-gradient-to-br from-amber-900/20 to-amber-950/35',     dot: 'bg-amber-500',   icon: MessageSquare, label: 'Comm Style'   },
  time_pref:       { pill: 'bg-sky-500/20 text-sky-300 border border-sky-500/30',            card: 'border-l-sky-500/60 bg-gradient-to-br from-sky-900/20 to-sky-950/35',           dot: 'bg-sky-400',     icon: Calendar,      label: 'Time Pref'    },
  contact:         { pill: 'bg-pink-500/20 text-pink-300 border border-pink-500/30',         card: 'border-l-pink-500/60 bg-gradient-to-br from-pink-900/20 to-pink-950/35',        dot: 'bg-pink-400',    icon: User,          label: 'Contact'      },
  lessons:         { pill: 'bg-green-500/20 text-green-300 border border-green-500/30',      card: 'border-l-green-500/60 bg-gradient-to-br from-green-900/20 to-green-950/35',     dot: 'bg-green-500',   icon: BookOpen,      label: 'Lessons'      },
  history:         { pill: 'bg-slate-500/20 text-slate-300 border border-slate-500/30',      card: 'border-l-slate-500/60 bg-gradient-to-br from-slate-800/20 to-slate-900/35',     dot: 'bg-slate-400',   icon: BookOpen,      label: 'History'      },
  user:            { pill: 'bg-sky-500/20 text-sky-300 border border-sky-500/30',            card: 'border-l-sky-500/60 bg-gradient-to-br from-sky-900/20 to-sky-950/35',           dot: 'bg-sky-400',     icon: User,          label: 'User'         },
  user_prefs:      { pill: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',         card: 'border-l-blue-500/60 bg-gradient-to-br from-blue-900/20 to-blue-950/35',        dot: 'bg-blue-400',    icon: Calendar,      label: 'Preferences'  },
}

const SELF_CATEGORY_STYLES: Record<string, { pill: string; card: string; dot: string; icon: LucideIcon }> = {
  // Core categories
  work_rule:        { pill: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',  card: 'border-l-orange-500/60 bg-gradient-to-br from-orange-900/20 to-orange-950/35',  dot: 'bg-orange-500',  icon: Shield   },
  self:             { pill: 'bg-violet-500/20 text-violet-300 border border-violet-500/30',  card: 'border-l-violet-500/60 bg-gradient-to-br from-violet-900/20 to-violet-950/40',  dot: 'bg-violet-500',  icon: Brain    },
  profile:          { pill: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',  card: 'border-l-indigo-500/60 bg-gradient-to-br from-indigo-900/20 to-indigo-950/40',  dot: 'bg-indigo-400',  icon: User     },
  // Behavioral
  api_behavior:     { pill: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',     card: 'border-l-amber-500/60 bg-gradient-to-br from-amber-900/15 to-amber-950/35',     dot: 'bg-amber-500',   icon: Zap      },
  tool_knowledge:   { pill: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',     card: 'border-l-amber-500/60 bg-gradient-to-br from-amber-900/15 to-amber-950/30',     dot: 'bg-amber-400',   icon: Zap      },
  // Learning
  lessons:          { pill: 'bg-green-500/20 text-green-300 border border-green-500/30',     card: 'border-l-green-500/60 bg-gradient-to-br from-green-900/15 to-green-950/35',     dot: 'bg-green-500',   icon: BookOpen },
  workaround:       { pill: 'bg-teal-500/20 text-teal-300 border border-teal-500/30',        card: 'border-l-teal-500/60 bg-gradient-to-br from-teal-900/15 to-teal-950/35',        dot: 'bg-teal-500',    icon: RefreshCw },
  workarounds:      { pill: 'bg-teal-500/20 text-teal-300 border border-teal-500/30',        card: 'border-l-teal-500/60 bg-gradient-to-br from-teal-900/15 to-teal-950/35',        dot: 'bg-teal-500',    icon: RefreshCw },
  // Error/failure
  failure:          { pill: 'bg-red-500/20 text-red-300 border border-red-500/30',           card: 'border-l-red-500/60 bg-gradient-to-br from-red-900/15 to-red-950/35',           dot: 'bg-red-500',     icon: BookOpen },
  failures:         { pill: 'bg-red-500/20 text-red-300 border border-red-500/30',           card: 'border-l-red-500/60 bg-gradient-to-br from-red-900/15 to-red-950/35',           dot: 'bg-red-500',     icon: BookOpen },
  // Assessment
  self_assessment:  { pill: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',  card: 'border-l-yellow-500/60 bg-gradient-to-br from-yellow-900/15 to-yellow-950/35',  dot: 'bg-yellow-400',  icon: Sparkles },
  self_improvements:{ pill: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',  card: 'border-l-purple-500/60 bg-gradient-to-br from-purple-900/20 to-purple-950/40',  dot: 'bg-purple-500',  icon: Sparkles },
  // Context
  project_context:  { pill: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',  card: 'border-l-indigo-500/60 bg-gradient-to-br from-indigo-900/20 to-indigo-950/40',  dot: 'bg-indigo-400',  icon: BookOpen },
  user_prefs:       { pill: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',        card: 'border-l-blue-500/60 bg-gradient-to-br from-blue-900/15 to-blue-950/35',        dot: 'bg-blue-400',    icon: User     },
  // Technical
  build:            { pill: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',        card: 'border-l-cyan-500/60 bg-gradient-to-br from-cyan-900/15 to-cyan-950/35',        dot: 'bg-cyan-500',    icon: Zap      },
  database:         { pill: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',  card: 'border-l-yellow-500/60 bg-gradient-to-br from-yellow-900/15 to-yellow-950/30',  dot: 'bg-yellow-400',  icon: Zap      },
  design:           { pill: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',        card: 'border-l-rose-500/60 bg-gradient-to-br from-rose-900/15 to-rose-950/35',        dot: 'bg-rose-400',    icon: Sparkles },
  infrastructure:   { pill: 'bg-zinc-500/20 text-zinc-300 border border-zinc-500/30',        card: 'border-l-zinc-500/60 bg-gradient-to-br from-zinc-800/20 to-zinc-900/40',        dot: 'bg-zinc-400',    icon: Shield   },
  providers:        { pill: 'bg-violet-500/20 text-violet-300 border border-violet-500/30',  card: 'border-l-violet-500/60 bg-gradient-to-br from-violet-900/15 to-violet-950/35',  dot: 'bg-violet-500',  icon: Zap      },
  // People
  contact:          { pill: 'bg-pink-500/20 text-pink-300 border border-pink-500/30',        card: 'border-l-pink-500/60 bg-gradient-to-br from-pink-900/15 to-pink-950/35',        dot: 'bg-pink-400',    icon: User     },
  user:             { pill: 'bg-sky-500/20 text-sky-300 border border-sky-500/30',           card: 'border-l-sky-500/60 bg-gradient-to-br from-sky-900/15 to-sky-950/35',           dot: 'bg-sky-400',     icon: User     },
  // Vision/history
  vision:           { pill: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',card:'border-l-emerald-500/60 bg-gradient-to-br from-emerald-900/15 to-emerald-950/35',dot: 'bg-emerald-500', icon: Sparkles },
  history:          { pill: 'bg-slate-500/20 text-slate-300 border border-slate-500/30',     card: 'border-l-slate-500/60 bg-gradient-to-br from-slate-800/20 to-slate-900/40',     dot: 'bg-slate-400',   icon: BookOpen },
}

// Hash-based color for unknown categories — deterministic, never default
const HASH_COLORS = [
  { pill: 'bg-pink-500/20 text-pink-300 border border-pink-500/30',     card: 'border-l-pink-500/60 bg-gradient-to-br from-pink-900/15 to-pink-950/30',     dot: 'bg-pink-400',    icon: BookOpen as LucideIcon },
  { pill: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',     card: 'border-l-cyan-500/60 bg-gradient-to-br from-cyan-900/15 to-cyan-950/30',     dot: 'bg-cyan-400',    icon: Zap as LucideIcon      },
  { pill: 'bg-lime-500/20 text-lime-300 border border-lime-500/30',     card: 'border-l-lime-500/60 bg-gradient-to-br from-lime-900/15 to-lime-950/30',     dot: 'bg-lime-400',    icon: Sparkles as LucideIcon },
  { pill: 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30', card: 'border-l-fuchsia-500/60 bg-gradient-to-br from-fuchsia-900/15 to-fuchsia-950/30', dot: 'bg-fuchsia-400', icon: Brain as LucideIcon },
  { pill: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',     card: 'border-l-rose-500/60 bg-gradient-to-br from-rose-900/15 to-rose-950/30',     dot: 'bg-rose-400',    icon: Shield as LucideIcon   },
  { pill: 'bg-teal-500/20 text-teal-300 border border-teal-500/30',     card: 'border-l-teal-500/60 bg-gradient-to-br from-teal-900/15 to-teal-950/30',     dot: 'bg-teal-400',    icon: RefreshCw as LucideIcon },
  { pill: 'bg-violet-500/20 text-violet-300 border border-violet-500/30',card: 'border-l-violet-500/60 bg-gradient-to-br from-violet-900/15 to-violet-950/30',dot: 'bg-violet-400', icon: Sparkles as LucideIcon },
]

function hashColor(category: string): typeof HASH_COLORS[0] {
  let h = 0
  for (let i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) & 0xffffff
  return HASH_COLORS[Math.abs(h) % HASH_COLORS.length]
}

const DEFAULT_STYLE = {
  pill: 'bg-slate-500/20 text-slate-300 border border-slate-500/30',
  card: 'border-l-slate-500/60 bg-gradient-to-br from-slate-800/20 to-slate-900/40',
  dot: 'bg-slate-500',
  icon: BookOpen as LucideIcon,
}

function getUserStyle(category: string) {
  if (USER_CATEGORY_STYLES[category]) return USER_CATEGORY_STYLES[category]
  const hc = hashColor(category)
  return { ...hc, label: category.replace(/_/g, ' ') }
}
function getSelfStyle(category: string) {
  if (SELF_CATEGORY_STYLES[category]) return SELF_CATEGORY_STYLES[category]
  return { ...hashColor(category), ...DEFAULT_STYLE }
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

// ── Main component ─────────────────────────────────────────────────────────
export function MemoryTab() {
  const [tab, setTab] = useState<'user' | 'sparkie'>('user')
  const [userMemories, setUserMemories] = useState<UserMemoryEntry[]>([])
  const [selfMemories, setSelfMemories] = useState<SelfMemoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [sessionCount, setSessionCount] = useState(0)
  const [forgetting, setForgetting] = useState<Set<number>>(new Set())
  const [forgotten, setForgotten] = useState<Set<number>>(new Set())

  const loadUserMemories = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/memory?limit=80&includeCategory=true')
      const data = await res.json() as { memories?: UserMemoryEntry[] }
      setUserMemories(data.memories || [])
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  const loadSelfMemories = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/sparkie-self-memory?limit=80')
      const data = await res.json() as { memories: SelfMemoryEntry[] }
      setSelfMemories(data.memories || [])
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  const load = useCallback(() => {
    if (tab === 'user') loadUserMemories()
    else loadSelfMemories()
    setFilter('all')
    setSearch('')
  }, [tab, loadUserMemories, loadSelfMemories])

  useEffect(() => { load() }, [load])

  // Auto-refresh after agent loop + track session memory count
  useEffect(() => {
    let sessionAdded = 0
    const handler = (e: Event) => {
      const trace = (e as CustomEvent<{ status: string }>).detail
      if (trace?.status === 'done') {
        sessionAdded++
        setSessionCount(sessionAdded)
        setTimeout(() => load(), 2000)
      }
    }
    window.addEventListener('sparkie_step_trace', handler)
    return () => window.removeEventListener('sparkie_step_trace', handler)
  }, [load])

  const forgetSelf = async (id: number) => {
    setForgetting(prev => new Set(prev).add(id))
    try {
      await fetch('/api/sparkie-self-memory', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      setForgotten(prev => new Set(prev).add(id))
      setTimeout(() => {
        setSelfMemories(prev => prev.filter(m => m.id !== id))
        setForgotten(prev => { const s = new Set(prev); s.delete(id); return s })
      }, 1200)
    } catch { /* silent */ } finally {
      setForgetting(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const forgetUser = async (id: number) => {
    setForgetting(prev => new Set(prev).add(id))
    try {
      await fetch('/api/memory', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      setForgotten(prev => new Set(prev).add(id))
      setTimeout(() => {
        setUserMemories(prev => prev.filter(m => m.id !== id))
        setForgotten(prev => { const s = new Set(prev); s.delete(id); return s })
      }, 1200)
    } catch { /* silent */ } finally {
      setForgetting(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const activeMemories = tab === 'user' ? userMemories : selfMemories
  const categories = ['all', ...Array.from(new Set(activeMemories.map(m => m.category))).sort()]
  const recentlyLearned = [...activeMemories].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5)
  const searchFiltered = search.trim()
    ? activeMemories.filter(m => m.content.toLowerCase().includes(search.toLowerCase()) || m.category.toLowerCase().includes(search.toLowerCase()))
    : activeMemories
  const visible = filter === 'all' ? searchFiltered : searchFiltered.filter(m => m.category === filter)

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-purple-500/20 flex items-center justify-center">
            <Brain size={11} className="text-purple-400" />
          </div>
          <span className="text-xs font-semibold text-text-primary">Memory</span>
          <span className="text-[10px] text-text-muted bg-hive-hover px-1.5 py-0.5 rounded-full">{activeMemories.length}</span>
          {sessionCount > 0 && (
            <span className="text-[9px] bg-purple-500/25 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded-full font-medium">
              +{sessionCount} this session
            </span>
          )}
        </div>
        <button onClick={load} className="p-1 rounded hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors" title="Refresh">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tab switcher — Michael vs Sparkie */}
      <div className="flex gap-1 px-3 pb-2 shrink-0">
        <button
          onClick={() => setTab('user')}
          className={`flex-1 text-[10px] py-1 rounded-md border transition-colors font-medium ${
            tab === 'user'
              ? 'bg-gradient-to-r from-purple-600/30 to-indigo-600/30 text-purple-200 border-purple-500/40'
              : 'bg-hive-hover text-text-muted border-transparent hover:border-purple-500/30'
          }`}
        >
          About Michael
        </button>
        <button
          onClick={() => setTab('sparkie')}
          className={`flex-1 text-[10px] py-1 rounded-md border transition-colors font-medium ${
            tab === 'sparkie'
              ? 'bg-gradient-to-r from-blue-600/30 to-purple-600/30 text-blue-200 border-blue-500/40'
              : 'bg-hive-hover text-text-muted border-transparent hover:border-blue-500/30'
          }`}
        >
          Sparkie's Memory
        </button>
      </div>

      {/* Search bar */}
      <div className="px-3 pb-2 shrink-0">
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-hive-elevated border border-hive-border">
          <Search size={10} className="text-text-muted shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search memories..."
            className="flex-1 bg-transparent text-[10px] text-text-secondary placeholder:text-text-muted outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-[9px] text-text-muted hover:text-text-secondary">✕</button>
          )}
        </div>
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

      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw size={14} className="animate-spin text-text-muted" />
          </div>
        )}

        {/* Recently learned section — shown when no search/filter active */}
        {!loading && !search && filter === 'all' && recentlyLearned.length > 0 && (
          <div className="mb-1">
            <div className="flex items-center gap-1.5 mb-1.5 px-0.5">
              <Sparkles size={9} className="text-purple-400" />
              <span className="text-[9px] font-semibold text-purple-300 uppercase tracking-wider">Recently learned</span>
            </div>
            <div className="space-y-1.5">
              {recentlyLearned.map(m =>
                tab === 'user'
                  ? <UserMemoryCard key={`recent-${m.id}`} m={m as UserMemoryEntry} onForget={forgetUser} forgetting={forgetting.has(m.id)} forgotten={forgotten.has(m.id)} />
                  : <SelfMemoryCard key={`recent-${m.id}`} m={m as SelfMemoryEntry} onForget={forgetSelf} forgetting={forgetting.has(m.id)} forgotten={forgotten.has(m.id)} />
              )}
            </div>
            <div className="h-px bg-hive-border/60 my-2" />
            <p className="text-[9px] text-text-muted px-0.5 mb-1.5">All memories ({activeMemories.length})</p>
          </div>
        )}

        {!loading && activeMemories.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted">
            {/* CSS neuron illustration */}
            <div className="relative w-10 h-10 mb-3">
              <div className="absolute left-1 top-2 w-2 h-2 rounded-full bg-purple-500/30" />
              <div className="absolute left-4 top-0 w-2 h-2 rounded-full bg-purple-400/40" />
              <div className="absolute left-3 top-5 w-2 h-2 rounded-full bg-purple-500/20" />
              <div className="absolute left-0.5 top-1 w-3 h-px bg-purple-500/25" style={{ transform: 'rotate(-30deg)', transformOrigin: 'left center' }} />
              <div className="absolute left-2 top-3 w-3 h-px bg-purple-500/20" style={{ transform: 'rotate(20deg)', transformOrigin: 'left center' }} />
            </div>
            <p className="text-xs font-medium text-text-secondary mb-1">
              {tab === 'user' ? 'No memories about Michael yet' : 'No Sparkie memories yet'}
            </p>
            <p className="text-[11px] text-center">
              {tab === 'user' ? 'Saved with save_user_memory' : 'Built as Sparkie works'}
            </p>
          </div>
        )}

        {!loading && tab === 'user' && (visible as UserMemoryEntry[]).map(m => (
          <UserMemoryCard key={m.id} m={m}
            onForget={forgetUser}
            forgetting={forgetting.has(m.id)}
            forgotten={forgotten.has(m.id)} />
        ))}

        {!loading && tab === 'sparkie' && (visible as SelfMemoryEntry[]).map(m => (
          <SelfMemoryCard key={m.id} m={m}
            onForget={forgetSelf}
            forgetting={forgetting.has(m.id)}
            forgotten={forgotten.has(m.id)} />
        ))}
      </div>
    </div>
  )
}

const TRUNCATE_LEN = 150

// ── User memory card ───────────────────────────────────────────────────────
function UserMemoryCard({ m, onForget, forgetting, forgotten }: {
  m: UserMemoryEntry; onForget: (id: number) => void; forgetting: boolean; forgotten: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const style = getUserStyle(m.category)
  const Icon = style.icon
  const label = 'label' in style ? (style as { label: string }).label : m.category.replace(/_/g, ' ')
  const isLong = m.content.length > TRUNCATE_LEN
  const displayContent = isLong && !expanded ? m.content.slice(0, TRUNCATE_LEN) + '…' : m.content

  return (
    <div className={`relative rounded-xl border-l-2 p-3 transition-all duration-500 ${style.card} ${forgotten ? 'opacity-30 scale-95' : 'opacity-100'}`}>
      <button onClick={() => onForget(m.id)} disabled={forgetting || forgotten}
        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/40 border border-white/5 flex items-center justify-center text-text-muted hover:text-red-400 hover:border-red-500/30 transition-colors"
        title="Forget this">
        {forgetting ? <RefreshCw size={9} className="animate-spin" /> : <Trash2 size={9} />}
      </button>
      {forgotten && <div className="absolute inset-0 flex items-center pointer-events-none px-3"><div className="w-full h-px bg-white/30" /></div>}
      <div className="flex items-start gap-2 pr-6">
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${style.dot === 'bg-purple-500' ? 'bg-purple-600/25' : style.dot === 'bg-indigo-400' ? 'bg-indigo-600/25' : style.dot === 'bg-amber-500' ? 'bg-amber-600/25' : 'bg-blue-600/25'}`}>
          <Icon size={11} className={style.dot === 'bg-purple-500' ? 'text-purple-300' : style.dot === 'bg-indigo-400' ? 'text-indigo-300' : style.dot === 'bg-amber-500' ? 'text-amber-300' : 'text-blue-300'} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs text-text-secondary leading-relaxed break-words ${forgotten ? 'line-through decoration-white/40' : ''}`}>{displayContent}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${style.pill}`}>{label}</span>
            <span className="text-[9px] text-text-muted flex items-center gap-0.5">
              <Clock size={8} />{formatDate(m.created_at)}
            </span>
            {isLong && (
              <button onClick={() => setExpanded(v => !v)} className="text-[9px] text-purple-400 hover:text-purple-300 transition-colors">
                {expanded ? 'collapse' : `+${m.content.length - TRUNCATE_LEN} more`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sparkie self-memory card ───────────────────────────────────────────────
function SelfMemoryCard({ m, onForget, forgetting, forgotten }: {
  m: SelfMemoryEntry; onForget: (id: number) => void; forgetting: boolean; forgotten: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const style = getSelfStyle(m.category)
  const Icon = style.icon
  const ttl = ttlLabel(m.expires_at, m.stale_flagged)
  const isLong = m.content.length > TRUNCATE_LEN
  const displayContent = isLong && !expanded ? m.content.slice(0, TRUNCATE_LEN) + '…' : m.content

  return (
    <div className={`relative rounded-xl border-l-2 p-3 transition-all duration-500 ${style.card} ${forgotten ? 'opacity-30 scale-95' : 'opacity-100'}`}>
      <button onClick={() => onForget(m.id)} disabled={forgetting || forgotten}
        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/40 border border-white/5 flex items-center justify-center text-text-muted hover:text-red-400 hover:border-red-500/30 transition-colors"
        title="Forget this">
        {forgetting ? <RefreshCw size={9} className="animate-spin" /> : <Trash2 size={9} />}
      </button>
      {forgotten && <div className="absolute inset-0 flex items-center pointer-events-none px-3"><div className="w-full h-px bg-white/30" /></div>}
      <div className="flex items-start gap-2 pr-6">
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${m.category === 'work_rule' ? 'bg-purple-600/25' : m.category === 'self' ? 'bg-blue-600/25' : 'bg-slate-600/25'}`}>
          <Icon size={11} className={m.category === 'work_rule' ? 'text-purple-300' : m.category === 'self' ? 'text-blue-300' : m.category === 'api_behavior' ? 'text-amber-300' : 'text-slate-300'} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs text-text-secondary leading-relaxed break-words ${forgotten ? 'line-through decoration-white/40' : ''}`}>{displayContent}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${style.pill}`}>{m.category.replace(/_/g, ' ')}</span>
            <span className="text-[9px] text-text-muted flex items-center gap-0.5"><Clock size={8} />{formatDate(m.created_at)}</span>
            {ttl && <span className={`text-[9px] ${ttl.cls}`}>{ttl.label}</span>}
            {isLong && (
              <button onClick={() => setExpanded(v => !v)} className="text-[9px] text-blue-400 hover:text-blue-300 transition-colors">
                {expanded ? 'collapse' : `+${m.content.length - TRUNCATE_LEN} more`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
