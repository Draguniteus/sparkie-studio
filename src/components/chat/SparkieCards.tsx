'use client'

import React, { useState } from 'react'
import { ChevronDown, ChevronUp, Check, X, Edit2, ExternalLink, Download, Play, Shield, Users } from 'lucide-react'

export interface SparkieCardData {
  type: string
  title: string
  subtitle?: string
  to?: string
  body?: string
  fields?: Array<{ label: string; value: string }>
  items?: string[]
  actions: Array<{ id: string; label: string; icon?: string; variant: 'primary' | 'secondary' | 'danger' }>
  metadata?: Record<string, unknown>
  previewUrl?: string
  // Resolved state — once user clicks an action, card updates
  resolvedAction?: string
  resolvedLabel?: string
}

// Card type → gradient, border, icon, header bg
const CARD_THEMES: Record<string, {
  gradient: string
  border: string
  headerBg: string
  iconBg: string
  icon: string
  accent: string
}> = {
  email_draft:    { gradient: 'from-blue-950/80 via-indigo-950/60 to-blue-900/40',    border: 'border-blue-500/25',   headerBg: 'bg-blue-950/60',    iconBg: 'bg-blue-500/20',    icon: '📧', accent: 'text-blue-300'    },
  calendar_event: { gradient: 'from-emerald-950/80 via-teal-950/60 to-emerald-900/40',border: 'border-emerald-500/25',headerBg: 'bg-emerald-950/60', iconBg: 'bg-emerald-500/20', icon: '📅', accent: 'text-emerald-300' },
  memory:         { gradient: 'from-purple-950/80 via-violet-950/60 to-purple-900/40',border: 'border-purple-500/25', headerBg: 'bg-purple-950/60',  iconBg: 'bg-purple-500/20',  icon: '🧠', accent: 'text-purple-300'  },
  contact:        { gradient: 'from-pink-950/80 via-rose-950/60 to-pink-900/40',      border: 'border-pink-500/25',   headerBg: 'bg-pink-950/60',    iconBg: 'bg-pink-500/20',    icon: '👤', accent: 'text-pink-300'    },
  task:           { gradient: 'from-amber-950/80 via-yellow-950/60 to-amber-900/40',  border: 'border-amber-500/25',  headerBg: 'bg-amber-950/60',   iconBg: 'bg-amber-500/20',   icon: '⚡', accent: 'text-amber-300'   },
  deploy:         { gradient: 'from-orange-950/80 via-red-950/60 to-orange-900/40',   border: 'border-orange-500/25', headerBg: 'bg-orange-950/60',  iconBg: 'bg-orange-500/20',  icon: '🚀', accent: 'text-orange-300'  },
  reminder:       { gradient: 'from-cyan-950/80 via-blue-950/60 to-cyan-900/40',      border: 'border-cyan-500/25',   headerBg: 'bg-cyan-950/60',    iconBg: 'bg-cyan-500/20',    icon: '🔔', accent: 'text-cyan-300'    },
  github_pr:      { gradient: 'from-slate-950/80 via-zinc-950/60 to-slate-900/40',    border: 'border-slate-500/25',  headerBg: 'bg-slate-950/60',   iconBg: 'bg-slate-500/20',   icon: '🐙', accent: 'text-slate-300'   },
  report:         { gradient: 'from-indigo-950/80 via-purple-950/60 to-indigo-900/40',border: 'border-indigo-500/25', headerBg: 'bg-indigo-950/60',  iconBg: 'bg-indigo-500/20',  icon: '📊', accent: 'text-indigo-300'  },
  media:          { gradient: 'from-fuchsia-950/80 via-pink-950/60 to-fuchsia-900/40',border: 'border-fuchsia-500/25',headerBg: 'bg-fuchsia-950/60', iconBg: 'bg-fuchsia-500/20', icon: '🎵', accent: 'text-fuchsia-300'  },
  image:          { gradient: 'from-yellow-950/80 via-orange-950/60 to-yellow-900/40',border: 'border-yellow-500/25', headerBg: 'bg-yellow-950/60',  iconBg: 'bg-yellow-500/20',  icon: '🖼️', accent: 'text-yellow-300'  },
  permission:     { gradient: 'from-red-950/80 via-orange-950/60 to-red-900/40',      border: 'border-red-500/25',    headerBg: 'bg-red-950/60',     iconBg: 'bg-red-500/20',     icon: '🔐', accent: 'text-red-300'     },
  confirmation:   { gradient: 'from-green-950/80 via-emerald-950/60 to-green-900/40', border: 'border-green-500/25',  headerBg: 'bg-green-950/60',   iconBg: 'bg-green-500/20',   icon: '💬', accent: 'text-green-300'   },
  browser_action: { gradient: 'from-teal-950/80 via-cyan-950/60 to-teal-900/40',      border: 'border-teal-500/25',   headerBg: 'bg-teal-950/60',    iconBg: 'bg-teal-500/20',    icon: '🌐', accent: 'text-teal-300'    },
  a2ui:             { gradient: 'from-indigo-950/80 via-purple-950/60 to-indigo-900/40',   border: 'border-indigo-500/25', headerBg: 'bg-indigo-950/60',  iconBg: 'bg-indigo-500/20',  icon: '📊', accent: 'text-indigo-300'  },
  cta:              { gradient: 'from-amber-950/80 via-orange-950/60 to-amber-900/40',   border: 'border-amber-500/25', headerBg: 'bg-amber-950/60',   iconBg: 'bg-amber-500/20',   icon: '⚡', accent: 'text-amber-300'   },
}

