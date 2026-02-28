'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  type LucideIcon, X, User, Brain, Key, Sliders, CreditCard,
  AlertTriangle, ChevronRight, LogOut, Loader2, Check, ChevronDown,
  Bell, Moon, Sun, Camera
} from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useAuth } from '@/hooks/useAuth'
import { applyTheme } from '@/utils/themeUtils'

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
  avatarUrl: string | null
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
function savePrefs(p: Prefs) {
  try { localStorage.setItem('sparkie_prefs', JSON.stringify(p)) } catch {}
  // Persist to DB (fire-and-forget — survives cross-device/browser)
  fetch('/api/user/preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(p),
  }).catch(() => {})
}
async function loadPrefsFromDB(): Promise<Partial<Prefs>> {
  try {
    const res = await fetch('/api/user/preferences')
    if (res.ok) {
      const { preferences } = await res.json() as { preferences: Partial<Prefs> }
      return preferences ?? {}
    }
  } catch {}
  return {}
}

// ── Theme tokens — all colors computed from theme, never from CSS vars inside JSX ──
// This ensures the modal always re-renders with correct colors when theme changes.
interface ThemeTokens {
  // Surfaces
  bgPrimary: string       // deepest bg (sidebar)
  bgSecondary: string     // modal body
  bgElevated: string      // cards, inputs
  border: string          // all borders
  borderStrong: string    // stronger borders

  // Text
  textPrimary: string
  textSecondary: string
  textMuted: string

  // Accent (gold in dark, dark in light)
  accent: string          // gold (#FFC30B) in dark, near-black (#1A1A1A) in light
  accentText: string      // text ON accent-colored bg: dark in dark, gold in light
  accentBg: string        // accent tinted bg
  accentBorder: string    // accent border

  // Active nav
  activeNavBg: string
  activeNavText: string
  activeNavDescText: string
  activeNavIcon: string
  activeNavChevron: string

  // Toggle
  toggleOn: string        // track when ON
  toggleOff: string       // track when OFF
  toggleThumb: string     // thumb color
  toggleThumbOn: string   // thumb color when ON

  // Input
  inputBg: string
  inputText: string
  inputPlaceholder: string

  // Chip active
  chipActiveBg: string
  chipActiveBorder: string
  chipActiveText: string
  chipInactiveBg: string
  chipInactiveBorder: string
  chipInactiveText: string
}

function getTokens(theme: 'dark' | 'light'): ThemeTokens {
  if (theme === 'light') {
    return {
      bgPrimary:    '#E5A800',
      bgSecondary:  '#F5C842',
      bgElevated:   '#FFD166',
      border:       '#B38300',
      borderStrong: '#7A5800',

      textPrimary:   '#0A0A0A',
      textSecondary: '#1A1A1A',
      textMuted:     '#3D3000',

      accent:       '#0A0A0A',
      accentText:   '#F5C842',
      accentBg:     'rgba(0,0,0,0.10)',
      accentBorder: 'rgba(0,0,0,0.35)',

      activeNavBg:       'rgba(0,0,0,0.12)',
      activeNavText:     '#0A0A0A',
      activeNavDescText: '#3D3000',
      activeNavIcon:     '#0A0A0A',
      activeNavChevron:  'rgba(0,0,0,0.4)',

      toggleOn:      '#0A0A0A',
      toggleOff:     '#B38300',
      toggleThumb:   '#F5C842',
      toggleThumbOn: '#FFC30B',

      inputBg:          'rgba(0,0,0,0.08)',
      inputText:        '#0A0A0A',
      inputPlaceholder: '#7A5800',

      chipActiveBg:     'rgba(0,0,0,0.12)',
      chipActiveBorder: 'rgba(0,0,0,0.45)',
      chipActiveText:   '#0A0A0A',
      chipInactiveBg:   'rgba(0,0,0,0.06)',
      chipInactiveBorder:'#B38300',
      chipInactiveText: '#3D3000',
    }
  }
  // dark
  return {
    bgPrimary:    '#1A1A1A',
    bgSecondary:  '#252525',
    bgElevated:   '#2D2D2D',
    border:       '#333333',
    borderStrong: '#444444',

    textPrimary:   '#F5F5F5',
    textSecondary: '#A0A0A0',
    textMuted:     '#666666',

    accent:       '#FFC30B',
    accentText:   '#0A0A0A',
    accentBg:     'rgba(255,195,11,0.12)',
    accentBorder: 'rgba(255,195,11,0.45)',

    activeNavBg:       'rgba(255,195,11,0.12)',
    activeNavText:     '#FFC30B',
    activeNavDescText: 'rgba(255,195,11,0.55)',
    activeNavIcon:     '#FFC30B',
    activeNavChevron:  'rgba(255,195,11,0.45)',

    toggleOn:      '#FFC30B',
    toggleOff:     '#333333',
    toggleThumb:   '#666666',
    toggleThumbOn: '#1A1A1A',

    inputBg:          '#1A1A1A',
    inputText:        '#F5F5F5',
    inputPlaceholder: '#555555',

    chipActiveBg:     'rgba(255,195,11,0.15)',
    chipActiveBorder: 'rgba(255,195,11,0.5)',
    chipActiveText:   '#FFC30B',
    chipInactiveBg:   '#1A1A1A',
    chipInactiveBorder:'#333333',
    chipInactiveText: '#A0A0A0',
  }
}

