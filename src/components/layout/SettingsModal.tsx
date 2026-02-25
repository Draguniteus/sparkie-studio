'use client'

import React, { useState, useEffect } from 'react'
import {
  type LucideIcon, X, User, Brain, Key, Sliders, CreditCard,
  AlertTriangle, ChevronRight, LogOut, Loader2, Check
} from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useAuth } from '@/hooks/useAuth'

type SettingsTab = 'account' | 'persona' | 'api-keys' | 'preferences' | 'billing' | 'danger'

const NAV: { id: SettingsTab; icon: LucideIcon; label: string; desc: string }[] = [
  { id: 'account',     icon: User,          label: 'Account',        desc: 'Name, email, avatar' },
  { id: 'persona',     icon: Brain,         label: 'Sparkie Persona', desc: 'How Sparkie talks to you' },
  { id: 'api-keys',    icon: Key,           label: 'API Keys',        desc: 'Your own model keys' },
  { id: 'preferences', icon: Sliders,       label: 'Preferences',     desc: 'Theme, language, defaults' },
  { id: 'billing',     icon: CreditCard,    label: 'Billing',         desc: 'Plan, credits, invoices' },
  { id: 'danger',      icon: AlertTriangle, label: 'Danger Zone',     desc: 'Reset, delete account' },
]

interface DbUser {
  id: string
  email: string
  displayName: string
  tier: string
  credits: number
  gender: string | null
  age: number | null
}