const DEFAULT_THEME = {
  gradient: 'from-hive-800/80 via-hive-700/60 to-hive-800/40',
  border: 'border-hive-border',
  headerBg: 'bg-hive-elevated',
  iconBg: 'bg-honey-500/15',
  icon: '✦',
  accent: 'text-honey-400',
}

function ActionButton({ action, onClick, resolved }: {
  action: SparkieCardData['actions'][0]
  onClick: () => void
  resolved: boolean
}) {
  const isResolved = resolved
  const base = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all'

  if (isResolved) return null

  const icon = action.icon === 'check' ? <Check size={11} /> :
               action.icon === 'x' ? <X size={11} /> :
               action.icon === 'edit' ? <Edit2 size={11} /> :
               action.icon === 'download' ? <Download size={11} /> :
               action.icon === 'play' ? <Play size={11} /> :
               action.icon === 'link' ? <ExternalLink size={11} /> :
               action.icon === 'shield' ? <Shield size={11} /> :
               action.icon === 'users' ? <Users size={11} /> :
               null

  if (action.variant === 'primary') {
    return (
      <button onClick={onClick} className={`${base} bg-honey-500 text-black hover:bg-honey-400 shadow-sm`}>
        {icon}{action.label}
      </button>
    )
  }
  if (action.variant === 'danger') {
    return (
      <button onClick={onClick} className={`${base} bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25`}>
        {icon}{action.label}
      </button>
    )
  }
  return (
    <button onClick={onClick} className={`${base} bg-white/5 border border-white/10 text-text-secondary hover:bg-white/10 hover:text-text-primary`}>
      {icon}{action.label}
    </button>
  )
}

// ── A2UI Card — renders structured YAML+JSON briefing documents ─────────────────
interface A2UIComponent {
  type: string
  props?: Record<string, unknown>
  children?: A2UIComponent[]
}