export function SettingsModal() {
  const { settingsOpen, closeSettings, userProfile, updateUserProfile, setSelectedModel, setUserAvatarUrl } = useAppStore()
  const { user, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState<SettingsTab>('account')
  const [saved, setSaved] = useState(false)
  const [dbUser, setDbUser] = useState<DbUser | null>(null)
  const [loading, setLoading] = useState(false)
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)

  useEffect(() => {
    if (settingsOpen) {
      const p = loadPrefs()
      setPrefs(p)
      applyTheme(p.theme)
      // Merge DB prefs on top (DB wins — cross-device sync)
      loadPrefsFromDB().then(dbPrefs => {
        if (dbPrefs && Object.keys(dbPrefs).length > 0) {
          const merged = { ...DEFAULT_PREFS, ...p, ...dbPrefs } as Prefs
          setPrefs(merged)
          applyTheme(merged.theme)
          try { localStorage.setItem('sparkie_prefs', JSON.stringify(merged)) } catch {}
        }
      })
    }
  }, [settingsOpen])

  useEffect(() => {
    if (settingsOpen && !dbUser) {
      setLoading(true)
      fetch('/api/user/profile').then(r => r.json()).then(d => { if (!d.error) { setDbUser(d); if (d.avatarUrl) setUserAvatarUrl(d.avatarUrl) } }).finally(() => setLoading(false))
    }
  }, [settingsOpen])

  if (!settingsOpen) return null

  const tk = getTokens(prefs.theme)

  const displayName = dbUser?.displayName || user?.name || user?.email?.split('@')[0] || 'User'
  const email = dbUser?.email || user?.email || ''
  const tier = dbUser?.tier ?? 'free'
  const credits = dbUser?.credits ?? 0
  const avatarUrl = dbUser?.avatarUrl ?? null
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
        style={{ background: tk.bgSecondary, border: `1px solid ${tk.border}` }}
      >
        {/* Left nav */}
        <div className="w-[220px] shrink-0 flex flex-col" style={{ background: tk.bgPrimary, borderRight: `1px solid ${tk.border}` }}>
          <div className="p-4" style={{ borderBottom: `1px solid ${tk.border}` }}>
            {loading ? (
              <div className="flex items-center gap-2" style={{ color: tk.textMuted }}>
                <Loader2 size={14} className="animate-spin" /><span className="text-xs">Loading...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full overflow-hidden shrink-0" style={{ border: `1px solid ${tk.accentBorder}` }}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm font-bold" style={{ background: tk.accentBg, color: tk.accent }}>
                      {initial}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold truncate leading-tight" style={{ color: tk.textPrimary }}>{displayName}</div>
                  <div className="text-[10px] truncate leading-tight mt-0.5" style={{ color: tk.textMuted }}>{email}</div>
                </div>
              </div>
            )}
          </div>

          <nav className="flex-1 p-2 overflow-y-auto">
            {NAV.map(({ id, icon: Icon, label, desc }) => {
              const isActive = activeTab === id
              return (
                <button key={id} onClick={() => setActiveTab(id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-0.5 text-left transition-all"
                  style={{ background: isActive ? tk.activeNavBg : 'transparent', color: isActive ? tk.activeNavText : tk.textSecondary }}
                >
                  <Icon size={14} style={{ color: isActive ? tk.activeNavIcon : tk.textMuted, flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium leading-tight">{label}</div>
                    <div className="text-[10px] leading-tight mt-0.5 truncate" style={{ color: isActive ? tk.activeNavDescText : tk.textMuted }}>{desc}</div>
                  </div>
                  {isActive && <ChevronRight size={11} style={{ color: tk.activeNavChevron, flexShrink: 0 }} />}
                </button>
              )
            })}
          </nav>

          <div className="p-3" style={{ borderTop: `1px solid ${tk.border}` }}>
            <button onClick={() => signOut()}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all hover:opacity-80"
              style={{ color: tk.textMuted }}>
              <LogOut size={13} className="shrink-0" /><span className="text-[12px] font-medium">Sign out</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: `1px solid ${tk.border}` }}>
            <div>
              <h3 className="font-semibold text-[14px] leading-tight" style={{ color: tk.textPrimary }}>
                {NAV.find(n => n.id === activeTab)?.label}
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: tk.textMuted }}>
                {NAV.find(n => n.id === activeTab)?.desc}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {saved && <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: '#4CAF50' }}><Check size={11} /> Saved</span>}
              <button onClick={closeSettings}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:opacity-70"
                style={{ color: tk.textMuted }}>
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {activeTab === 'account'       && <AccountPanel tk={tk} displayName={displayName} email={email} tier={tier} credits={credits} avatarUrl={avatarUrl} onSave={handleSaveProfile} onAvatarChange={(url) => { setDbUser(prev => prev ? { ...prev, avatarUrl: url } : prev); setUserAvatarUrl(url) }} />}
            {activeTab === 'persona'       && <PersonaPanel tk={tk} profile={userProfile} onSave={handleSaveProfile} />}
            {activeTab === 'api-keys'      && <ApiKeysPanel tk={tk} />}
            {activeTab === 'preferences'   && <PreferencesPanel tk={tk} prefs={prefs} onChange={handlePrefsChange} />}
            {activeTab === 'notifications' && <NotificationsPanel tk={tk} prefs={prefs} onChange={handlePrefsChange} />}
            {activeTab === 'billing'       && <BillingPanel tk={tk} tier={tier} credits={credits} />}
            {activeTab === 'danger'        && <DangerPanel tk={tk} />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Primitives ───────────────────────────────────────────────────────

function Field({ tk, label, hint, children }: { tk: ThemeTokens; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: tk.textMuted }}>{label}</label>
      {hint && <p className="text-[11px] mb-2 leading-relaxed" style={{ color: tk.textMuted }}>{hint}</p>}
      {children}
    </div>
  )
}

