'use client'

import { useState, useEffect, useCallback } from 'react'
import { Layers, RefreshCw, Loader2, ChevronRight, Archive, Link2, Calendar } from 'lucide-react'

interface Topic {
  id: string
  name: string
  fingerprint?: string
  summary?: string
  notification_policy: string
  status: string
  updated_at: string
}

interface TopicLink {
  id: number
  source_type: string
  source_id: string
  summary?: string
  created_at: string
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (diff < 60000) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${d}d ago`
}

const SOURCE_ICONS: Record<string, string> = {
  email: '📧', task: '⚡', worklog: '📋', calendar: '📅',
}

function TopicDetail({ topic, onBack }: { topic: Topic; onBack: () => void }) {
  const [links, setLinks] = useState<TopicLink[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/topics?id=${topic.id}`)
      .then(r => r.json())
      .then((d: { links?: TopicLink[] }) => { setLinks(d.links ?? []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [topic.id])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-hive-border shrink-0">
        <button onClick={onBack} className="p-1 rounded hover:bg-hive-hover text-text-muted hover:text-text-primary transition-colors">
          <ChevronRight size={12} className="rotate-180" />
        </button>
        <span className="text-xs font-semibold text-text-primary truncate flex-1">{topic.name}</span>
        <span className="text-[9px] text-text-muted shrink-0">{timeAgo(topic.updated_at)}</span>
      </div>

      {topic.summary && (
        <div className="px-3 py-2.5 border-b border-hive-border bg-honey-500/4 shrink-0">
          <p className="text-[11px] text-text-secondary italic leading-relaxed">{topic.summary}</p>
        </div>
      )}

      {topic.fingerprint && (
        <div className="px-3 py-1.5 border-b border-hive-border shrink-0">
          <p className="text-[10px] text-text-muted">Keywords: <span className="text-text-secondary">{topic.fingerprint}</span></p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-2">
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2">Linked Signals</p>
          {loading ? (
            <div className="flex items-center gap-2 text-[11px] text-text-muted"><Loader2 size={10} className="animate-spin" /> Loading...</div>
          ) : links.length === 0 ? (
            <div className="flex flex-col items-center py-6 gap-2">
              <Link2 size={16} className="text-text-muted/40" />
              <p className="text-[11px] text-text-muted">No signals linked yet.</p>
              <p className="text-[10px] text-text-muted/60 text-center">Tell Sparkie to link emails, tasks, or calendar events to this topic.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {links.map(l => (
                <div key={l.id} className="flex items-start gap-2 py-1.5 px-2 rounded-lg hover:bg-hive-hover transition-colors">
                  <span className="text-[11px] shrink-0 mt-0.5">{SOURCE_ICONS[l.source_type] ?? '🔗'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-text-secondary leading-snug">{l.summary ?? l.source_id}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[9px] text-text-muted capitalize">{l.source_type}</span>
                      <span className="text-text-muted/30">·</span>
                      <span className="text-[9px] text-text-muted">{timeAgo(l.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function TopicsPanel() {
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<Topic | null>(null)

  const fetchTopics = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const res = await fetch('/api/topics')
      if (res.ok) {
        const data = await res.json() as { topics: Topic[] }
        setTopics(data.topics ?? [])
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { void fetchTopics(false) }, [fetchTopics])

  if (selected) {
    return <TopicDetail topic={selected} onBack={() => setSelected(null)} />
  }

  return (
    <div className="flex flex-col h-full bg-hive-800">
      <div className="flex items-center justify-between px-3 py-2 border-b border-hive-border shrink-0">
        <div className="flex items-center gap-2">
          <Layers size={12} className="text-honey-500 shrink-0" />
          <span className="text-xs font-semibold text-text-primary">Topics</span>
          {topics.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-honey-500/15 text-honey-400 font-medium">{topics.length}</span>
          )}
        </div>
        <button
          onClick={() => void fetchTopics(false)}
          disabled={refreshing}
          className="p-1 rounded hover:bg-hive-hover text-text-muted hover:text-honey-500 transition-colors"
        >
          <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-4 text-xs text-text-muted">
            <Loader2 size={11} className="animate-spin" /> Loading topics...
          </div>
        ) : topics.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-10 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-honey-500/8 flex items-center justify-center">
              <Layers size={18} className="text-honey-500/60" />
            </div>
            <div>
              <p className="text-xs font-medium text-text-secondary mb-1">No topics yet</p>
              <p className="text-[11px] text-text-muted leading-relaxed">
                Tell Sparkie to create a topic for an ongoing project — she&apos;ll track emails, tasks, and events under it automatically.
              </p>
            </div>
            <p className="text-[10px] text-text-muted/50 italic">e.g. &quot;Create a topic for the Sparkie Studio deployment project&quot;</p>
          </div>
        ) : (
          <div className="divide-y divide-hive-border/40">
            {topics.map(topic => (
              <button
                key={topic.id}
                onClick={() => setSelected(topic)}
                className="w-full text-left px-3 py-2.5 hover:bg-hive-hover transition-colors flex items-start gap-2.5"
              >
                <div className="w-7 h-7 rounded-lg bg-honey-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Layers size={11} className="text-honey-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-text-primary truncate">{topic.name}</span>
                    {topic.notification_policy === 'immediate' && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-honey-500/20 text-honey-400 font-bold shrink-0">LIVE</span>
                    )}
                  </div>
                  {topic.summary ? (
                    <p className="text-[10px] text-text-muted leading-snug truncate mt-0.5">{topic.summary}</p>
                  ) : topic.fingerprint ? (
                    <p className="text-[10px] text-text-muted/60 leading-snug truncate mt-0.5 italic">{topic.fingerprint}</p>
                  ) : null}
                  <div className="flex items-center gap-1 mt-1">
                    <Calendar size={8} className="text-text-muted/50 shrink-0" />
                    <span className="text-[9px] text-text-muted">{timeAgo(topic.updated_at)}</span>
                  </div>
                </div>
                <ChevronRight size={11} className="text-text-muted shrink-0 mt-2" />
              </button>
            ))}
          </div>
        )}

        {topics.length > 0 && (
          <div className="px-3 py-3 border-t border-hive-border/40">
            <p className="text-[10px] text-text-muted/50 flex items-center gap-1.5">
              <Archive size={9} />
              Tell Sparkie to archive a topic when it&apos;s complete
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
