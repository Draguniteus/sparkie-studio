'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { CheckCircle2, Clock, Loader2, XCircle, RefreshCw, Calendar, Mail, Zap, StopCircle, HelpCircle, PauseCircle, PlayCircle } from 'lucide-react'

interface SparkieTask {
  id: string
  label: string
  action: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped' | 'cancelled' | 'paused'
  executor: 'ai' | 'human'
  trigger_type: string
  scheduled_at: string | null
  created_at: string
  resolved_at: string | null
  payload: Record<string, unknown>
  why_human?: string
}

const statusConfig = {
  pending:     { icon: Clock,        color: 'text-amber-400',    bg: 'bg-amber-400/10',   label: 'Pending'    },
  in_progress: { icon: Loader2,      color: 'text-blue-400',     bg: 'bg-blue-400/10',    label: 'Running'    },
  completed:   { icon: CheckCircle2, color: 'text-green-400',    bg: 'bg-green-400/10',   label: 'Done'       },
  failed:      { icon: XCircle,      color: 'text-red-400',      bg: 'bg-red-400/10',     label: 'Failed'     },
  skipped:     { icon: XCircle,      color: 'text-zinc-500',     bg: 'bg-zinc-500/10',    label: 'Skipped'    },
  cancelled:   { icon: StopCircle,   color: 'text-orange-400',   bg: 'bg-orange-400/10',  label: 'Stopped'    },
  paused:      { icon: PauseCircle,  color: 'text-violet-400',   bg: 'bg-violet-400/10',  label: 'Paused'     },
}