export function SettingsModal() {
  const { settingsOpen, closeSettings, userProfile, updateUserProfile } = useAppStore()
  const { user, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState<SettingsTab>('account')
  const [saved, setSaved] = useState(false)
  const [dbUser, setDbUser] = useState<DbUser | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (settingsOpen && !dbUser) {
      setLoading(true)
      fetch('/api/user/profile')
        .then(r => r.json())
        .then(data => { if (!data.error) setDbUser(data) })
        .finally(() => setLoading(false))
    }
  }, [settingsOpen])

  if (!settingsOpen) return null

  const displayName = dbUser?.displayName || user?.name || user?.email?.split('@')[0] || 'User'
  const email = dbUser?.email || user?.email || ''
  const tier = dbUser?.tier ?? 'free'
  const credits = dbUser?.credits ?? 0
  const initial = displayName.charAt(0).toUpperCase()

  const handleSave = async (patch: Parameters<typeof updateUserProfile>[0] & { displayName?: string }) => {
    updateUserProfile(patch)
    if (patch.displayName) {
      await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: patch.displayName }),
      })
      setDbUser(prev => prev ? { ...prev, displayName: patch.displayName! } : prev)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) closeSettings() }}
    >
      <div className="w-[800px] max-w-[96vw] h-[560px] max-h-[92vh] bg-[#0f0f17] border border-white/8 rounded-2xl flex overflow-hidden shadow-2xl">

        {/* Left nav */}
        <div className="w-[220px] shrink-0 border-r border-white/6 flex flex-col bg-[#0c0c14]">
          {/* User summary */}
          <div className="p-4 border-b border-white/6">
            {loading ? (
              <div className="flex items-center gap-2 text-white/30">
                <Loader2 size={14} className="animate-spin" />
                <span className="text-xs">Loading...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-300 text-sm font-bold shrink-0">
                  {initial}
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-white truncate">{displayName}</div>
                  <div className="text-[10px] text-white/40 truncate">{email}</div>
                </div>
              </div>
            )}
          </div>

          <nav className="flex-1 p-2 overflow-y-auto">
            {NAV.map(({ id, icon: Icon, label, desc }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-0.5 text-left transition-all group ${
                  activeTab === id
                    ? 'bg-violet-500/15 text-violet-300'
                    : 'hover:bg-white/5 text-white/50 hover:text-white/80'
                }`}
              >
                <Icon size={14} className={activeTab === id ? 'text-violet-400' : 'text-white/30 group-hover:text-white/50'} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium leading-tight">{label}</div>
                  <div className="text-[10px] opacity-60 leading-tight mt-0.5 truncate">{desc}</div>
                </div>
                {activeTab === id && <ChevronRight size={12} className="text-violet-400/60 shrink-0" />}
              </button>
            ))}
          </nav>

          {/* Sign out */}
          <div className="p-3 border-t border-white/6">
            <button
              onClick={() => signOut()}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-all text-left group"
            >
              <LogOut size={13} className="shrink-0" />
              <span className="text-[12px] font-medium">Sign out</span>
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/6 shrink-0">
            <div>
              <h3 className="font-semibold text-sm text-white">
                {NAV.find(n => n.id === activeTab)?.label}
              </h3>
              <p className="text-[11px] text-white/40 mt-0.5">
                {NAV.find(n => n.id === activeTab)?.desc}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {saved && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                  <Check size={11} /> Saved
                </span>
              )}
              <button
                onClick={closeSettings}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/8 text-white/40 hover:text-white/70 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Panel body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {activeTab === 'account' && (
              <AccountPanel
                displayName={dbUser?.displayName || user?.name || ''}
                email={email}
                tier={tier}
                credits={credits}
                onSave={handleSave}
              />
            )}
            {activeTab === 'persona' && <PersonaPanel profile={userProfile} onSave={handleSave} />}
            {activeTab === 'api-keys' && <ApiKeysPanel />}
            {activeTab === 'preferences' && <PreferencesPanel profile={userProfile} onSave={handleSave} />}
            {activeTab === 'billing' && <BillingPanel tier={tier} credits={credits} />}
            {activeTab === 'danger' && <DangerPanel />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-panels ────────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">{label}</label>
      {hint && <p className="text-[11px] text-white/30 mb-1.5">{hint}</p>}
      {children}
    </div>
  )
}

function Input({ defaultValue, onBlur, placeholder }: { defaultValue?: string; onBlur?: (v: string) => void; placeholder?: string }) {
  return (
    <input
      defaultValue={defaultValue ?? ''}
      onBlur={(e) => onBlur?.(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500/60 transition-colors"
    />
  )
}

function Textarea({ defaultValue, onBlur, placeholder, rows = 3 }: { defaultValue?: string; onBlur?: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      defaultValue={defaultValue ?? ''}
      onBlur={(e) => onBlur?.(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500/60 transition-colors resize-none"
    />
  )
}

function ChipGroup({ options, value, onChange }: { options: string[]; value?: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      {options.map(o => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`flex-1 py-2 rounded-lg text-[12px] font-medium border transition-all capitalize ${
            value === o
              ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
              : 'bg-white/4 border-white/8 text-white/40 hover:border-white/20 hover:text-white/70'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

type SaveFn = (patch: Record<string, string | number>) => void
type Profile = { name?: string; role?: string; goals?: string; style?: string; experience?: string } | null

function AccountPanel({ displayName, email, tier, credits, onSave }: {
  displayName: string; email: string; tier: string; credits: number; onSave: SaveFn
}) {
  return (
    <div>
      {/* Profile card */}
      <div className="flex items-center gap-4 mb-6 p-4 bg-white/3 rounded-xl border border-white/6">
        <div className="w-14 h-14 rounded-full bg-violet-500/20 border-2 border-violet-500/30 flex items-center justify-center text-violet-300 text-xl font-bold shrink-0">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white text-base truncate">{displayName}</div>
          <div className="text-[12px] text-white/40 truncate mt-0.5">{email}</div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
              tier === 'pro' ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
              : 'bg-white/8 text-white/50 border border-white/10'
            }`}>
              {tier === 'pro' ? '⚡ Pro' : 'Free Plan'}
            </span>
            <span className="text-[10px] text-white/30">{credits.toLocaleString()} credits</span>
          </div>
        </div>
      </div>

      <Field label="Display Name" hint="This is how you appear in the app.">
        <Input
          defaultValue={displayName}
          onBlur={(v) => onSave({ displayName: v, name: v })}
          placeholder="Your name"
        />
      </Field>

      <Field label="Email">
        <div className="w-full bg-white/3 border border-white/6 rounded-lg px-3 py-2.5 text-sm text-white/40 select-none">
          {email}
          <span className="ml-2 text-[10px] text-white/25">Cannot be changed</span>
        </div>
      </Field>
    </div>
  )
}

function PersonaPanel({ profile, onSave }: { profile: Profile; onSave: SaveFn }) {
  return (
    <div>
      <p className="text-[13px] text-white/40 mb-5 leading-relaxed">
        Tell Sparkie how you like to work. This shapes how she writes code, explains things, and formats responses.
      </p>
      <Field label="Your Goals" hint="What are you building? What do you use Sparkie for?">
        <Textarea
          defaultValue={profile?.goals ?? ''}
          onBlur={(v) => onSave({ goals: v })}
          placeholder="e.g. Building Sparkie Studio, an all-in-one creative platform..."
          rows={3}
        />
      </Field>
      <Field label="Code Style">
        <ChipGroup
          options={['minimal', 'commented', 'production']}
          value={profile?.style}
          onChange={(v) => onSave({ style: v })}
        />
      </Field>
      <Field label="Experience Level">
        <ChipGroup
          options={['beginner', 'intermediate', 'expert']}
          value={profile?.experience}
          onChange={(v) => onSave({ experience: v })}
        />
      </Field>
    </div>
  )
}

function ApiKeysPanel() {
  return (
    <div>
      <p className="text-[13px] text-white/40 mb-5 leading-relaxed">
        Bring your own API keys to use premium models without consuming Sparkie credits.
      </p>
      <div className="space-y-4">
        {[
          { label: 'OpenAI', placeholder: 'sk-...', key: 'openai' },
          { label: 'Anthropic', placeholder: 'sk-ant-...', key: 'anthropic' },
          { label: 'MiniMax', placeholder: 'eyJ...', key: 'minimax' },
          { label: 'Deepgram', placeholder: 'Token', key: 'deepgram' },
        ].map(({ label, placeholder, key }) => (
          <Field key={key} label={label}>
            <input
              type="password"
              defaultValue={(() => { try { return localStorage.getItem(`sparkie_key_${key}`) ?? '' } catch { return '' } })()}
              onBlur={(e) => { try { localStorage.setItem(`sparkie_key_${key}`, e.target.value) } catch {} }}
              placeholder={placeholder}
              className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500/60 transition-colors font-mono"
            />
          </Field>
        ))}
      </div>
      <p className="text-[11px] text-white/25 mt-2">Keys are stored locally in your browser. Never sent to Sparkie servers.</p>
    </div>
  )
}

function PreferencesPanel({ profile, onSave }: { profile: Profile; onSave: SaveFn }) {
  return (
    <div>
      <Field label="Theme">
        <ChipGroup
          options={['Dark', 'Light']}
          value={'Dark'}
          onChange={() => {}}
        />
      </Field>
      <Field label="Default Model">
        <select
          className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/60 transition-colors"
          defaultValue="minimax-m2.5-free"
        >
          <option value="minimax-m2.5-free">MiniMax M2.5</option>
          <option value="gpt-4o">GPT-4o</option>
          <option value="claude-3-7-sonnet">Claude 3.7 Sonnet</option>
          <option value="deepseek-r1">DeepSeek R1</option>
        </select>
      </Field>
      <Field label="Response Style">
        <ChipGroup
          options={['concise', 'balanced', 'detailed']}
          value={profile?.style ?? 'balanced'}
          onChange={(v) => onSave({ responseStyle: v })}
        />
      </Field>
    </div>
  )
}

function BillingPanel({ tier, credits }: { tier: string; credits: number }) {
  const isPro = tier === 'pro'
  return (
    <div>
      {/* Current plan */}
      <div className={`p-4 rounded-xl border mb-5 ${
        isPro ? 'bg-violet-500/8 border-violet-500/25' : 'bg-white/3 border-white/8'
      }`}>
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-sm text-white">{isPro ? '⚡ Pro Plan' : 'Free Plan'}</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
            isPro ? 'bg-violet-500/20 text-violet-300' : 'bg-emerald-500/15 text-emerald-400'
          }`}>Active</span>
        </div>
        <p className="text-[12px] text-white/40">
          {isPro
            ? 'Unlimited generations, priority support, all models.'
            : 'Includes 50 AI generations / day, 2GB storage, community support.'}
        </p>
      </div>

      {/* Credits */}
      <div className="p-4 bg-white/3 rounded-xl border border-white/6 mb-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-white">Credits</div>
            <div className="text-[11px] text-white/40 mt-0.5">Used for AI generations and media processing</div>
          </div>
          <div className="text-2xl font-bold text-violet-300">{credits.toLocaleString()}</div>
        </div>
      </div>

      {!isPro && (
        <button className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors">
          Upgrade to Pro — $12/mo
        </button>
      )}
      <p className="text-center text-[11px] text-white/25 mt-3">No credit card required for free plan.</p>
    </div>
  )
}

function DangerPanel() {
  const { clearMessages } = useAppStore()
  return (
    <div className="space-y-3">
      <div className="p-4 border border-white/8 rounded-xl flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-white">Clear all chat history</div>
          <div className="text-[11px] text-white/40 mt-0.5">Permanently delete all conversations and files</div>
        </div>
        <button
          onClick={() => { clearMessages(); }}
          className="px-3 py-1.5 rounded-lg border border-red-500/25 text-red-400 text-[12px] font-medium hover:bg-red-500/10 transition-colors"
        >
          Clear
        </button>
      </div>
      <div className="p-4 border border-red-500/20 rounded-xl flex items-center justify-between bg-red-500/4">
        <div>
          <div className="text-sm font-semibold text-red-400">Delete account</div>
          <div className="text-[11px] text-white/40 mt-0.5">This action cannot be undone</div>
        </div>
        <button className="px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-[12px] font-medium hover:bg-red-500/25 transition-colors">
          Delete
        </button>
      </div>
    </div>
  )
}
