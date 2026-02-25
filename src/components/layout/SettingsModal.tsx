'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  type LucideIcon, X, User, Brain, Key, Sliders, CreditCard,
  AlertTriangle, ChevronRight, LogOut, Loader2, Check, ChevronDown,
  Bell, Moon, Sun
} from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useAuth } from '@/hooks/useAuth'

type SettingsTab = 'account' | 'persona' | 'api-keys' | 'preferences' | 'notifications' | 'billing' | 'danger'

const NAV: { id: SettingsTab; icon: LucideIcon; label: string; desc: string }[] = [
  { id: 'account',       icon: User,          label: 'Account',        desc: 'Name, email & avatar' },
  { id: 'persona',       icon: Brain,         label: 'Sparkie Persona', desc: 'How Sparkie talks to you' },
  { id: 'api-keys',      icon: Key,           label: 'API Keys',        desc: 'Bring your own model keys' },
  { id: 'preferences',   icon: Sliders,       label: 'Preferences',     desc: 'Theme, language & defaults' },
  { id: 'notifications', icon: Bell,          label: 'Notifications',   desc: 'Alerts & digest settings' },
  { id: 'billing',       icon: CreditCard,    label: 'Billing',         desc: 'Plan, credits & invoices' },
  { id: 'danger',        icon: AlertTriangle, label: 'Danger Zone',     desc: 'Reset or delete account' },
]

const SPARKIE_MODELS = [
  { value: 'minimax-m2.5',  label: 'MiniMax M2.5',  badge: 'Default' },
  { value: 'minimax-m2.1',  label: 'MiniMax M2.1',  badge: null },
  { value: 'glm-5',         label: 'GLM-5',         badge: 'Fast' },
  { value: 'kimi-k2.5',     label: 'Kimi K2.5',     badge: null },
  { value: 'big-pickle',    label: 'Big Pickle',    badge: '\U0001f952' },
]

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Espa\u00f1ol' },
  { value: 'fr', label: 'Fran\u00e7ais' },
  { value: 'de', label: 'Deutsch' },
  { value: 'ja', label: '\u65e5\u672c\u8a9e' },
  { value: 'zh', label: '\u4e2d\u6587' },
  { value: 'pt', label: 'Portugu\u00eas' },
  { value: 'ko', label: '\ud55c\uad6d\uc5b4' },
]

interface DbUser {
  id: string; email: string; displayName: string
  tier: string; credits: number; gender: string | null; age: number | null
}

interface Prefs {
  theme: 'dark' | 'light'
  language: string
  defaultModel: string
  responseStyle: 'concise' | 'balanced' | 'detailed'
  notifications: { emailAlerts: boolean; creditWarning: boolean; productUpdates: boolean }
}

const DEFAULT_PREFS: Prefs = {
  theme: 'dark', language: 'en', defaultModel: 'minimax-m2.5', responseStyle: 'balanced',
  notifications: { emailAlerts: true, creditWarning: true, productUpdates: false },
}

function loadPrefs(): Prefs {
  try { const raw = localStorage.getItem('sparkie_prefs'); if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) } } catch {}
  return DEFAULT_PREFS
}
function savePrefs(p: Prefs) { try { localStorage.setItem('sparkie_prefs', JSON.stringify(p)) } catch {} }

