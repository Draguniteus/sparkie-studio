'use client'

import { useState, useEffect, useCallback } from 'react'
import { CheckCircle2, Clock, Loader2, XCircle, RefreshCw, Calendar, Mail, Zap } from 'lucide-react'

interface SparkieTask {
  id: string
  label: string
  action: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'
  executor: 'ai' | 'human'
  trigger_type: string
  scheduled_at: string | null
  created_at: string
  resolved_at: string | null
  payload: Record<string, unknown>
}

const statusConfig = {
  pending:     { icon: Clock,       color: 'text-amber-400',    bg: 'bg-amber-400/10',  label: 'Pending'     },
  in_progress: { icon: Loader2,     color: 'text-blue-400',     bg: 'bg-blue-400/10',   label: 'Running'     },
  completed:   { icon: CheckCircle2,color: 'text-green-400',    bg: 'bg-green-400/10',  label: 'Done'        },
  failed:      { icon: XCircle,     color: 'text-red-400',      bg: 'bg-red-400/10',    label: 'Failed'      },
  skipped:     { icon: XCircle,     color: 'text-zinc-500',     bg: 'bg-zinc-500/10',   label: 'Skipped'     },
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

function formatScheduled(dateStr: string | null): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const isTomorrow = d.toDateString() === new Date(now.getTime() + 86400000).toDateString()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (isToday) return `Today ${time}`
  if (isTomorrow) return `Tomorrow ${time}`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` ${time}`
}

export function TaskQueuePanel() {
  const [tasks, setTasks] = useState<SparkieTask[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'ai' | 'human'>('all')
  const [actioning, setActioning] = useState<string | null>(null)

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

  useEffect(() => { fetchTasks() }, [fetchTasks])

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

  const filtered = tasks.filter(t => {
    if (filter === 'pending') return t.status === 'pending'
    if (filter === 'ai') return t.executor === 'ai'
    if (filter === 'human') return t.executor === 'human'
    return true
  })

  const pendingCount = tasks.filter(t => t.status === 'pending' && t.executor === 'human').length

  return (
    <div className="flex flex-col h-full bg-bg-primary text-text-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-primary shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-text-primary">Task Queue</span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {pendingCount} pending
            </span>
          )}
        </div>
        <button
          onClick={fetchTasks}
          className="p-1 rounded hover:bg-white/5 text-text-secondary hover:text-text-primary transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
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
          <div className="flex flex-col items-center justify-center h-24 text-text-secondary gap-1">
            <CheckCircle2 className="w-5 h-5 text-green-500/50" />
            <span className="text-xs">No tasks here</span>
          </div>
        ) : (
          <div className="divide-y divide-border-primary">
            {filtered.map(task => {
              const cfg = statusConfig[task.status] ?? statusConfig.pending
              const Icon = cfg.icon
              const isActioning = actioning === task.id
              const isPendingHuman = task.status === 'pending' && task.executor === 'human'
              const scheduledDisplay = formatScheduled(task.scheduled_at)

              return (
                <div key={task.id} className={`px-3 py-2.5 hover:bg-white/[0.02] transition-colors ${cfg.bg}`}>
                  <div className="flex items-start gap-2">
                    <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cfg.color} ${task.status === 'in_progress' ? 'animate-spin' : ''}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {actionIcon(task.action)}
                        <span className="text-xs font-medium text-text-primary leading-tight">{task.label}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={`text-[10px] font-semibold ${cfg.color}`}>{cfg.label}</span>
                        <span className="text-[10px] text-text-secondary">
                          {task.executor === 'ai' ? '⚡ Sparkie' : '👤 You'}
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