function ThemedInput({ tk, defaultValue, onBlur, placeholder, type = 'text', mono = false }: {
  tk: ThemeTokens; defaultValue?: string; onBlur?: (v: string) => void; placeholder?: string; type?: string; mono?: boolean
}) {
  return (
    <input
      type={type}
      defaultValue={defaultValue ?? ''}
      onBlur={(e) => onBlur?.(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-lg px-3 py-2.5 text-sm transition-all focus:outline-none ${mono ? 'font-mono' : ''}`}
      style={{ background: tk.inputBg, border: `1px solid ${tk.border}`, color: tk.inputText }}
    />
  )
}

function ThemedTextArea({ tk, defaultValue, onBlur, placeholder, rows = 3 }: {
  tk: ThemeTokens; defaultValue?: string; onBlur?: (v: string) => void; placeholder?: string; rows?: number
}) {
  return (
    <textarea
      defaultValue={defaultValue ?? ''}
      onBlur={(e) => onBlur?.(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded-lg px-3 py-2.5 text-sm transition-all focus:outline-none resize-none"
      style={{ background: tk.inputBg, border: `1px solid ${tk.border}`, color: tk.inputText }}
    />
  )
}

function ChipGroup({ tk, options, value, onChange }: { tk: ThemeTokens; options: { value: string; label: string }[]; value?: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} className="px-3 py-2 rounded-lg text-[12px] font-medium transition-all"
          style={value === o.value
            ? { background: tk.chipActiveBg, border: `1px solid ${tk.chipActiveBorder}`, color: tk.chipActiveText }
            : { background: tk.chipInactiveBg, border: `1px solid ${tk.chipInactiveBorder}`, color: tk.chipInactiveText }
          }>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function DarkSelect({ tk, options, value, onChange }: {
  tk: ThemeTokens; options: { value: string; label: string; badge?: string | null }[]; value: string; onChange: (v: string) => void
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
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-all focus:outline-none"
        style={{ background: tk.inputBg, border: `1px solid ${tk.border}`, color: tk.inputText }}>
        <div className="flex items-center gap-2">
          <span>{selected?.label}</span>
          {selected?.badge && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: tk.accentBg, color: tk.accent }}>{selected.badge}</span>}
        </div>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: tk.textMuted }} />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-xl shadow-2xl z-[100] overflow-hidden"
          style={{ background: tk.bgPrimary, border: `1px solid ${tk.border}` }}>
          {options.map(opt => (
            <button key={opt.value} type="button" onClick={() => { onChange(opt.value); setOpen(false) }}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-left transition-colors hover:opacity-80"
              style={opt.value === value
                ? { background: tk.accentBg, color: tk.accent }
                : { color: tk.textSecondary }
              }>
              <span>{opt.label}</span>
              {opt.badge && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: tk.bgElevated, color: tk.textMuted }}>{opt.badge}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Fixed toggle: precise sizing so thumb never overflows, clear ON/OFF visual difference
function Toggle({ tk, enabled, onChange, label, desc }: { tk: ThemeTokens; enabled: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: `1px solid ${tk.border}` }}>
      <div>
        <div className="text-[13px] font-medium" style={{ color: tk.textPrimary }}>{label}</div>
        {desc && <div className="text-[11px] mt-0.5" style={{ color: tk.textMuted }}>{desc}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        aria-checked={enabled}
        role="switch"
        className="shrink-0 ml-4 relative rounded-full transition-all duration-200"
        style={{
          width: 40,
          height: 22,
          background: enabled ? tk.toggleOn : tk.toggleOff,
          border: `2px solid ${enabled ? tk.toggleOn : tk.border}`,
          flexShrink: 0,
        }}
      >
        <span
          className="absolute rounded-full transition-all duration-200 shadow"
          style={{
            width: 14,
            height: 14,
            top: 2,
            left: enabled ? 20 : 2,
            background: enabled ? tk.toggleThumbOn : tk.toggleThumb,
          }}
        />
      </button>
    </div>
  )
}

// ── Panels ───────────────────────────────────────────────────────────

function AccountPanel({ tk, displayName, email, tier, credits, avatarUrl, onSave, onAvatarChange }: {
  tk: ThemeTokens; displayName: string; email: string; tier: string; credits: number
  avatarUrl: string | null
  onSave: (p: Record<string, string>) => void
  onAvatarChange: (url: string) => void
}) {
  const isPro = tier === 'pro'
  const [uploading, setUploading] = React.useState(false)
  const [uploadError, setUploadError] = React.useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const handleAvatarClick = () => fileInputRef.current?.click()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    const fd = new FormData()
    fd.append('avatar', file)
    try {
      const res = await fetch('/api/user/avatar', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.avatarUrl) {
        onAvatarChange(data.avatarUrl)
      } else {
        setUploadError(data.error ?? 'Upload failed')
      }
    } catch {
      setUploadError('Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const initial = displayName.charAt(0).toUpperCase()

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
      />
      <div className="flex items-center gap-4 mb-6 p-4 rounded-xl" style={{ background: tk.bgElevated, border: `1px solid ${tk.border}` }}>
        {/* Clickable avatar */}
        <button
          type="button"
          onClick={handleAvatarClick}
          title="Change profile picture"
          className="relative w-12 h-12 rounded-full overflow-hidden shrink-0 group"
          style={{ border: `2px solid ${tk.accentBorder}` }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-lg font-bold" style={{ background: tk.accentBg, color: tk.accent }}>
              {initial}
            </div>
          )}
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            {uploading ? (
              <Loader2 size={14} className="text-white animate-spin" />
            ) : (
              <Camera size={14} className="text-white" />
            )}
          </div>
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] truncate" style={{ color: tk.textPrimary }}>{displayName}</div>
          <div className="text-[12px] truncate mt-0.5" style={{ color: tk.textSecondary }}>{email}</div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={isPro
                ? { background: tk.accentBg, color: tk.accent, border: `1px solid ${tk.accentBorder}` }
                : { background: tk.bgPrimary, color: tk.textSecondary, border: `1px solid ${tk.border}` }
              }>{isPro ? '\u26a1 Pro' : 'Free Plan'}</span>
            <span className="text-[10px]" style={{ color: tk.textMuted }}>{credits.toLocaleString()} credits</span>
          </div>
        </div>
      </div>
      {uploadError && (
        <p className="text-[11px] mb-3 text-red-400">{uploadError}</p>
      )}
      <p className="text-[11px] mb-5" style={{ color: tk.textMuted }}>Click your avatar to upload a new photo (JPG, PNG, WebP · max 2 MB)</p>
      <Field tk={tk} label="Display Name" hint="How you appear across the platform.">
        <ThemedInput tk={tk} defaultValue={displayName} onBlur={(v) => onSave({ displayName: v, name: v })} placeholder="Your name" />
      </Field>
      <Field tk={tk} label="Email">
        <div className="w-full rounded-lg px-3 py-2.5 text-sm flex items-center justify-between"
          style={{ background: tk.inputBg, border: `1px solid ${tk.border}`, color: tk.textMuted }}>
          <span>{email}</span><span className="text-[10px] ml-2 shrink-0">Cannot be changed</span>
        </div>
      </Field>
    </div>
  )
}

function PersonaPanel({ tk, profile, onSave }: {
  tk: ThemeTokens; profile: { goals?: string; style?: string; experience?: string } | null; onSave: (p: Record<string, string>) => void
}) {
  return (
    <div>
      <p className="text-[13px] mb-5 leading-relaxed" style={{ color: tk.textSecondary }}>
        Tell Sparkie how you like to work. This shapes her code style, explanations, and tone.
      </p>
      <Field tk={tk} label="Your Goals" hint="What are you building? What do you use Sparkie for?">
        <ThemedTextArea tk={tk} defaultValue={profile?.goals ?? ''} onBlur={(v) => onSave({ goals: v })} placeholder="e.g. Building Sparkie Studio, an all-in-one creative AI platform..." rows={3} />
      </Field>
      <Field tk={tk} label="Code Style">
        <ChipGroup tk={tk} options={[{ value: 'minimal', label: 'Minimal' }, { value: 'commented', label: 'Commented' }, { value: 'production', label: 'Production' }]} value={profile?.style} onChange={(v) => onSave({ style: v })} />
      </Field>
      <Field tk={tk} label="Experience Level">
        <ChipGroup tk={tk} options={[{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'expert', label: 'Expert' }]} value={profile?.experience} onChange={(v) => onSave({ experience: v })} />
      </Field>
    </div>
  )
}

function ApiKeysPanel({ tk }: { tk: ThemeTokens }) {
  const keys = [
    { label: 'OpenAI', placeholder: 'sk-...', key: 'openai' },
    { label: 'Anthropic', placeholder: 'sk-ant-...', key: 'anthropic' },
    { label: 'MiniMax', placeholder: 'eyJ...', key: 'minimax' },
    { label: 'Deepgram', placeholder: 'Token', key: 'deepgram' },
    { label: 'ElevenLabs', placeholder: 'sk_...', key: 'elevenlabs' },
  ]
  return (
    <div>
      <p className="text-[13px] mb-5 leading-relaxed" style={{ color: tk.textSecondary }}>
        Bring your own keys to use premium models without spending Sparkie credits.
      </p>
      <div className="space-y-3">
        {keys.map(({ label, placeholder, key }) => (
          <Field key={key} tk={tk} label={label}>
            <ThemedInput tk={tk} type="password"
              defaultValue={(() => { try { return localStorage.getItem(`sparkie_key_${key}`) ?? '' } catch { return '' } })()}
              onBlur={(v) => { try { localStorage.setItem(`sparkie_key_${key}`, v) } catch {} }}
              placeholder={placeholder} mono />
          </Field>
        ))}
      </div>
      <p className="text-[11px] mt-2" style={{ color: tk.textMuted }}>Keys stored locally in your browser only. Never sent to Sparkie servers.</p>
    </div>
  )
}

function PreferencesPanel({ tk, prefs, onChange }: { tk: ThemeTokens; prefs: Prefs; onChange: (p: Partial<Prefs>) => void }) {
  return (
    <div>
      <Field tk={tk} label="Theme">
        <div className="flex gap-2">
          <button type="button" onClick={() => onChange({ theme: 'dark' })}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-medium transition-all"
            style={prefs.theme === 'dark'
              ? { background: tk.chipActiveBg, border: `1px solid ${tk.chipActiveBorder}`, color: tk.chipActiveText }
              : { background: tk.chipInactiveBg, border: `1px solid ${tk.chipInactiveBorder}`, color: tk.chipInactiveText }
            }>
            <Moon size={13} /> Dark
          </button>
          <button type="button" onClick={() => onChange({ theme: 'light' })}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-medium transition-all"
            style={prefs.theme === 'light'
              ? { background: tk.chipActiveBg, border: `1px solid ${tk.chipActiveBorder}`, color: tk.chipActiveText }
              : { background: tk.chipInactiveBg, border: `1px solid ${tk.chipInactiveBorder}`, color: tk.chipInactiveText }
            }>
            <Sun size={13} /> Light (Gold)
          </button>
        </div>
        <p className="text-[10px] mt-1.5" style={{ color: tk.textMuted }}>
          Dark: black + gold. Light: gold/amber bg + dark elements.
        </p>
      </Field>

      <Field tk={tk} label="Language">
        <DarkSelect tk={tk} options={LANGUAGES} value={prefs.language} onChange={(v) => onChange({ language: v })} />
      </Field>
      <Field tk={tk} label="Default AI Model">
        <DarkSelect tk={tk} options={SPARKIE_MODELS} value={prefs.defaultModel} onChange={(v) => onChange({ defaultModel: v })} />
      </Field>
      <Field tk={tk} label="Response Style">
        <ChipGroup tk={tk} options={[{ value: 'concise', label: 'Concise' }, { value: 'balanced', label: 'Balanced' }, { value: 'detailed', label: 'Detailed' }]} value={prefs.responseStyle} onChange={(v) => onChange({ responseStyle: v as Prefs['responseStyle'] })} />
      </Field>
    </div>
  )
}

function NotificationsPanel({ tk, prefs, onChange }: { tk: ThemeTokens; prefs: Prefs; onChange: (p: Partial<Prefs>) => void }) {
  const { notifications: n } = prefs
  const setN = (patch: Partial<Prefs['notifications']>) => onChange({ notifications: { ...n, ...patch } })
  return (
    <div>
      <p className="text-[13px] mb-4 leading-relaxed" style={{ color: tk.textSecondary }}>Control which alerts Sparkie sends you.</p>
      <div className="rounded-xl px-4" style={{ background: tk.bgElevated, border: `1px solid ${tk.border}` }}>
        <Toggle tk={tk} enabled={n.emailAlerts} onChange={(v) => setN({ emailAlerts: v })} label="Email Alerts" desc="Important account and security notifications" />
        <Toggle tk={tk} enabled={n.creditWarning} onChange={(v) => setN({ creditWarning: v })} label="Credit Warning" desc="Alert when your credits drop below 10%" />
        <div style={{ borderBottom: 'none' }}>
          <Toggle tk={tk} enabled={n.productUpdates} onChange={(v) => setN({ productUpdates: v })} label="Product Updates" desc="New features, models, and announcements" />
        </div>
      </div>
    </div>
  )
}

function BillingPanel({ tk, tier, credits }: { tk: ThemeTokens; tier: string; credits: number }) {
  const isPro = tier === 'pro'
  const pct = Math.min((credits / 1000) * 100, 100)
  return (
    <div>
      <div className="p-4 rounded-xl mb-4"
        style={isPro
          ? { background: tk.accentBg, border: `1px solid ${tk.accentBorder}` }
          : { background: tk.bgElevated, border: `1px solid ${tk.border}` }
        }>
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-semibold text-[14px]" style={{ color: tk.textPrimary }}>{isPro ? '\u26a1 Pro Plan' : 'Free Plan'}</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(76,175,80,0.12)', color: '#4CAF50', border: '1px solid rgba(76,175,80,0.25)' }}>Active</span>
        </div>
        <p className="text-[12px]" style={{ color: tk.textSecondary }}>{isPro ? 'Unlimited generations \u00b7 Priority support \u00b7 All models' : '50 AI generations / day \u00b7 2 GB storage \u00b7 Community support'}</p>
      </div>
      <div className="p-4 rounded-xl mb-4" style={{ background: tk.bgElevated, border: `1px solid ${tk.border}` }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[13px] font-medium" style={{ color: tk.textPrimary }}>Credits</div>
            <div className="text-[11px] mt-0.5" style={{ color: tk.textMuted }}>Used for AI generations and media</div>
          </div>
          <div className="text-[22px] font-bold" style={{ color: tk.accent }}>{credits.toLocaleString()}</div>
        </div>
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: tk.border }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: tk.accent }} />
        </div>
      </div>
      {!isPro && (
        <button className="w-full py-3 rounded-xl font-semibold text-sm transition-colors hover:opacity-90"
          style={{ background: tk.accent, color: tk.accentText }}>
          Upgrade to Pro &mdash; $12/mo
        </button>
      )}
    </div>
  )
}

function DangerPanel({ tk }: { tk: ThemeTokens }) {
  const { clearMessages } = useAppStore()
  const [confirmDelete, setConfirmDelete] = useState(false)
  return (
    <div className="space-y-3">
      <div className="p-4 rounded-xl flex items-center justify-between" style={{ border: `1px solid ${tk.border}` }}>
        <div>
          <div className="text-[13px] font-medium" style={{ color: tk.textPrimary }}>Clear chat history</div>
          <div className="text-[11px] mt-0.5" style={{ color: tk.textMuted }}>Permanently deletes all conversations</div>
        </div>
        <button onClick={() => clearMessages()} className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors hover:opacity-80"
          style={{ border: `1px solid ${tk.border}`, color: tk.textSecondary }}>Clear</button>
      </div>
      <div className="p-4 rounded-xl" style={{ background: 'rgba(255,82,82,0.04)', border: '1px solid rgba(255,82,82,0.2)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[13px] font-semibold" style={{ color: '#FF5252' }}>Delete account</div>
            <div className="text-[11px] mt-0.5" style={{ color: tk.textMuted }}>This cannot be undone</div>
          </div>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="px-3 py-1.5 rounded-lg text-[12px] font-medium"
              style={{ background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.25)', color: '#FF5252' }}>Delete</button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg text-[12px]"
                style={{ border: `1px solid ${tk.border}`, color: tk.textSecondary }}>Cancel</button>
              <button className="px-3 py-1.5 rounded-lg text-[12px] font-semibold" style={{ background: '#FF5252', color: 'white' }}>Confirm</button>
            </div>
          )}
        </div>
        {confirmDelete && <p className="text-[11px]" style={{ color: 'rgba(255,82,82,0.7)' }}>Are you sure? All your data, chats, and assets will be permanently deleted.</p>}
      </div>
    </div>
  )
}