function applyTheme(t: 'dark' | 'light') {
  const root = document.documentElement
  if (t === 'light') {
    root.style.setProperty('--hive-bg', '#F5C842')
    root.style.setProperty('--hive-surface', '#E5A800')
    root.style.setProperty('--hive-elevated', '#FFD166')
    root.style.setProperty('--hive-border', '#B38300')
    root.style.setProperty('--hive-hover', '#FFD700')
    root.style.setProperty('--text-primary', '#0A0A0A')
    root.style.setProperty('--text-secondary', '#1A1A1A')
    root.style.setProperty('--text-muted', '#3A3A3A')
    root.style.setProperty('--honey-primary', '#1A1A1A')
    root.style.setProperty('--honey-glow', 'rgba(0,0,0,0.15)')
    root.classList.add('sparkie-light')
    root.classList.remove('sparkie-dark')
  } else {
    root.style.setProperty('--hive-bg', '#1A1A1A')
    root.style.setProperty('--hive-surface', '#252525')
    root.style.setProperty('--hive-elevated', '#2D2D2D')
    root.style.setProperty('--hive-border', '#333333')
    root.style.setProperty('--hive-hover', '#3A3A3A')
    root.style.setProperty('--text-primary', '#F5F5F5')
    root.style.setProperty('--text-secondary', '#A0A0A0')
    root.style.setProperty('--text-muted', '#666666')
    root.style.setProperty('--honey-primary', '#FFC30B')
    root.style.setProperty('--honey-glow', 'rgba(255,195,11,0.15)')
    root.classList.add('sparkie-dark')
    root.classList.remove('sparkie-light')
  }
}

export function SettingsModal() {
  const { settingsOpen, closeSettings, userProfile, updateUserProfile, setSelectedModel } = useAppStore()
  const { user, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState<SettingsTab>('account')
  const [saved, setSaved] = useState(false)
  const [dbUser, setDbUser] = useState<DbUser | null>(null)
  const [loading, setLoading] = useState(false)
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)

  useEffect(() => {
    if (settingsOpen) { const p = loadPrefs(); setPrefs(p); applyTheme(p.theme) }
  }, [settingsOpen])

  useEffect(() => {
    if (settingsOpen && !dbUser) {
      setLoading(true)
      fetch('/api/user/profile').then(r => r.json()).then(d => { if (!d.error) setDbUser(d) }).finally(() => setLoading(false))
    }
  }, [settingsOpen])

  if (!settingsOpen) return null

  const displayName = dbUser?.displayName || user?.name || user?.email?.split('@')[0] || 'User'
  const email = dbUser?.email || user?.email || ''
  const tier = dbUser?.tier ?? 'free'
  const credits = dbUser?.credits ?? 0
  const initial = displayName.charAt(0).toUpperCase()

  const handleSaveProfile = async (patch: Record<string, string>) => {
    updateUserProfile(patch as Parameters<typeof updateUserProfile>[0])
    if (patch.displayName) {
      await fetch('/api/user/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: patch.displayName }) })
      setDbUser(prev => prev ? { ...prev, displayName: patch.displayName } : prev)
    }
    flash()
  }

  const handlePrefsChange = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch }; setPrefs(next); savePrefs(next)
    if (patch.theme) applyTheme(patch.theme)
    if (patch.defaultModel) setSelectedModel(patch.defaultModel)
    flash()
  }

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 2000) }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) closeSettings() }}
    >
      <div
        className="w-[820px] max-w-[96vw] h-[580px] max-h-[92vh] flex overflow-hidden shadow-2xl rounded-2xl"
        style={{ background: 'var(--hive-surface)', border: '1px solid var(--hive-border)' }}
      >
        {/* Left nav */}
        <div className="w-[220px] shrink-0 flex flex-col" style={{ background: 'var(--hive-bg)', borderRight: '1px solid var(--hive-border)' }}>
          <div className="p-4" style={{ borderBottom: '1px solid var(--hive-border)' }}>
            {loading ? (
              <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                <Loader2 size={14} className="animate-spin" />
                <span className="text-xs">Loading...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: 'rgba(255,195,11,0.15)', border: '1px solid rgba(255,195,11,0.4)', color: '#FFC30B' }}
                >
                  {initial}
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold truncate leading-tight" style={{ color: 'var(--text-primary)' }}>{displayName}</div>
                  <div className="text-[10px] truncate leading-tight mt-0.5" style={{ color: 'var(--text-muted)' }}>{email}</div>
                </div>
              </div>
            )}
          </div>

          <nav className="flex-1 p-2 overflow-y-auto">
            {NAV.map(({ id, icon: Icon, label, desc }) => {
              const isActive = activeTab === id
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-0.5 text-left transition-all"
                  style={{
                    background: isActive ? 'rgba(255,195,11,0.12)' : 'transparent',
                    color: isActive ? '#FFC30B' : 'var(--text-secondary)',
                  }}
                >
                  <Icon size={14} style={{ color: isActive ? '#FFC30B' : 'var(--text-muted)', flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium leading-tight">{label}</div>
                    <div className="text-[10px] leading-tight mt-0.5 truncate" style={{ color: isActive ? 'rgba(255,195,11,0.6)' : 'var(--text-muted)' }}>{desc}</div>
                  </div>
                  {isActive && <ChevronRight size={11} style={{ color: 'rgba(255,195,11,0.5)', flexShrink: 0 }} />}
                </button>
              )
            })}
          </nav>

          <div className="p-3" style={{ borderTop: '1px solid var(--hive-border)' }}>
            <button
              onClick={() => signOut()}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all hover:bg-red-500/10"
              style={{ color: 'var(--text-muted)' }}
            >
              <LogOut size={13} className="shrink-0" />
              <span className="text-[12px] font-medium">Sign out</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid var(--hive-border)' }}>
            <div>
              <h3 className="font-semibold text-[14px] leading-tight" style={{ color: 'var(--text-primary)' }}>
                {NAV.find(n => n.id === activeTab)?.label}
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {NAV.find(n => n.id === activeTab)?.desc}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {saved && (
                <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: '#4CAF50' }}>
                  <Check size={11} /> Saved
                </span>
              )}
              <button
                onClick={closeSettings}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/8"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {activeTab === 'account'       && <AccountPanel displayName={displayName} email={email} tier={tier} credits={credits} onSave={handleSaveProfile} />}
            {activeTab === 'persona'       && <PersonaPanel profile={userProfile} onSave={handleSaveProfile} />}
            {activeTab === 'api-keys'      && <ApiKeysPanel />}
            {activeTab === 'preferences'   && <PreferencesPanel prefs={prefs} onChange={handlePrefsChange} />}
            {activeTab === 'notifications' && <NotificationsPanel prefs={prefs} onChange={handlePrefsChange} />}
            {activeTab === 'billing'       && <BillingPanel tier={tier} credits={credits} />}
            {activeTab === 'danger'        && <DangerPanel />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Primitives ───────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {hint && <p className="text-[11px] mb-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
      {children}
    </div>
  )
}