function A2UIComponent({ component, onAction, resolved }: {
  component: A2UIComponent
  onAction?: (actionId: string, cardType: string) => void
  resolved: boolean
}) {
  const { type, props = {}, children = [] } = component
  switch (type) {
    case 'Text':
      return <p className="text-xs text-text-secondary leading-relaxed">{String(props.text ?? '')}</p>
    case 'Column':
      return (
        <div className="flex flex-col gap-2">
          {children.map((c, i) => <A2UIComponent key={i} component={c} onAction={onAction} resolved={resolved} />)}
        </div>
      )
    case 'Row':
      return (
        <div className="flex items-center gap-3 flex-wrap">
          {children.map((c, i) => <A2UIComponent key={i} component={c} onAction={onAction} resolved={resolved} />)}
        </div>
      )
    case 'Button':
      return (
        <button
          onClick={() => onAction?.(String(props.actionId ?? ''), 'a2ui')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            props.variant === 'primary'
              ? 'bg-honey-500 text-black hover:bg-honey-400'
              : 'bg-white/5 border border-white/10 text-text-secondary hover:bg-white/10'
          }`}
        >
          {String(props.label ?? '')}
        </button>
      )
    case 'List':
      return (
        <ul className="space-y-1">
          {((props.items as string[]) ?? []).map((item, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-text-secondary">
              <span className="text-indigo-300 mt-0.5 shrink-0">•</span>
              {item}
            </li>
          ))}
        </ul>
      )
    case 'Divider':
      return <div className="h-px bg-white/6 my-2" />
    case 'Card':
      return (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/30 p-3">
          {children.map((c, i) => <A2UIComponent key={i} component={c} onAction={onAction} resolved={resolved} />)}
        </div>
      )
    default:
      return null
  }
}

function A2UICard({ card, onAction, resolved }: {
  card: SparkieCardData
  onAction?: (actionId: string, cardType: string) => void
  resolved: boolean
}) {
  const theme = CARD_THEMES['a2ui'] ?? DEFAULT_THEME
  const components = (card.metadata?.components as A2UIComponent[]) ?? []
  return (
    <div
      className={`my-2 rounded-2xl overflow-hidden border ${theme.border} bg-gradient-to-b ${theme.gradient} shadow-lg shadow-black/20`}
      style={{ animation: 'fadeSlideIn 0.25s ease' }}
    >
      <div className={`flex items-center gap-3 px-4 py-3 ${theme.headerBg}`}>
        <div className={`w-8 h-8 rounded-xl ${theme.iconBg} flex items-center justify-center shrink-0 text-base`}>
          {theme.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-bold ${theme.accent} uppercase tracking-wider leading-none mb-0.5`}>{card.title}</p>
          {card.subtitle && <p className="text-sm font-semibold text-text-primary truncate leading-tight">{card.subtitle}</p>}
        </div>
        {resolved && (
          <span className="shrink-0 flex items-center gap-1 text-[10px] text-green-400 font-semibold">
            <Check size={10} />{resolved}
          </span>
        )}
      </div>
      <div className="px-4 pb-4 pt-2">
        {card.body && <p className="text-xs text-text-secondary leading-relaxed mb-3 whitespace-pre-wrap">{card.body}</p>}
        <div className="space-y-2">
          {components.map((comp, i) => <A2UIComponent key={i} component={comp} onAction={onAction} resolved={!!resolved} />)}
        </div>
        {!resolved && card.actions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {card.actions.map(action => (
              <ActionButton key={action.id} action={action} resolved={!!resolved} onClick={() => onAction?.(action.id, card.type)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── CTA Card — call-to-action with action buttons ──────────────────────────────
function CTACard({ card, onAction, resolved }: {
  card: SparkieCardData
  onAction?: (actionId: string, cardType: string) => void
  resolved: boolean
}) {
  const theme = CARD_THEMES['cta'] ?? DEFAULT_THEME
  return (
    <div
      className={`my-2 rounded-2xl overflow-hidden border ${theme.border} bg-gradient-to-b ${theme.gradient} shadow-lg shadow-black/20`}
      style={{ animation: 'fadeSlideIn 0.25s ease' }}
    >
      <div className={`flex items-center gap-3 px-4 py-3 ${theme.headerBg}`}>
        <div className={`w-8 h-8 rounded-xl ${theme.iconBg} flex items-center justify-center shrink-0 text-base`}>
          {theme.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-bold ${theme.accent} uppercase tracking-wider leading-none mb-0.5`}>{card.title}</p>
          {card.subtitle && <p className="text-sm font-semibold text-text-primary truncate leading-tight">{card.subtitle}</p>}
        </div>
        {resolved && (
          <span className="shrink-0 flex items-center gap-1 text-[10px] text-green-400 font-semibold">
            <Check size={10} />{resolved}
          </span>
        )}
      </div>
      <div className="px-4 pb-4 pt-2">
        {card.body && <p className="text-xs text-text-secondary leading-relaxed mb-3 whitespace-pre-wrap">{card.body}</p>}
        {!resolved && card.actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {card.actions.map(action => (
              <ActionButton key={action.id} action={action} resolved={!!resolved} onClick={() => onAction?.(action.id, card.type)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface SparkieCardProps {
  card: SparkieCardData
  onAction?: (actionId: string, cardType: string) => void
}

export function SparkieCard({ card, onAction }: SparkieCardProps) {
  const [expanded, setExpanded] = useState(true)
  const [resolved, setResolved] = useState<string | null>(card.resolvedAction ?? null)
  const theme = CARD_THEMES[card.type] ?? DEFAULT_THEME

  const handleAction = (actionId: string, label: string) => {
    setResolved(label)
    onAction?.(actionId, card.type)
  }

  // Route to specialized renderers
  if (card.type === 'a2ui') return <A2UICard card={card} onAction={onAction} resolved={!!resolved} />
  if (card.type === 'cta') return <CTACard card={card} onAction={onAction} resolved={!!resolved} />

  return (
    <div
      className={`my-2 rounded-2xl overflow-hidden border ${theme.border} bg-gradient-to-b ${theme.gradient} shadow-lg shadow-black/20`}
      style={{ animation: 'fadeSlideIn 0.25s ease' }}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(v => !v)}
        className={`w-full flex items-center gap-3 px-4 py-3 ${theme.headerBg} text-left hover:brightness-110 transition-all`}
      >
        <div className={`w-8 h-8 rounded-xl ${theme.iconBg} flex items-center justify-center shrink-0 text-base`}>
          {theme.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-bold ${theme.accent} uppercase tracking-wider leading-none mb-0.5`}>
            {card.title}
          </p>
          {card.subtitle && (
            <p className="text-sm font-semibold text-text-primary truncate leading-tight">{card.subtitle}</p>
          )}
        </div>
        {resolved ? (
          <span className="shrink-0 flex items-center gap-1 text-[10px] text-green-400 font-semibold">
            <Check size={10} />{resolved}
          </span>
        ) : (
          <div className="shrink-0 text-text-muted">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </div>
        )}
      </button>

      {/* Body — collapsible */}
      {expanded && (
        <div className="px-4 pb-4 pt-2">
          {/* To field */}
          {card.to && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">To:</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/8 border border-white/10 text-text-secondary font-medium">{card.to}</span>
            </div>
          )}

          {/* Divider */}
          {(card.to || card.subtitle) && <div className="h-px bg-white/6 mb-2" />}

          {/* Body text */}
          {card.body && (
            <div className="max-h-36 overflow-y-auto mb-3">
              <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">{card.body}</p>
            </div>
          )}

          {/* Image preview */}
          {card.previewUrl && (
            <div className="mb-3 rounded-xl overflow-hidden">
              <img src={card.previewUrl} alt="Preview" className="w-full max-h-40 object-cover" loading="lazy" />
            </div>
          )}

          {/* Items list (e.g. tasks, permissions) */}
          {card.items && card.items.length > 0 && (
            <ul className="mb-3 space-y-1">
              {card.items.map((item, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-text-secondary">
                  <span className={`mt-0.5 shrink-0 ${theme.accent}`}>•</span>
                  {item}
                </li>
              ))}
            </ul>
          )}

          {/* Key-value fields */}
          {card.fields && card.fields.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {card.fields.map((f, i) => (
                <div key={i} className="flex items-baseline gap-2">
                  <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold shrink-0 w-20">{f.label}</span>
                  <span className="text-xs text-text-secondary">{f.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Divider before actions */}
          {card.actions.length > 0 && <div className="h-px bg-white/6 mb-3" />}

          {/* Actions */}
          {!resolved && (
            <div className="flex flex-wrap gap-2">
              {card.actions.map(action => (
                <ActionButton
                  key={action.id}
                  action={action}
                  resolved={!!resolved}
                  onClick={() => handleAction(action.id, action.label)}
                />
              ))}
            </div>
          )}

          {resolved && (
            <div className="flex items-center gap-1.5 text-xs text-green-400 font-medium">
              <Check size={12} />
              <span>{resolved}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
