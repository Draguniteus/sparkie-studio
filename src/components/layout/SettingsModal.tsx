'use client'

import React, { useState } from 'react'
import { X, User, Brain, Key, Sliders, CreditCard, AlertTriangle, ChevronRight } from 'lucide-react'
import { useAppStore } from '@/store/appStore'

type SettingsTab = 'account' | 'persona' | 'api-keys' | 'preferences' | 'billing' | 'danger'

const NAV: { id: SettingsTab; icon: React.ComponentType<{ size?: number; className?: string }>; label: string; desc: string }[] = [
  { id: 'account',     icon: User,          label: 'Account',         desc: 'Name, email, avatar' },
  { id: 'persona',     icon: Brain,         label: 'Sparkie Persona',  desc: 'How Sparkie talks to you' },
  { id: 'api-keys',    icon: Key,           label: 'API Keys',         desc: 'Your own model keys' },
  { id: 'preferences', icon: Sliders,       label: 'Preferences',      desc: 'Theme, language, defaults' },
  { id: 'billing',     icon: CreditCard,    label: 'Billing',          desc: 'Plan, credits, invoices' },
  { id: 'danger',      icon: AlertTriangle, label: 'Danger Zone',      desc: 'Reset, delete account' },
]

export function SettingsModal() {
  const { settingsOpen, closeSettings, userProfile, updateUserProfile } = useAppStore()
  const [activeTab, setActiveTab] = useState<SettingsTab>('account')
  const [saved, setSaved] = useState(false)

  if (!settingsOpen) return null

  const handleSave = (patch: Parameters<typeof updateUserProfile>[0]) => {
    updateUserProfile(patch)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) closeSettings() }}
    >
      <div className="w-[760px] max-w-[95vw] h-[540px] max-h-[90vh] bg-hive-700 border border-hive-border rounded-2xl flex overflow-hidden shadow-2xl">

        {/* Left nav */}
        <div className="w-[220px] shrink-0 border-r border-hive-border flex flex-col">
          <div className="p-4 border-b border-hive-border">
            <h2 className="font-semibold text-sm text-text-primary">Settings</h2>
            <p className="text-[11px] text-text-muted mt-0.5">Manage your Sparkie workspace</p>
          </div>
          <nav className="flex-1 p-2 overflow-y-auto">
            {NAV.map(({ id, icon: Icon, label, desc }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-0.5 text-left transition-colors group ${
                  activeTab === id
                    ? 'bg-honey-500/15 text-honey-500'
                    : 'hover:bg-hive-hover text-text-secondary hover:text-text-primary'
                }`}
              >
                <Icon size={14} className={activeTab === id ? 'text-honey-500' : 'text-text-muted group-hover:text-text-secondary'} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium leading-tight">{label}</div>
                  <div className="text-[10px] text-text-muted leading-tight mt-0.5 truncate">{desc}</div>
                </div>
                {activeTab === id && <ChevronRight size={12} className="text-honey-500/60 shrink-0" />}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-hive-border shrink-0">
            <h3 className="font-semibold text-sm text-text-primary">
              {NAV.find(n => n.id === activeTab)?.label}
            </h3>
            <div className="flex items-center gap-2">
              {saved && (
                <span className="text-[11px] text-[#22c55e] font-medium animate-fade-in">Saved ✓</span>
              )}
              <button
                onClick={closeSettings}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Panel body */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'account' && (
              <AccountPanel profile={userProfile} onSave={handleSave} />
            )}
            {activeTab === 'persona' && (
              <PersonaPanel profile={userProfile} onSave={handleSave} />
            )}
            {activeTab === 'api-keys' && <ApiKeysPanel />}
            {activeTab === 'preferences' && <PreferencesPanel />}
            {activeTab === 'billing' && <BillingPanel />}
            {activeTab === 'danger' && <DangerPanel />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-panels ────────────────────────────────────────────────────────────────

type Profile = { name?: string; role?: string; goals?: string; style?: string; experience?: string } | null
type SaveFn = (patch: Partial<NonNullable<Profile>>) => void

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label className="block text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">{label}</label>
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
      className="w-full bg-hive-elevated border border-hive-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-honey-500/60 transition-colors"
    />
  )
}

function AccountPanel({ profile, onSave }: { profile: Profile; onSave: SaveFn }) {
  return (
    <div>
      <div className="flex items-center gap-4 mb-6 p-4 bg-hive-elevated rounded-xl border border-hive-border">
        <div className="w-12 h-12 rounded-full bg-honey-500/20 flex items-center justify-center text-honey-500 text-lg font-bold shrink-0">
          {(profile?.name?.[0] ?? 'D').toUpperCase()}
        </div>
        <div>
          <div className="font-semibold text-text-primary text-sm">{profile?.name ?? 'Draguniteus'}</div>
          <div className="text-[11px] text-text-muted">draguniteus@gmail.com</div>
          <div className="text-[10px] mt-1 px-1.5 py-0.5 rounded-full bg-honey-500/10 text-honey-500 inline-block font-medium">Free Plan</div>
        </div>
      </div>
      <Field label="Display Name">
        <Input defaultValue={profile?.name ?? 'Draguniteus'} onBlur={(v) => onSave({ name: v })} placeholder="Your name" />
      </Field>
      <Field label="Role / Title">
        <Input defaultValue={profile?.role} onBlur={(v) => onSave({ role: v })} placeholder="e.g. Indie developer, Designer, Student" />
      </Field>
    </div>
  )
}

function PersonaPanel({ profile, onSave }: { profile: Profile; onSave: SaveFn }) {
  return (
    <div>
      <p className="text-[13px] text-text-muted mb-5 leading-relaxed">
        Tell Sparkie how you like to work. This shapes how she writes code, explains things, and formats responses.
      </p>
      <Field label="Your Goals">
        <textarea
          defaultValue={profile?.goals ?? ''}
          onBlur={(e) => onSave({ goals: e.target.value })}
          placeholder="What are you building? What do you use Sparkie for?"
          rows={3}
          className="w-full bg-hive-elevated border border-hive-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-honey-500/60 transition-colors resize-none"
        />
      </Field>
      <Field label="Code Style">
        <div className="flex gap-2">
          {['minimal', 'commented', 'production'].map(s => (
            <button
              key={s}
              onClick={() => onSave({ style: s })}
              className={`flex-1 py-2 rounded-lg text-[12px] font-medium border transition-colors capitalize ${
                profile?.style === s
                  ? 'bg-honey-500/15 border-honey-500/40 text-honey-500'
                  : 'bg-hive-elevated border-hive-border text-text-secondary hover:border-honey-500/30 hover:text-text-primary'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Experience Level">
        <div className="flex gap-2">
          {['beginner', 'intermediate', 'expert'].map(s => (
            <button
              key={s}
              onClick={() => onSave({ experience: s })}
              className={`flex-1 py-2 rounded-lg text-[12px] font-medium border transition-colors capitalize ${
                profile?.experience === s
                  ? 'bg-honey-500/15 border-honey-500/40 text-honey-500'
                  : 'bg-hive-elevated border-hive-border text-text-secondary hover:border-honey-500/30 hover:text-text-primary'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </Field>
    </div>
  )
}

function ApiKeysPanel() {
  return (
    <div>
      <p className="text-[13px] text-text-muted mb-5 leading-relaxed">
        Bring your own API keys to use premium models without consuming Sparkie credits.
      </p>
      {[
        { label: 'OpenAI', placeholder: 'sk-...' },
        { label: 'Anthropic', placeholder: 'sk-ant-...' },
        { label: 'MiniMax', placeholder: 'eyJ...' },
        { label: 'Deepgram', placeholder: 'Token' },
      ].map(({ label, placeholder }) => (
        <Field key={label} label={label}>
          <Input placeholder={placeholder} />
        </Field>
      ))}
      <p className="text-[11px] text-text-muted mt-2">Keys are stored locally in your browser. Never sent to Sparkie servers.</p>
    </div>
  )
}

function PreferencesPanel() {
  return (
    <div>
      <Field label="Theme">
        <div className="flex gap-2">
          {['Dark', 'Light'].map(t => (
            <button
              key={t}
              className={`flex-1 py-2 rounded-lg text-[12px] font-medium border transition-colors ${
                t === 'Dark'
                  ? 'bg-honey-500/15 border-honey-500/40 text-honey-500'
                  : 'bg-hive-elevated border-hive-border text-text-secondary hover:border-honey-500/30'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Default Model">
        <select className="w-full bg-hive-elevated border border-hive-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-honey-500/60 transition-colors">
          <option>MiniMax M2.5</option>
          <option>GPT-4o</option>
          <option>Claude 3.7 Sonnet</option>
          <option>DeepSeek R1</option>
        </select>
      </Field>
    </div>
  )
}

function BillingPanel() {
  return (
    <div>
      <div className="p-4 bg-honey-500/5 border border-honey-500/20 rounded-xl mb-5">
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-sm text-text-primary">Free Plan</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-honey-500/15 text-honey-500 font-medium">Active</span>
        </div>
        <p className="text-[12px] text-text-muted">Includes 50 AI generations / day, 2GB storage, community support.</p>
      </div>
      <button className="w-full py-2.5 rounded-xl bg-honey-500 text-black font-semibold text-sm hover:bg-honey-400 transition-colors">
        Upgrade to Pro — $12/mo
      </button>
      <p className="text-center text-[11px] text-text-muted mt-3">No credit card required for free plan.</p>
    </div>
  )
}

function DangerPanel() {
  return (
    <div>
      <div className="space-y-3">
        <div className="p-4 border border-red-500/20 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-text-primary">Clear all chat history</div>
            <div className="text-[11px] text-text-muted mt-0.5">Permanently delete all conversations and files</div>
          </div>
          <button className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-[12px] font-medium hover:bg-red-500/10 transition-colors">
            Clear
          </button>
        </div>
        <div className="p-4 border border-red-500/20 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-text-primary">Reset onboarding</div>
            <div className="text-[11px] text-text-muted mt-0.5">Run the setup interview again</div>
          </div>
          <button className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-[12px] font-medium hover:bg-red-500/10 transition-colors">
            Reset
          </button>
        </div>
        <div className="p-4 border border-red-500/30 rounded-xl flex items-center justify-between bg-red-500/5">
          <div>
            <div className="text-sm font-semibold text-red-400">Delete account</div>
            <div className="text-[11px] text-text-muted mt-0.5">This action cannot be undone</div>
          </div>
          <button className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-[12px] font-medium hover:bg-red-500/30 transition-colors">
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
