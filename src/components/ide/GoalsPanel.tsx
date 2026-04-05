'use client'

import { useState, useEffect } from 'react'
import { Target, Clock, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Plus, RefreshCw } from 'lucide-react'

interface Goal {
  id: string
  title: string
  description: string
  type: string
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  status: 'active' | 'blocked' | 'completed' | 'abandoned'
  progress: string
  successCriteria: string
  sessionsWithoutProgress: number
  createdAt: string
  lastChecked: string | null
}

const PRIORITY_COLORS: Record<string, string> = {
  P0: 'bg-red-500/20 text-red-400 border-red-500/40',
  P1: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  P2: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  P3: 'bg-slate-500/20 text-slate-400 border-slate-500/40',
}

const TYPE_ICONS: Record<string, string> = {
  fix: '🔧', build: '🏗️', monitor: '📡', learn: '📚', relationship: '💬', default: '🎯',
}

export function GoalsPanel() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('active')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [newGoal, setNewGoal] = useState('')
  const [adding, setAdding] = useState(false)

  async function loadGoals() {
    setLoading(true)
    try {
      const params = filter !== 'all' ? `?status=${filter}` : ''
      const res = await fetch(`/api/goals${params}`)
      if (res.ok) {
        const data = await res.json()
        setGoals(data.goals ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadGoals() }, [filter])

  async function addGoal() {
    if (!newGoal.trim()) return
    setAdding(true)
    try {
      await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newGoal.trim(), type: 'monitor', priority: 'P2' }),
      })
      setNewGoal('')
      await loadGoals()
    } finally {
      setAdding(false)
    }
  }

  async function completeGoal(id: string) {
    await fetch('/api/goals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'completed' }),
    })
    await loadGoals()
  }

  async function attemptFixGoal(id: string) {
    // Call check_goal_progress to diagnose and attempt self-fix
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Please run the check_goal_progress tool to check if our memory tools (read_memory, list_memories) are working correctly, and if there are any issues with the sparkie_self_memory table, fix them. Report what you find.' }],
          topicId: 'system-goal-fix',
          stream: false,
        }),
      })
      if (res.ok) {
        // Goal was likely fixed — mark complete
        await completeGoal(id)
        return
      }
    } catch { /* fall through to refresh */ }
    // Refresh to show current state
    await loadGoals()
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-hive-border">
        <Target size={14} className="text-honey-400 shrink-0" />
        <span className="text-xs font-bold text-honey-400 uppercase tracking-wider">Goals</span>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setFilter(f => f === 'active' ? 'all' : f === 'all' ? 'completed' : 'active')}
            className="text-[10px] px-2 py-0.5 rounded-full border border-hive-border text-text-muted hover:text-text-secondary transition-colors">
            {filter === 'active' ? 'Active' : filter === 'all' ? 'All' : 'Done'}
          </button>
          <button onClick={loadGoals} className="p-1 rounded hover:bg-hive-hover text-text-muted hover:text-honey-400 transition-colors">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Add goal */}
      <div className="flex gap-2 px-4 py-2 border-b border-hive-border/50">
        <input
          value={newGoal}
          onChange={e => setNewGoal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addGoal()}
          placeholder="Add a new goal..."
          className="flex-1 text-xs bg-hive-elevated border border-hive-border rounded-lg px-3 py-1.5 text-text-secondary placeholder:text-text-muted focus:outline-none focus:border-honey-500/40"
        />
        <button
          onClick={addGoal}
          disabled={adding || !newGoal.trim()}
          className="px-3 py-1.5 rounded-lg bg-honey-500/15 border border-honey-500/30 text-honey-400 text-xs font-semibold hover:bg-honey-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Goals list */}
      <div className="flex-1 overflow-y-auto">
        {loading && goals.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-text-muted text-xs">Loading...</div>
        ) : goals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 gap-3">
            {/* CSS bullseye illustration */}
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 rounded-full border-2 border-purple-500/20" />
              <div className="absolute inset-2 rounded-full border-2 border-purple-500/15" />
              <div className="absolute inset-4 rounded-full bg-purple-500/10 border border-purple-500/20" />
              <div className="absolute inset-6 rounded-full bg-purple-500/5" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-purple-400/60 text-sm">◎</span>
              </div>
            </div>
            <div className="text-center">
              <p className="text-xs text-text-muted">No active goals</p>
              <p className="text-[10px] text-text-muted/60 mt-0.5">Sparkie creates goals as she works</p>
            </div>
          </div>
        ) : (
          goals.map(goal => (
            <div key={goal.id} className="border-b border-hive-border/30 last:border-b-0">
              <div
                className="flex items-start gap-2 px-4 py-3 hover:bg-white/[0.02] transition-colors cursor-pointer"
                onClick={() => toggleExpand(goal.id)}
              >
                <div className="mt-0.5 text-base shrink-0">{TYPE_ICONS[goal.type] ?? TYPE_ICONS.default}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-bold ${PRIORITY_COLORS[goal.priority] ?? PRIORITY_COLORS.P2}`}>
                      {goal.priority}
                    </span>
                    <span className="text-xs font-semibold text-text-primary leading-tight">{goal.title}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-text-muted">{goal.progress || 'Not started'}</span>
                    {goal.sessionsWithoutProgress > 0 && (
                      <span className="text-[9px] text-text-muted flex items-center gap-0.5">
                        <Clock size={8} />{goal.sessionsWithoutProgress}s no progress
                      </span>
                    )}
                    {goal.status === 'completed' && (
                      <span className="text-[9px] text-emerald-400 flex items-center gap-0.5">
                        <CheckCircle2 size={8} />Done
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 mt-0.5 text-text-muted">
                  {expanded.has(goal.id) ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </div>
              </div>

              {/* Expanded details */}
              {expanded.has(goal.id) && (
                <div className="px-4 pb-3 pl-10">
                  {goal.description && (
                    <p className="text-[11px] text-text-secondary mb-2 leading-relaxed">{goal.description}</p>
                  )}
                  {goal.successCriteria && (
                    <div className="mb-2">
                      <span className="text-[9px] text-text-muted uppercase tracking-wider font-semibold">Success criteria</span>
                      <p className="text-[11px] text-text-secondary mt-0.5">{goal.successCriteria}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    {goal.status !== 'completed' && (
                      <>
                        {goal.type === 'fix' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); attemptFixGoal(goal.id) }}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 hover:bg-orange-500/25 transition-colors"
                          >
                            Attempt fix
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); completeGoal(goal.id) }}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                        >
                          Mark complete
                        </button>
                      </>
                    )}
                    <span className="text-[9px] text-text-muted">
                      Created {new Date(goal.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