function ThemedInput({ defaultValue, onBlur, placeholder, type = 'text', mono = false }: {
  defaultValue?: string; onBlur?: (v: string) => void; placeholder?: string; type?: string; mono?: boolean
}) {
  return (
    <input
      type={type}
      defaultValue={defaultValue ?? ''}
      onBlur={(e) => onBlur?.(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-lg px-3 py-2.5 text-sm transition-all focus:outline-none ${mono ? 'font-mono' : ''}`}
      style={{
        background: 'var(--hive-bg)',
        border: '1px solid var(--hive-border)',
        color: 'var(--text-primary)',
      }}
    />
  )
}

function ThemedTextArea({ defaultValue, onBlur, placeholder, rows = 3 }: {
  defaultValue?: string; onBlur?: (v: string) => void; placeholder?: string; rows?: number
}) {
  return (
    <textarea
      defaultValue={defaultValue ?? ''}
      onBlur={(e) => onBlur?.(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded-lg px-3 py-2.5 text-sm transition-all focus:outline-none resize-none"
      style={{ background: 'var(--hive-bg)', border: '1px solid var(--hive-border)', color: 'var(--text-primary)' }}
    />
  )
}

function ChipGroup({ options, value, onChange }: { options: { value: string; label: string }[]; value?: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className="px-3 py-2 rounded-lg text-[12px] font-medium transition-all"
          style={
            value === o.value
              ? { background: 'rgba(255,195,11,0.15)', border: '1px solid rgba(255,195,11,0.5)', color: '#FFC30B' }
              : { background: 'var(--hive-bg)', border: '1px solid var(--hive-border)', color: 'var(--text-secondary)' }
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function DarkSelect({ options, value, onChange }: {
  options: { value: string; label: string; badge?: string | null }[]
  value: string; onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value) ?? options[0]

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-all focus:outline-none"
        style={{ background: 'var(--hive-bg)', border: '1px solid var(--hive-border)', color: 'var(--text-primary)' }}
      >
        <div className="flex items-center gap-2">
          <span>{selected?.label}</span>
          {selected?.badge && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(255,195,11,0.15)', color: '#FFC30B' }}>{selected.badge}</span>
          )}
        </div>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-xl shadow-2xl z-[100] overflow-hidden" style={{ background: 'var(--hive-bg)', border: '1px solid var(--hive-border)' }}>
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-left transition-colors"
              style={opt.value === value
                ? { background: 'rgba(255,195,11,0.12)', color: '#FFC30B' }
                : { color: 'var(--text-secondary)' }
              }
            >
              <span>{opt.label}</span>
              {opt.badge && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--hive-surface)', color: 'var(--text-muted)' }}>{opt.badge}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Toggle({ enabled, onChange, label, desc }: { enabled: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid var(--hive-border)' }}>
      <div>
        <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{label}</div>
        {desc && <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        className="relative w-9 h-5 rounded-full transition-colors shrink-0 ml-4"
        style={{ background: enabled ? '#FFC30B' : 'var(--hive-border)' }}
      >
        <span
          className="absolute top-0.5 w-4 h-4 rounded-full shadow transition-transform"
          style={{ background: enabled ? '#1A1A1A' : 'var(--text-muted)', transform: enabled ? 'translateX(16px)' : 'translateX(2px)' }}
        />
      </button>
    </div>
  )
}

// ── Panels ───────────────────────────────────────────────────────────

function AccountPanel({ displayName, email, tier, credits, onSave }: {
  displayName: string; email: string; tier: string; credits: number
  onSave: (p: Record<string, string>) => void
}) {
  const isPro = tier === 'pro'
  return (
    <div>
      <div className="flex items-center gap-4 mb-6 p-4 rounded-xl" style={{ background: 'var(--hive-bg)', border: '1px solid var(--hive-border)' }}>
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
          style={{ background: 'rgba(255,195,11,0.15)', border: '2px solid rgba(255,195,11,0.35)', color: '#FFC30B' }}
        >
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] truncate" style={{ color: 'var(--text-primary)' }}>{displayName}</div>
          <div className="text-[12px] truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>{email}</div>
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={isPro
                ? { background: 'rgba(255,195,11,0.15)', color: '#FFC30B', border: '1px solid rgba(255,195,11,0.3)' }
                : { background: 'var(--hive-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--hive-border)' }
              }
            >{isPro ? '\u26a1 Pro' : 'Free Plan'}</span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{credits.toLocaleString()} credits</span>
          </div>
        </div>
      </div>

      <Field label="Display Name" hint="How you appear across the platform.">
        <ThemedInput defaultValue={displayName} onBlur={(v) => onSave({ displayName: v, name: v })} placeholder="Your name" />
      </Field>
      <Field label="Email">
        <div className="w-full rounded-lg px-3 py-2.5 text-sm flex items-center justify-between" style={{ background: 'var(--hive-bg)', border: '1px solid var(--hive-border)', color: 'var(--text-muted)' }}>
          <span>{email}</span>
          <span className="text-[10px] ml-2 shrink-0">Cannot be changed</span>
        </div>
      </Field>
    </div>
  )
}

function PersonaPanel({ profile, onSave }: {
  profile: { goals?: string; style?: string; experience?: string } | null
  onSave: (p: Record<string, string>) => void
}) {
  return (
    <div>
      <p className="text-[13px] mb-5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        Tell Sparkie how you like to work. This shapes her code style, explanations, and tone.
      </p>
      <Field label="Your Goals" hint="What are you building? What do you use Sparkie for?">
        <ThemedTextArea defaultValue={profile?.goals ?? ''} onBlur={(v) => onSave({ goals: v })} placeholder="e.g. Building Sparkie Studio, an all-in-one creative AI platform..." rows={3} />
      </Field>
      <Field label="Code Style">
        <ChipGroup
          options={[{ value: 'minimal', label: 'Minimal' }, { value: 'commented', label: 'Commented' }, { value: 'production', label: 'Production' }]}
          value={profile?.style} onChange={(v) => onSave({ style: v })}
        />
      </Field>
      <Field label="Experience Level">
        <ChipGroup
          options={[{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'expert', label: 'Expert' }]}
          value={profile?.experience} onChange={(v) => onSave({ experience: v })}
        />
      </Field>
    </div>
  )
}

function ApiKeysPanel() {
  const keys = [
    { label: 'OpenAI', placeholder: 'sk-...', key: 'openai' },
    { label: 'Anthropic', placeholder: 'sk-ant-...', key: 'anthropic' },
    { label: 'MiniMax', placeholder: 'eyJ...', key: 'minimax' },
    { label: 'Deepgram', placeholder: 'Token', key: 'deepgram' },
    { label: 'ElevenLabs', placeholder: 'sk_...', key: 'elevenlabs' },
  ]
  return (
    <div>
      <p className="text-[13px] mb-5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        Bring your own keys to use premium models without spending Sparkie credits.
      </p>
      <div className="space-y-3">
        {keys.map(({ label, placeholder, key }) => (
          <Field key={key} label={label}>
            <ThemedInput
              type="password"
              defaultValue={(() => { try { return localStorage.getItem(`sparkie_key_${key}`) ?? '' } catch { return '' } })()}
              onBlur={(v) => { try { localStorage.setItem(`sparkie_key_${key}`, v) } catch {} }}
              placeholder={placeholder}
              mono
            />
          </Field>
        ))}
      </div>
      <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>Keys stored locally in your browser only. Never sent to Sparkie servers.</p>
    </div>
  )
}

function PreferencesPanel({ prefs, onChange }: { prefs: Prefs; onChange: (p: Partial<Prefs>) => void }) {
  return (
    <div>
      <Field label="Theme">
        <div className="flex gap-2">
          {/* Dark: black bg with gold accents */}
          <button
            type="button"
            onClick={() => onChange({ theme: 'dark' })}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-medium transition-all"
            style={prefs.theme === 'dark'
              ? { background: 'rgba(255,195,11,0.15)', border: '1px solid rgba(255,195,11,0.5)', color: '#FFC30B' }
              : { background: 'var(--hive-bg)', border: '1px solid var(--hive-border)', color: 'var(--text-secondary)' }
            }
          >
            <Moon size={13} /> Dark
          </button>
          {/* Light: gold bg with black accents */}
          <button
            type="button"
            onClick={() => onChange({ theme: 'light' })}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-medium transition-all"
            style={prefs.theme === 'light'
              ? { background: 'rgba(255,195,11,0.15)', border: '1px solid rgba(255,195,11,0.5)', color: '#FFC30B' }
              : { background: 'var(--hive-bg)', border: '1px solid var(--hive-border)', color: 'var(--text-secondary)' }
            }
          >
            <Sun size={13} /> Light (Gold)
          </button>
        </div>
        <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
          Dark: black + gold accents. Light: golden/amber bg + dark elements.
        </p>
      </Field>

      <Field label="Language">
        <DarkSelect options={LANGUAGES} value={prefs.language} onChange={(v) => onChange({ language: v })} />
      </Field>

      <Field label="Default AI Model">
        <DarkSelect options={SPARKIE_MODELS} value={prefs.defaultModel} onChange={(v) => onChange({ defaultModel: v })} />
      </Field>

      <Field label="Response Style">
        <ChipGroup
          options={[{ value: 'concise', label: 'Concise' }, { value: 'balanced', label: 'Balanced' }, { value: 'detailed', label: 'Detailed' }]}
          value={prefs.responseStyle} onChange={(v) => onChange({ responseStyle: v as Prefs['responseStyle'] })}
        />
      </Field>
    </div>
  )
}

function NotificationsPanel({ prefs, onChange }: { prefs: Prefs; onChange: (p: Partial<Prefs>) => void }) {
  const { notifications: n } = prefs
  const setN = (patch: Partial<Prefs['notifications']>) => onChange({ notifications: { ...n, ...patch } })
  return (
    <div>
      <p className="text-[13px] mb-4 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>Control which alerts Sparkie sends you.</p>
      <div className="rounded-xl px-4" style={{ background: 'var(--hive-bg)', border: '1px solid var(--hive-border)' }}>
        <Toggle enabled={n.emailAlerts} onChange={(v) => setN({ emailAlerts: v })} label="Email Alerts" desc="Important account and security notifications" />
        <Toggle enabled={n.creditWarning} onChange={(v) => setN({ creditWarning: v })} label="Credit Warning" desc="Alert when your credits drop below 10%" />
        <div style={{ borderBottom: 'none' }}>
          <Toggle enabled={n.productUpdates} onChange={(v) => setN({ productUpdates: v })} label="Product Updates" desc="New features, models, and announcements" />
        </div>
      </div>
    </div>
  )
}

function BillingPanel({ tier, credits }: { tier: string; credits: number }) {
  const isPro = tier === 'pro'
  const pct = Math.min((credits / 1000) * 100, 100)
  return (
    <div>
      <div className="p-4 rounded-xl mb-4" style={isPro
        ? { background: 'rgba(255,195,11,0.08)', border: '1px solid rgba(255,195,11,0.25)' }
        : { background: 'var(--hive-bg)', border: '1px solid var(--hive-border)' }
      }>
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-semibold text-[14px]" style={{ color: 'var(--text-primary)' }}>{isPro ? '\u26a1 Pro Plan' : 'Free Plan'}</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(76,175,80,0.12)', color: '#4CAF50', border: '1px solid rgba(76,175,80,0.25)' }}>Active</span>
        </div>
        <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{isPro ? 'Unlimited generations \u00b7 Priority support \u00b7 All models' : '50 AI generations / day \u00b7 2 GB storage \u00b7 Community support'}</p>
      </div>

      <div className="p-4 rounded-xl mb-4" style={{ background: 'var(--hive-bg)', border: '1px solid var(--hive-border)' }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>Credits</div>
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Used for AI generations and media</div>
          </div>
          <div className="text-[22px] font-bold" style={{ color: '#FFC30B' }}>{credits.toLocaleString()}</div>
        </div>
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--hive-border)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: '#FFC30B' }} />
        </div>
      </div>

      {!isPro && (
        <button className="w-full py-3 rounded-xl font-semibold text-sm transition-colors" style={{ background: '#FFC30B', color: '#0A0A0A' }}>
          Upgrade to Pro &mdash; $12/mo
        </button>
      )}
    </div>
  )
}

function DangerPanel() {
  const { clearMessages } = useAppStore()
  const [confirmDelete, setConfirmDelete] = useState(false)
  return (
    <div className="space-y-3">
      <div className="p-4 rounded-xl flex items-center justify-between" style={{ border: '1px solid var(--hive-border)' }}>
        <div>
          <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>Clear chat history</div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Permanently deletes all conversations</div>
        </div>
        <button onClick={() => clearMessages()} className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors" style={{ border: '1px solid var(--hive-border)', color: 'var(--text-secondary)' }}>
          Clear
        </button>
      </div>

      <div className="p-4 rounded-xl" style={{ background: 'rgba(255,82,82,0.04)', border: '1px solid rgba(255,82,82,0.2)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[13px] font-semibold" style={{ color: '#FF5252' }}>Delete account</div>
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>This cannot be undone</div>
          </div>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors" style={{ background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.25)', color: '#FF5252' }}>Delete</button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg text-[12px] transition-colors" style={{ border: '1px solid var(--hive-border)', color: 'var(--text-secondary)' }}>Cancel</button>
              <button className="px-3 py-1.5 rounded-lg text-[12px] font-semibold" style={{ background: '#FF5252', color: 'white' }}>Confirm</button>
            </div>
          )}
        </div>
        {confirmDelete && <p className="text-[11px]" style={{ color: 'rgba(255,82,82,0.7)' }}>Are you sure? All your data, chats, and assets will be permanently deleted.</p>}
      </div>
    </div>
  )
}