function actionIcon(action: string) {
  if (action.includes('GMAIL') || action.includes('email')) return <Mail className="w-3 h-3 shrink-0" />
  if (action.includes('CALENDAR') || action.includes('calendar')) return <Calendar className="w-3 h-3 shrink-0" />
  return <Zap className="w-3 h-3 shrink-0" />
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function formatScheduled(dateStr: string | null, cronExpr?: string): string | null {
  if (!dateStr && cronExpr) return `⏰ ${cronExpr}`
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const isTomorrow = d.toDateString() === new Date(now.getTime() + 86400000).toDateString()
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  if (isToday) return `Today ${time}`
  if (isTomorrow) return `Tomorrow ${time}`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` ${time}`
}

export function TaskQueuePanel() {
  const [tasks, setTasks] = useState<SparkieTask[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'ai' | 'human'>('all')
  const [actioning, setActioning] = useState<string | null>(null)
  const [sseConnected, setSseConnected] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sseRef = useRef<EventSource | null>(null)

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks?status=all&limit=30')
      if (res.ok) {
        const data = await res.json()
        setTasks(data.tasks ?? [])
      }
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  // Try SSE first; fall back to polling if SSE unavailable
  useEffect(() => {
    fetchTasks()

    try {
      const es = new EventSource('/api/tasks/stream')
      sseRef.current = es

      es.onopen = () => {
        setSseConnected(true)
        // SSE connected — clear fallback poll if running
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      }

      es.addEventListener('tasks', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)
          if (data.tasks) setTasks(data.tasks)
        } catch { /* ignore */ }
      })

      es.onerror = () => {
        setSseConnected(false)
        es.close()
        // Fall back to polling
        if (!pollRef.current) {
          pollRef.current = setInterval(fetchTasks, 10_000)
        }
      }
    } catch {
      // EventSource not available — use polling
      pollRef.current = setInterval(fetchTasks, 10_000)
    }

    // Fallback poll also starts initially — SSE onopen will clear it if connected
    pollRef.current = setInterval(fetchTasks, 10_000)

    return () => {
      sseRef.current?.close()
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [fetchTasks])

  const handleAction = async (taskId: string, action: 'approved' | 'rejected') => {
    setActioning(taskId)
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, status: action === 'approved' ? 'approved' : 'rejected' }),
      })
      await fetchTasks()
    } finally {
      setActioning(null)
    }
  }

  const handleStop = async (taskId: string) => {
    setActioning(taskId)
    try {
      await fetch(`/api/tasks?id=${taskId}`, { method: 'DELETE' })
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'cancelled' } : t))
    } finally {
      setActioning(null)
    }
  }

  const handlePauseResume = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'paused' ? 'pending' : 'paused'
    setActioning(taskId)
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, status: newStatus }),
      })
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus as SparkieTask['status'] } : t))
    } finally {
      setActioning(null)
    }
  }

  const filtered = tasks.filter(t => {
    if (filter === 'pending') return t.status === 'pending'
    if (filter === 'ai') return t.executor === 'ai'
    if (filter === 'human') return t.executor === 'human'
    return true
  })

  const pendingCount = tasks.filter(t => t.status === 'pending' && t.executor === 'human').length
  const runningCount = tasks.filter(t => t.status === 'in_progress').length
  const pausedCount = tasks.filter(t => t.status === 'paused').length

  return (
    <div className="flex flex-col h-full bg-bg-primary text-text-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-primary shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-text-primary">Agent Tasks</span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {pendingCount} pending
            </span>
          )}
          {runningCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              {runningCount} running
            </span>
          )}
          {pausedCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/20 text-violet-400 border border-violet-500/30 flex items-center gap-1">
              <PauseCircle className="w-2.5 h-2.5" />
              {pausedCount} paused
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${sseConnected ? 'bg-green-500/80 animate-pulse' : 'bg-amber-500/60'}`}
            title={sseConnected ? 'Live — real-time updates' : 'Polling every 10s'}
          />
          <button
            onClick={fetchTasks}
            className="p-1 rounded hover:bg-white/5 text-text-secondary hover:text-text-primary transition-colors"
            title="Refresh now"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-3 py-1.5 border-b border-border-primary shrink-0">
        {(['all', 'pending', 'ai', 'human'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors capitalize ${
              filter === f
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
            }`}
          >
            {f === 'ai' ? 'Sparkie' : f === 'human' ? 'Needs You' : f}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-20 text-text-secondary">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-xs">Loading tasks...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-secondary gap-2 px-4 py-8">
            <CheckCircle2 className="w-5 h-5 text-green-500/40" />
            <span className="text-xs font-medium text-text-secondary">All clear</span>
            <p className="text-[10px] text-text-muted text-center leading-relaxed">
              Tasks appear here when Sparkie queues an action that needs your approval — like sending an email, posting a tweet, or a scheduled job.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border-primary">
            {filtered.map(task => {
              const cfg = statusConfig[task.status] ?? statusConfig.pending
              const Icon = cfg.icon
              const isActioning = actioning === task.id
              const isPendingHuman = task.status === 'pending' && task.executor === 'human'
              const isRunningAI = task.status === 'in_progress' && task.executor === 'ai'
              const isRecurring = task.trigger_type === 'cron' || task.trigger_type === 'recurring'
              const isPaused = task.status === 'paused'
              const scheduledDisplay = formatScheduled(task.scheduled_at, task.trigger_type === 'cron' ? (task.payload as Record<string, unknown>)?.cron_expression as string | undefined : undefined)

              return (
                <div key={task.id} className={`px-3 py-2.5 hover:bg-white/[0.02] transition-colors ${cfg.bg}`}>
                  <div className="flex items-start gap-2">
                    <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cfg.color} ${task.status === 'in_progress' ? 'animate-spin' : ''}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {actionIcon(task.action)}
                        <span className="text-xs font-medium text-text-primary leading-tight">{task.label}</span>
                        {task.why_human && (
                          <span title={task.why_human} className="cursor-help text-text-muted">
                            <HelpCircle className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={`text-[10px] font-semibold ${cfg.color}`}>{cfg.label}</span>
                        <span className="text-[10px] text-text-secondary">
                          {task.executor === 'ai' ? '🤖 Sparkie' : '👤 You'}
                        </span>
                        {scheduledDisplay && (
                          <span className="text-[10px] text-blue-400">🕐 {scheduledDisplay}</span>
                        )}
                        <span className="text-[10px] text-text-secondary">{timeAgo(task.created_at)}</span>
                      </div>
                      {isPendingHuman && (
                        <div className="flex gap-1.5 mt-1.5">
                          <button
                            onClick={() => handleAction(task.id, 'approved')}
                            disabled={isActioning}
                            className="px-2 py-0.5 rounded text-[10px] font-semibold bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors disabled:opacity-50"
                          >
                            {isActioning ? '...' : 'Approve'}
                          </button>
                          <button
                            onClick={() => handleAction(task.id, 'rejected')}
                            disabled={isActioning}
                            className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {isRunningAI && (
                        <div className="flex gap-1.5 mt-1.5">
                          <button
                            onClick={() => handleStop(task.id)}
                            disabled={isActioning}
                            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 transition-colors disabled:opacity-50"
                          >
                            <StopCircle className="w-2.5 h-2.5" />
                            {isActioning ? '...' : 'Stop'}
                          </button>
                        </div>
                      )}
                      {(isRecurring && (task.status === 'pending' || isPaused)) && (
                        <div className="flex gap-1.5 mt-1.5">
                          <button
                            onClick={() => handlePauseResume(task.id, task.status)}
                            disabled={!!actioning}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition-colors disabled:opacity-50 ${
                              isPaused
                                ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20'
                                : 'bg-slate-500/10 text-slate-400 border border-slate-500/20 hover:bg-slate-500/20'
                            }`}
                          >
                            {isPaused
                              ? <><PlayCircle className="w-2.5 h-2.5" />{actioning === task.id ? '...' : 'Resume'}</>
                              : <><PauseCircle className="w-2.5 h-2.5" />{actioning === task.id ? '...' : 'Pause'}</>
                            }
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
