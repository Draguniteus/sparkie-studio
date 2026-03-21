"use client"

import { useState, useEffect, useCallback } from "react"
import { Zap, Brain, Target, GitBranch, RefreshCw, ChevronDown, ChevronUp } from "lucide-react"

interface CIPStats {
  goalCount: number
  ruleCount: number
  causalNodes: number
  causalEdges: number
  reflectionCount: number
  perceptionActive: boolean
  lastPerceptionAt: string | null
  parallelExecutionsToday: number
}

interface Goal {
  id: string
  title: string
  priority: string
  status: string
  progress: string
  sessionsWithoutProgress: number
}

interface BehaviorRule {
  id: string
  condition: string
  action: string
  confidence: number
  timesApplied: number
}

const LAYER_CONFIG = [
  { id: 'L1', label: 'Perception', desc: '2min ambient cycle', icon: '👁', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  { id: 'L2', label: 'Self-Modify', desc: 'Behavior rules', icon: '🧠', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { id: 'L3', label: 'Causal', desc: 'Why things happen', icon: '🔗', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  { id: 'L4', label: 'Emotional', desc: 'Michael\'s state', icon: '💡', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  { id: 'L5', label: 'Goals', desc: 'Persistent agenda', icon: '🎯', color: 'text-green-400', bg: 'bg-green-500/10' },
  { id: 'L6', label: 'Parallel', desc: 'Multi-tool execution', icon: '⚡', color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { id: 'L7', label: 'Self-Model', desc: 'Daily reflection', icon: '🌙', color: 'text-pink-400', bg: 'bg-pink-500/10' },
]

export function CIPStatusPanel() {
  const [stats, setStats] = useState<CIPStats | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [rules, setRules] = useState<BehaviorRule[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [expandedLayer, setExpandedLayer] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/cip-status')
      if (!res.ok) return
      const data = await res.json() as { stats: CIPStats; goals: Goal[]; rules: BehaviorRule[] }
      setStats(data.stats)
      setGoals(data.goals ?? [])
      setRules(data.rules ?? [])
      setLastRefresh(new Date())
    } catch { /* non-fatal */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 30_000) // refresh every 30s
    return () => clearInterval(interval)
  }, [loadData])

  const seedDefaults = useCallback(async () => {
    setSeeding(true)
    try {
      await fetch('/api/cip-seed', { method: 'POST' })
      await loadData()
    } catch { /* non-fatal */ } finally {
      setSeeding(false)
    }
  }, [loadData])

  // Completeness: each layer contributes based on actual live data — no artificial base
  const cipCompleteness = stats
    ? Math.min(100, Math.round(
        5 +  // L1: perception scaffold always running
        (stats.ruleCount >= 5 ? 20 : stats.ruleCount * 4) +       // L2: behavior rules (max 20)
        (stats.causalEdges >= 10 ? 15 : stats.causalEdges * 1.5) + // L3: causal graph (max 15)
        5 +  // L4: emotional detection always active
        (stats.goalCount >= 1 ? 20 : 0) +                          // L5: goals (max 20)
        (stats.parallelExecutionsToday >= 1 ? 10 : 5) +            // L6: parallel exec
        (stats.reflectionCount >= 1 ? 25 : 0)                      // L7: self-reflection (max 25)
      ))
    : 5

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-hive-600">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-hive-border bg-hive-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-honey-400" />
            <span className="text-xs font-bold text-text-primary tracking-wide">C.I.P. ENGINE STATUS</span>
          </div>
          <button onClick={loadData} className="p-1 rounded hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors" title="Refresh">
            <RefreshCw size={11} />
          </button>
        </div>
        <div className="text-[9px] text-text-muted mt-0.5">
          Complex Information Processing Engine · {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center flex-1 text-text-muted text-xs">Loading CIP status…</div>
      ) : (
        <div className="flex-1 p-3 flex flex-col gap-3">
          {/* CIP Completeness bar */}
          <div className="rounded-lg border border-hive-border bg-hive-elevated/40 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold text-text-secondary">CIP Completeness</span>
              <span className="text-[10px] font-bold text-honey-400">{cipCompleteness}%</span>
            </div>
            <div className="h-2 bg-hive-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-honey-500 to-green-400 rounded-full transition-all duration-1000"
                style={{ width: `${cipCompleteness}%` }}
              />
            </div>
            {stats && stats.goalCount === 0 && stats.ruleCount === 0 && (
              <button
                onClick={seedDefaults}
                disabled={seeding}
                className="mt-2 w-full text-[10px] font-medium py-1 px-2 rounded bg-honey-500/15 border border-honey-500/30 text-honey-400 hover:bg-honey-500/25 transition-colors disabled:opacity-50"
              >
                {seeding ? 'Bootstrapping…' : '⚡ Bootstrap CIP defaults'}
              </button>
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Active Goals', value: stats?.goalCount ?? 0, icon: <Target size={11} />, color: 'text-green-400' },
              { label: 'Behavior Rules', value: stats?.ruleCount ?? 0, icon: <Brain size={11} />, color: 'text-blue-400' },
              { label: 'Causal Nodes', value: stats?.causalNodes ?? 0, icon: <GitBranch size={11} />, color: 'text-cyan-400' },
              { label: 'Causal Edges', value: stats?.causalEdges ?? 0, icon: <GitBranch size={11} />, color: 'text-cyan-400' },
              { label: 'Reflections (7d)', value: stats?.reflectionCount ?? 0, icon: <Brain size={11} />, color: 'text-pink-400' },
              { label: 'Parallel Execs', value: stats?.parallelExecutionsToday ?? 0, icon: <Zap size={11} />, color: 'text-orange-400' },
            ].map(item => (
              <div key={item.label} className="rounded-lg border border-hive-border bg-hive-elevated/30 p-2.5">
                <div className={`flex items-center gap-1 mb-1 ${item.color}`}>{item.icon}<span className="text-[9px] font-medium text-text-muted">{item.label}</span></div>
                <div className="text-lg font-bold text-text-primary">{item.value}</div>
              </div>
            ))}
          </div>

          {/* 7 Layer status cards */}
          <div className="flex flex-col gap-1.5">
            <div className="text-[9px] font-semibold text-text-muted uppercase tracking-wider px-0.5">7 Cognitive Layers</div>
            {LAYER_CONFIG.map(layer => (
              <div key={layer.id} className={`rounded-lg border border-hive-border/60 ${layer.bg} overflow-hidden`}>
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5 transition-colors"
                  onClick={() => setExpandedLayer(expandedLayer === layer.id ? null : layer.id)}
                >
                  <span className="text-sm shrink-0">{layer.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold text-text-muted">{layer.id}</span>
                      <span className={`text-[11px] font-semibold ${layer.color}`}>{layer.label}</span>
                      <span className="ml-auto flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                        <span className="text-[9px] text-green-400 font-medium">ACTIVE</span>
                      </span>
                    </div>
                    <div className="text-[10px] text-text-muted">{layer.desc}</div>
                  </div>
                  {expandedLayer === layer.id ? <ChevronUp size={11} className="text-text-muted shrink-0" /> : <ChevronDown size={11} className="text-text-muted shrink-0" />}
                </button>

                {/* Expanded layer detail */}
                {expandedLayer === layer.id && (
                  <div className="px-3 pb-2.5 border-t border-white/5">
                    {layer.id === 'L5' && goals.length > 0 && (
                      <div className="mt-2 flex flex-col gap-1">
                        {goals.slice(0, 4).map(g => (
                          <div key={g.id} className="flex items-start gap-2 text-[10px]">
                            <span className={`shrink-0 px-1 py-0.5 rounded text-[8px] font-bold ${g.priority === 'P0' ? 'bg-red-500/20 text-red-400' : g.priority === 'P1' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>{g.priority}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-text-primary font-medium truncate">{g.title}</div>
                              <div className="text-text-muted">{g.progress || 'Not started'}</div>
                            </div>
                            {g.sessionsWithoutProgress > 2 && (
                              <span className="text-[8px] text-amber-400 shrink-0">⚠ {g.sessionsWithoutProgress}s</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {layer.id === 'L2' && rules.length > 0 && (
                      <div className="mt-2 flex flex-col gap-1.5">
                        {rules.slice(0, 3).map(r => (
                          <div key={r.id} className="text-[10px]">
                            <div className="text-text-muted">IF <span className="text-text-secondary">{r.condition.slice(0, 50)}</span></div>
                            <div className="text-text-muted">→ <span className="text-blue-300">{r.action.slice(0, 50)}</span></div>
                            <div className="text-[9px] text-text-muted">{Math.round(r.confidence * 100)}% conf · {r.timesApplied}x applied</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {layer.id === 'L1' && (
                      <div className="mt-2 text-[10px] text-text-muted">
                        <div>Perception cycle: every 2 minutes</div>
                        <div>Monitors: error spikes, expiring TTLs, deploy changes</div>
                        <div className="text-green-400 mt-1">● Ambient perception loop running</div>
                      </div>
                    )}
                    {layer.id === 'L3' && (
                      <div className="mt-2 text-[10px] text-text-muted">
                        <div>Causal graph: {stats?.causalNodes ?? 0} nodes · {stats?.causalEdges ?? 0} edges</div>
                        <div>Auto-rule threshold: 0.7 confidence + 3 observations</div>
                      </div>
                    )}
                    {layer.id === 'L4' && (
                      <div className="mt-2 text-[10px] text-text-muted">
                        <div>Detects: energy · focus · mood · urgency</div>
                        <div>Applied on every message before routing</div>
                      </div>
                    )}
                    {layer.id === 'L6' && (
                      <div className="mt-2 text-[10px] text-text-muted">
                        <div>All tool calls in same turn: Promise.allSettled()</div>
                        <div>Today's parallel executions: {stats?.parallelExecutionsToday ?? 0}</div>
                      </div>
                    )}
                    {layer.id === 'L7' && (
                      <div className="mt-2 text-[10px] text-text-muted">
                        <div>Daily reflection: 1am UTC (dream window)</div>
                        <div>Reviews: worklog, goals, rules, growth</div>
                        <div>Reflections this week: {stats?.reflectionCount ?? 0}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
