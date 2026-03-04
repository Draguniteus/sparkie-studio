"use client"

import { useEffect, useState } from "react"
import type { RealScoreResponse, RealLeg } from "@/app/api/real-score/route"

const LEG_COLORS: Record<string, { bar: string }> = {
  autonomous: { bar: "bg-purple-500" },
  memory:     { bar: "bg-blue-500"   },
  proactive:  { bar: "bg-amber-500"  },
  security:   { bar: "bg-emerald-500" },
}
const TREND_ICON: Record<string, string> = { up: "↑", stable: "→", down: "↓" }
const TREND_COLOR: Record<string, string> = { up: "text-emerald-400", stable: "text-text-muted", down: "text-red-400" }

function LegBar({ leg }: { leg: RealLeg }) {
  const c = LEG_COLORS[leg.id] ?? { bar: "bg-hive-500" }
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-primary font-medium">{leg.label}</span>
          <span className={`text-[10px] font-bold ${TREND_COLOR[leg.trend]}`}>{TREND_ICON[leg.trend]}</span>
        </div>
        <span className="text-xs font-mono font-bold text-text-primary">{leg.score}</span>
      </div>
      <div className="h-1.5 bg-hive-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${c.bar}`} style={{ width: `${leg.score}%` }} />
      </div>
      <p className="text-[10px] text-text-muted leading-tight">{leg.signal}</p>
    </div>
  )
}

function getTotalColor(s: number) { return s >= 80 ? "text-emerald-400" : s >= 60 ? "text-amber-400" : "text-red-400" }
function getTotalLabel(s: number) { return s >= 85 ? "Elite" : s >= 70 ? "Strong" : s >= 55 ? "Building" : s >= 40 ? "Weak" : "Critical" }

export function RealScorePanel() {
  const [data, setData] = useState<RealScoreResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Auto-refresh REAL score after every tool session (sparkie_step_trace 'done' event)
  useEffect(() => {
    const refresh = () => {
      fetch('/api/real-score')
        .then(r => r.ok ? r.json() : null)
        .then((d: RealScoreResponse | null) => { if (d) setData(d) })
        .catch(() => {})
    }
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { status?: string } | null
      if (detail?.status === 'done') setTimeout(refresh, 1500)
    }
    window.addEventListener('sparkie_step_trace', handler)
    return () => window.removeEventListener('sparkie_step_trace', handler)
  }, [])

  useEffect(() => {
    fetch("/api/real-score")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError("Failed to load REAL score"); setLoading(false) })
  }, [])

  if (loading) return (
    <div className="h-full flex items-center justify-center">
      <div className="text-xs text-text-muted animate-pulse">Computing REAL score...</div>
    </div>
  )
  if (error || !data) return (
    <div className="h-full flex items-center justify-center">
      <div className="text-xs text-red-400">{error ?? "No data"}</div>
    </div>
  )

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="text-center space-y-1">
        <div className={`text-5xl font-black tabular-nums ${getTotalColor(data.total)}`}>{data.total}</div>
        <div className="text-xs text-text-muted font-medium uppercase tracking-widest">REAL Score</div>
        <div className={`text-sm font-semibold ${getTotalColor(data.total)}`}>{getTotalLabel(data.total)}</div>
      </div>
      <div className="bg-hive-700 rounded-lg p-2 text-[10px] text-text-muted text-center leading-relaxed border border-hive-border">
        REAL = ∜(Autonomous × Memory × Proactive × Security)<br/>
        <span className="text-text-muted/60">Geometric mean — any weak leg kills the product</span>
      </div>
      <div className="space-y-4">
        {data.legs.map(leg => <LegBar key={leg.id} leg={leg} />)}
      </div>
      <div className="text-[9px] text-text-muted text-center pt-1 border-t border-hive-border">
        Computed {new Date(data.computed_at).toLocaleTimeString()}
      </div>
    </div>
  )
}
