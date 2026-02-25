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
  document.documentElement.classList.remove('dark', 'light')
  document.documentElement.classList.add(t)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) closeSettings() }}>
      <div className="w-[820px] max-w-[96vw] h-[580px] max-h-[92vh] bg-[#0f0f17] border border-white/10 rounded-2xl flex overflow-hidden shadow-2xl">
        {/* Left nav */}
        <div className="w-[220px] shrink-0 border-r border-white/8 flex flex-col bg-[#0c0c14]">
          <div className="p-4 border-b border-white/8">
            {loading ? (
              <div className="flex items-center gap-2 text-white/40"><Loader2 size={14} className="animate-spin" /><span className="text-xs">Loading...</span></div>
            ) : (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-violet-500/20 border border-violet-500/40 flex items-center justify-center text-violet-300 text-sm font-bold shrink-0">{initial}</div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-white truncate leading-tight">{displayName}</div>
                  <div className="text-[10px] text-white/50 truncate leading-tight mt-0.5">{email}</div>
                </div>
              </div>
            )}
          </div>
          <nav className="flex-1 p-2 overflow-y-auto">
            {NAV.map(({ id, icon: Icon, label, desc }) => (
              <button key={id} onClick={() => setActiveTab(id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-0.5 text-left transition-all group ${activeTab === id ? 'bg-violet-500/15 text-violet-300' : 'hover:bg-white/5 text-white/60 hover:text-white'}`}>
                <Icon size={14} className={activeTab === id ? 'text-violet-400 shrink-0' : 'text-white/35 group-hover:text-white/60 shrink-0'} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium leading-tight">{label}</div>
                  <div className={`text-[10px] leading-tight mt-0.5 truncate ${activeTab === id ? 'text-violet-300/60' : 'text-white/35'}`}>{desc}</div>
                </div>
                {activeTab === id && <ChevronRight size={11} className="text-violet-400/60 shrink-0" />}
              </button>
            ))}
          </nav>
          <div className="p-3 border-t border-white/8">
            <button onClick={() => signOut()} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-red-500/10 text-white/45 hover:text-red-400 transition-all text-left">
              <LogOut size={13} className="shrink-0" /><span className="text-[12px] font-medium">Sign out</span>
            </button>
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 shrink-0">
            <div>
              <h3 className="font-semibold text-[14px] text-white leading-tight">{NAV.find(n => n.id === activeTab)?.label}</h3>
              <p className="text-[11px] text-white/45 mt-0.5">{NAV.find(n => n.id === activeTab)?.desc}</p>
            </div>
            <div className="flex items-center gap-2">
              {saved && <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium"><Check size={11} /> Saved</span>}
              <button onClick={closeSettings} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/8 text-white/45 hover:text-white/80 transition-colors"><X size={14} /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {activeTab === 'account' && <AccountPanel displayName={displayName} email={email} tier={tier} credits={credits} onSave={handleSaveProfile} />}
            {activeTab === 'persona' && <PersonaPanel profile={userProfile} onSave={handleSaveProfile} />}
            {activeTab === 'api-keys' && <ApiKeysPanel />}
            {activeTab === 'preferences' && <PreferencesPanel prefs={prefs} onChange={handlePrefsChange} />}
            {activeTab === 'notifications' && <NotificationsPanel prefs={prefs} onChange={handlePrefsChange} />}
            {activeTab === 'billing' && <BillingPanel tier={tier} credits={credits} />}
            {activeTab === 'danger' && <DangerPanel />}
          </div>
        </div>
      </div>
    </div>
  )
}

// Primitives
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label className="block text-[11px] font-semibold text-white/55 uppercase tracking-wider mb-1.5">{label}</label>
      {hint && <p className="text-[11px] text-white/40 mb-2 leading-relaxed">{hint}</p>}
      {children}
    </div>
  )
}
function TextInput({ defaultValue, onBlur, placeholder }: { defaultValue?: string; onBlur?: (v: string) => void; placeholder?: string }) {
  return <input defaultValue={defaultValue ?? ''} onBlur={(e) => onBlur?.(e.target.value)} placeholder={placeholder} className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/60 focus:bg-white/8 transition-all" />
}
function TextArea({ defaultValue, onBlur, placeholder, rows = 3 }: { defaultValue?: string; onBlur?: (v: string) => void; placeholder?: string; rows?: number }) {
  return <textarea defaultValue={defaultValue ?? ''} onBlur={(e) => onBlur?.(e.target.value)} placeholder={placeholder} rows={rows} className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/60 transition-all resize-none" />
}
function ChipGroup({ options, value, onChange }: { options: { value: string; label: string }[]; value?: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} className={`px-3 py-2 rounded-lg text-[12px] font-medium border transition-all ${value === o.value ? 'bg-violet-500/20 border-violet-500/50 text-violet-200' : 'bg-white/5 border-white/10 text-white/55 hover:border-white/25 hover:text-white/80'}`}>{o.label}</button>
      ))}
    </div>
  )
}

// Custom dark dropdown - no native select, no white bg
function DarkSelect({ options, value, onChange }: { options: { value: string; label: string; badge?: string | null }[]; value: string; onChange: (v: string) => void }) {
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
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between bg-white/6 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white hover:border-white/20 focus:outline-none focus:border-violet-500/60 transition-all">
        <div className="flex items-center gap-2">
          <span>{selected?.label}</span>
          {selected?.badge && <span className="text-[10px] px-1.5 py-0.5 bg-violet-500/20 text-violet-300 rounded font-medium">{selected.badge}</span>}
        </div>
        <ChevronDown size={14} className={`text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#13131e] border border-white/12 rounded-xl shadow-2xl z-[100] overflow-hidden">
          {options.map(opt => (
            <button key={opt.value} type="button" onClick={() => { onChange(opt.value); setOpen(false) }} className={`w-full flex items-center justify-between px-3 py-2.5 text-sm text-left transition-colors ${opt.value === value ? 'bg-violet-500/15 text-violet-200' : 'text-white/70 hover:bg-white/6 hover:text-white'}`}>
              <span>{opt.label}</span>
              {opt.badge && <span className="text-[10px] px-1.5 py-0.5 bg-white/8 text-white/50 rounded font-medium">{opt.badge}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Toggle({ enabled, onChange, label, desc }: { enabled: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/6 last:border-0">
      <div>
        <div className="text-[13px] text-white font-medium">{label}</div>
        {desc && <div className="text-[11px] text-white/40 mt-0.5">{desc}</div>}
      </div>
      <button type="button" onClick={() => onChange(!enabled)} className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ml-4 ${enabled ? 'bg-violet-500' : 'bg-white/15'}`}>
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}

// Panels
function AccountPanel({ displayName, email, tier, credits, onSave }: { displayName: string; email: string; tier: string; credits: number; onSave: (p: Record<string, string>) => void }) {
  return (
    <div>
      <div className="flex items-center gap-4 mb-6 p-4 bg-white/4 rounded-xl border border-white/8">
        <div className="w-12 h-12 rounded-full bg-violet-500/20 border-2 border-violet-500/30 flex items-center justify-center text-violet-300 text-lg font-bold shrink-0">{displayName.charAt(0).toUpperCase()}</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white text-[15px] truncate">{displayName}</div>
          <div className="text-[12px] text-white/50 truncate mt-0.5">{email}</div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${tier === 'pro' ? 'bg-violet-500/20 text-violet-300 border-violet-500/30' : 'bg-white/8 text-white/55 border-white/12'}`}>{tier === 'pro' ? '\u26a1 Pro' : 'Free Plan'}</span>
            <span className="text-[10px] text-white/35">{credits.toLocaleString()} credits</span>
          </div>
        </div>
      </div>
      <Field label="Display Name" hint="How you appear across the platform.">
        <TextInput defaultValue={displayName} onBlur={(v) => onSave({ displayName: v, name: v })} placeholder="Your name" />
      </Field>
      <Field label="Email">
        <div className="w-full bg-white/3 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-white/55 flex items-center justify-between">
          <span>{email}</span><span className="text-[10px] text-white/30 ml-2 shrink-0">Cannot be changed</span>
        </div>
      </Field>
    </div>
  )
}

function PersonaPanel({ profile, onSave }: { profile: { goals?: string; style?: string; experience?: string } | null; onSave: (p: Record<string, string>) => void }) {
  return (
    <div>
      <p className="text-[13px] text-white/50 mb-5 leading-relaxed">Tell Sparkie how you like to work \u2014 this shapes her code style, explanations, and tone.</p>
      <Field label="Your Goals" hint="What are you building? What do you use Sparkie for?">
        <TextArea defaultValue={profile?.goals ?? ''} onBlur={(v) => onSave({ goals: v })} placeholder="e.g. Building Sparkie Studio, an all-in-one creative AI platform..." rows={3} />
      </Field>
      <Field label="Code Style">
        <ChipGroup options={[{ value: 'minimal', label: 'Minimal' }, { value: 'commented', label: 'Commented' }, { value: 'production', label: 'Production' }]} value={profile?.style} onChange={(v) => onSave({ style: v })} />
      </Field>
      <Field label="Experience Level">
        <ChipGroup options={[{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'expert', label: 'Expert' }]} value={profile?.experience} onChange={(v) => onSave({ experience: v })} />
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
      <p className="text-[13px] text-white/50 mb-5 leading-relaxed">Bring your own keys to use premium models without spending Sparkie credits.</p>
      <div className="space-y-3">
        {keys.map(({ label, placeholder, key }) => (
          <Field key={key} label={label}>
            <input type="password" defaultValue={(() => { try { return localStorage.getItem(`sparkie_key_${key}`) ?? '' } catch { return '' } })()} onBlur={(e) => { try { localStorage.setItem(`sparkie_key_${key}`, e.target.value) } catch {} }} placeholder={placeholder} className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/60 transition-all font-mono" />
          </Field>
        ))}
      </div>
      <p className="text-[11px] text-white/30 mt-2">Keys stored locally in your browser only \u2014 never sent to Sparkie servers.</p>
    </div>
  )
}

function PreferencesPanel({ prefs, onChange }: { prefs: Prefs; onChange: (p: Partial<Prefs>) => void }) {
  return (
    <div>
      <Field label="Theme">
        <div className="flex gap-2">
          <button type="button" onClick={() => onChange({ theme: 'dark' })} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-[13px] font-medium transition-all ${prefs.theme === 'dark' ? 'bg-violet-500/20 border-violet-500/50 text-violet-200' : 'bg-white/5 border-white/10 text-white/55 hover:border-white/20 hover:text-white'}`}><Moon size={13} /> Dark</button>
          <button type="button" onClick={() => onChange({ theme: 'light' })} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-[13px] font-medium transition-all ${prefs.theme === 'light' ? 'bg-amber-500/20 border-amber-500/50 text-amber-200' : 'bg-white/5 border-white/10 text-white/55 hover:border-white/20 hover:text-white'}`}><Sun size={13} /> Light</button>
        </div>
      </Field>
      <Field label="Language">
        <DarkSelect options={LANGUAGES} value={prefs.language} onChange={(v) => onChange({ language: v })} />
      </Field>
      <Field label="Default AI Model">
        <DarkSelect options={SPARKIE_MODELS} value={prefs.defaultModel} onChange={(v) => onChange({ defaultModel: v })} />
      </Field>
      <Field label="Response Style">
        <ChipGroup options={[{ value: 'concise', label: 'Concise' }, { value: 'balanced', label: 'Balanced' }, { value: 'detailed', label: 'Detailed' }]} value={prefs.responseStyle} onChange={(v) => onChange({ responseStyle: v as Prefs['responseStyle'] })} />
      </Field>
    </div>
  )
}

function NotificationsPanel({ prefs, onChange }: { prefs: Prefs; onChange: (p: Partial<Prefs>) => void }) {
  const { notifications: n } = prefs
  const setN = (patch: Partial<Prefs['notifications']>) => onChange({ notifications: { ...n, ...patch } })
  return (
    <div>
      <p className="text-[13px] text-white/50 mb-4 leading-relaxed">Control which alerts Sparkie sends you.</p>
      <div className="bg-white/3 rounded-xl border border-white/8 px-4">
        <Toggle enabled={n.emailAlerts} onChange={(v) => setN({ emailAlerts: v })} label="Email Alerts" desc="Important account and security notifications" />
        <Toggle enabled={n.creditWarning} onChange={(v) => setN({ creditWarning: v })} label="Credit Warning" desc="Alert when your credits drop below 10%" />
        <Toggle enabled={n.productUpdates} onChange={(v) => setN({ productUpdates: v })} label="Product Updates" desc="New features, models, and announcements" />
      </div>
    </div>
  )
}

function BillingPanel({ tier, credits }: { tier: string; credits: number }) {
  const isPro = tier === 'pro'
  const pct = Math.min((credits / 1000) * 100, 100)
  return (
    <div>
      <div className={`p-4 rounded-xl border mb-4 ${isPro ? 'bg-violet-500/8 border-violet-500/25' : 'bg-white/3 border-white/8'}`}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-semibold text-[14px] text-white">{isPro ? '\u26a1 Pro Plan' : 'Free Plan'}</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${isPro ? 'bg-violet-500/20 text-violet-300 border-violet-500/25' : 'bg-emerald-500/12 text-emerald-400 border-emerald-500/20'}`}>Active</span>
        </div>
        <p className="text-[12px] text-white/45">{isPro ? 'Unlimited generations \u00b7 Priority support \u00b7 All models' : '50 AI generations / day \u00b7 2 GB storage \u00b7 Community support'}</p>
      </div>
      <div className="p-4 bg-white/3 rounded-xl border border-white/8 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div><div className="text-[13px] font-medium text-white">Credits</div><div className="text-[11px] text-white/40 mt-0.5">Used for AI generations and media</div></div>
          <div className="text-[22px] font-bold text-violet-300">{credits.toLocaleString()}</div>
        </div>
        <div className="w-full h-1.5 bg-white/8 rounded-full overflow-hidden">
          <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {!isPro && <button className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors">Upgrade to Pro \u2014 $12/mo</button>}
    </div>
  )
}

function DangerPanel() {
  const { clearMessages } = useAppStore()
  const [confirmDelete, setConfirmDelete] = useState(false)
  return (
    <div className="space-y-3">
      <div className="p-4 border border-white/8 rounded-xl flex items-center justify-between">
        <div><div className="text-[13px] font-medium text-white">Clear chat history</div><div className="text-[11px] text-white/40 mt-0.5">Permanently deletes all conversations</div></div>
        <button onClick={() => clearMessages()} className="px-3 py-1.5 rounded-lg border border-white/12 text-white/55 text-[12px] font-medium hover:bg-white/6 hover:text-white transition-colors">Clear</button>
      </div>
      <div className="p-4 border border-red-500/20 rounded-xl bg-red-500/4">
        <div className="flex items-center justify-between mb-3">
          <div><div className="text-[13px] font-semibold text-red-400">Delete account</div><div className="text-[11px] text-white/40 mt-0.5">This cannot be undone</div></div>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="px-3 py-1.5 rounded-lg bg-red-500/12 border border-red-500/25 text-red-400 text-[12px] font-medium hover:bg-red-500/20 transition-colors">Delete</button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg border border-white/12 text-white/55 text-[12px] hover:bg-white/6 transition-colors">Cancel</button>
              <button className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-[12px] font-semibold hover:bg-red-600 transition-colors">Confirm</button>
            </div>
          )}
        </div>
        {confirmDelete && <p className="text-[11px] text-red-400/70">Are you sure? All your data, chats, and assets will be permanently deleted.</p>}
      </div>
    </div>
  )
}
