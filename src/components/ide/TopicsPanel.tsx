'use client'

import { useState, useEffect, useCallback } from 'react'
import { Layers, RefreshCw, Loader2, ChevronRight, Archive, Link2, Calendar, Rocket } from 'lucide-react'

interface Topic {
  id: string
  name: string
  fingerprint?: string
  summary?: string
  notification_policy: string
  status: string
  updated_at: string
  topic_type?: string
  last_round?: number
  step_count?: number
  original_request?: string
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
        const topics = data.topics ?? []
        setTopics(topics)
        // Auto-seed default topics on first load if none exist
        if (topics.length === 0) {
          fetch('/api/topics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'seed' }) })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.action === 'seeded') void fetchTopics(true) })
            .catch(() => {})
        }
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
        ) : (
          <>
            {/* Active Builds section */}
            {(() => {
              const buildTopics = topics.filter(t => t.topic_type === 'build')
              if (buildTopics.length === 0) return null
              return (
                <div className="border-b border-hive-border/60">
                  <div className="px-3 py-2 flex items-center gap-2">
                    <Rocket size={11} className="text-orange-400 shrink-0" />
                    <span className="text-[10px] font-semibold text-orange-400 uppercase tracking-widest">Active Builds</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-400/15 text-orange-400 font-medium">{buildTopics.length}</span>
                  </div>
                  {buildTopics.map(topic => (
                    <button
                      key={topic.id}
                      onClick={() => setSelected(topic)}
                      className="w-full text-left px-3 py-2.5 hover:bg-hive-hover transition-colors flex items-start gap-2.5 border-t border-hive-border/30"
                    >
                      <div className="w-7 h-7 rounded-lg bg-orange-400/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Rocket size={11} className="text-orange-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-text-primary truncate">{topic.name}</span>
                          {(topic.last_round ?? 0) > 0 && (
                            <span className="text-[8px] px-1 py-0.5 rounded bg-orange-400/20 text-orange-300 font-medium shrink-0">
                              {topic.last_round} rounds
                            </span>
                          )}
                        </div>
                        {topic.original_request ? (
                          <p className="text-[10px] text-text-muted leading-snug truncate mt-0.5 italic">
                            &ldquo;{topic.original_request.slice(0, 60)}{topic.original_request.length > 60 ? '…' : ''}&rdquo;
                          </p>
                        ) : topic.summary ? (
                          <p className="text-[10px] text-text-muted leading-snug truncate mt-0.5">{topic.summary}</p>
                        ) : null}
                        <div className="flex items-center gap-1.5 mt-1">
                          {(topic.step_count ?? 0) > 0 && (
                            <span className="text-[9px] text-text-muted">{topic.step_count} files written</span>
                          )}
                          {(topic.step_count ?? 0) > 0 && (topic.last_round ?? 0) > 0 && (
                            <span className="text-text-muted/40">·</span>
                          )}
                          <Calendar size={8} className="text-text-muted/50 shrink-0" />
                          <span className="text-[9px] text-text-muted">{timeAgo(topic.updated_at)}</span>
                        </div>
                      </div>
                      <ChevronRight size={11} className="text-text-muted shrink-0 mt-2" />
                    </button>
                  ))}
                  <p className="px-3 pb-2 text-[9px] text-text-muted/50 italic">
                    Say &ldquo;continue building [project]&rdquo; to resume
                  </p>
                </div>
              )
            })()}

            {/* Chat Topics section */}
            {(() => {
              const chatTopics = topics.filter(t => t.topic_type !== 'build')
              if (chatTopics.length === 0) return null
              return (
                <div className="divide-y divide-hive-border/40">
                  <div className="px-3 py-2 flex items-center gap-2">
                    <Layers size={11} className="text-honey-500 shrink-0" />
                    <span className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Topics</span>
                  </div>
                  {chatTopics.map(topic => (
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
                        <div className="flex items-center gap-1.5 mt-1">
                          <Calendar size={8} className="text-text-muted/50 shrink-0" />
                          <span className="text-[9px] text-text-muted">{timeAgo(topic.updated_at)}</span>
                        </div>
                      </div>
                      <ChevronRight size={11} className="text-text-muted shrink-0 mt-2" />
                    </button>
                  ))}
                </div>
              )
            })()}
          </>
        )}

        {topics.length > 0 && (
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
