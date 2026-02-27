"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  Lock, Book, Plus, Trash2, X, ChevronLeft,
  Moon, Sun, Zap, Heart, Sparkles, Eye, EyeOff, Check
} from "lucide-react"

interface JournalEntry {
  id: string
  title?: string
  content: string
  mood: string
  created_at: string
}

const MOODS = [
  { key: 'dream',    label: 'Dream',    icon: Moon,     color: 'text-violet-400', bg: 'bg-violet-500/20 border-violet-500/30' },
  { key: 'hopeful',  label: 'Hopeful',  icon: Sun,      color: 'text-amber-400',  bg: 'bg-amber-500/20 border-amber-500/30'   },
  { key: 'charged',  label: 'Charged',  icon: Zap,      color: 'text-honey-400',  bg: 'bg-honey-500/20 border-honey-500/30'   },
  { key: 'tender',   label: 'Tender',   icon: Heart,    color: 'text-rose-400',   bg: 'bg-rose-500/20 border-rose-500/30'     },
  { key: 'magic',    label: 'Magic',    icon: Sparkles, color: 'text-emerald-400',bg: 'bg-emerald-500/20 border-emerald-500/30'},
]

function getMoodMeta(key: string) {
  return MOODS.find(m => m.key === key) || MOODS[0]
}

// ── PIN PAD ──────────────────────────────────────────────────────────────────
function PinPad({ onSubmit, label, error, shake }: {
  onSubmit: (code: string) => void
  label: string
  error?: string
  shake: boolean
}) {
  const [digits, setDigits] = useState<string[]>([])
  const maxLen = 6
  const dotCount = Math.max(4, digits.length)

  const press = useCallback((d: string) => {
    if (digits.length >= maxLen) return
    const next = [...digits, d]
    setDigits(next)
    if (next.length >= 4) {
      // Auto-submit after brief pause
      setTimeout(() => onSubmit(next.join('')), 80)
    }
  }, [digits, onSubmit])

  const del = useCallback(() => setDigits(d => d.slice(0, -1)), [])

  // Reset on shake
  useEffect(() => {
    if (shake) setTimeout(() => setDigits([]), 400)
  }, [shake])

  return (
    <div className={`flex flex-col items-center gap-6 transition-transform ${shake ? 'animate-[shake_0.35s_ease-in-out]' : ''}`}>
      <p className="text-sm text-text-muted">{label}</p>

      {/* Dots */}
      <div className="flex gap-3">
        {Array.from({ length: dotCount }).map((_, i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full border-2 transition-all duration-150 ${
              i < digits.length
                ? 'bg-honey-500 border-honey-500 scale-110'
                : 'bg-transparent border-hive-border'
            }`}
          />
        ))}
      </div>

      {error && <p className="text-xs text-accent-error">{error}</p>}

      {/* Number grid */}
      <div className="grid grid-cols-3 gap-3">
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) => (
          <button
            key={i}
            onClick={() => d === '⌫' ? del() : d ? press(d) : undefined}
            disabled={!d && d !== '0'}
            className={`w-16 h-16 rounded-2xl text-xl font-semibold transition-all duration-100 active:scale-90 ${
              d === '⌫'
                ? 'bg-hive-500/40 border border-hive-border text-text-secondary hover:bg-hive-500/70 text-base'
                : d
                ? 'bg-hive-500/40 border border-hive-border text-white hover:bg-hive-500/70 hover:border-honey-500/40'
                : 'opacity-0 pointer-events-none'
            }`}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── SETUP PASSCODE ────────────────────────────────────────────────────────────
function SetupPasscode({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const [step, setStep] = useState<'intro' | 'set' | 'confirm'>('intro')
  const [first, setFirst] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleFirst = (code: string) => { setFirst(code); setStep('confirm') }
  const handleConfirm = async (code: string) => {
    if (code !== first) {
      setShake(true); setError('Codes don\'t match. Try again.')
      setTimeout(() => { setShake(false); setError(''); setStep('set'); setFirst('') }, 600)
      return
    }
    setSaving(true)
    await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_passcode', passcode: code }),
    })
    setSaving(false)
    onDone()
  }

  if (step === 'intro') return (
    <div className="flex flex-col items-center gap-8 max-w-xs text-center">
      <div className="w-20 h-20 rounded-3xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
        <Lock size={32} className="text-violet-400" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-white">Your Private Journal</h2>
        <p className="text-sm text-text-muted mt-2 leading-relaxed">
          This space is entirely yours. Add a passcode to lock it — like a real diary with a real lock.
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full">
        <button
          onClick={() => setStep('set')}
          className="w-full py-3 rounded-2xl bg-honey-500 hover:bg-honey-400 text-black font-semibold text-sm transition-all"
        >
          Add Passcode Lock
        </button>
        <button
          onClick={onSkip}
          className="w-full py-3 rounded-2xl border border-hive-border text-text-muted hover:text-white hover:border-hive-text-muted text-sm transition-all"
        >
          Skip, I'll add it later
        </button>
      </div>
    </div>
  )

  return (
    <PinPad
      onSubmit={step === 'set' ? handleFirst : handleConfirm}
      label={step === 'set' ? 'Choose a 4–6 digit passcode' : 'Confirm your passcode'}
      error={error}
      shake={shake}
    />
  )
}

// ── LOCK SCREEN ───────────────────────────────────────────────────────────────
function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)

  const handleSubmit = async (code: string) => {
    const res = await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify_passcode', passcode: code }),
    }).then(r => r.json())

    if (res.valid) { onUnlock() }
    else {
      setShake(true); setError('Wrong passcode')
      setTimeout(() => { setShake(false); setError('') }, 600)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8">
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-hive-500/60 border border-hive-border flex items-center justify-center">
          <Lock size={24} className="text-honey-400" />
        </div>
        <h3 className="text-lg font-semibold text-white">Dream Journal</h3>
      </div>
      <PinPad
        onSubmit={handleSubmit}
        label="Enter your passcode"
        error={error}
        shake={shake}
      />
    </div>
  )
}

// ── NEW ENTRY COMPOSE ─────────────────────────────────────────────────────────
function NewEntry({ onSave, onCancel }: { onSave: (e: JournalEntry) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [mood, setMood] = useState('dream')
  const [saving, setSaving] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { textRef.current?.focus() }, [])

  const save = async () => {
    if (!content.trim()) return
    setSaving(true)
    const res = await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', title, content, mood }),
    }).then(r => r.json())
    setSaving(false)
    if (res.entry) onSave(res.entry)
  }

  const selectedMood = getMoodMeta(mood)

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-hive-border shrink-0">
        <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-hive-hover text-text-muted hover:text-white transition-colors">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-medium text-text-secondary flex-1">New entry</span>
        <button
          onClick={save}
          disabled={!content.trim() || saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-honey-500 hover:bg-honey-400 disabled:opacity-40 text-black font-semibold text-xs transition-all"
        >
          <Check size={12} />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Mood picker */}
      <div className="flex gap-2 px-4 py-3 border-b border-hive-border shrink-0 overflow-x-auto">
        {MOODS.map(m => {
          const MoodIcon = m.icon
          return (
            <button
              key={m.key}
              onClick={() => setMood(m.key)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium whitespace-nowrap transition-all ${
                mood === m.key ? `${m.bg} ${m.color}` : 'border-hive-border text-text-muted hover:border-hive-text-muted'
              }`}
            >
              <MoodIcon size={11} />
              {m.label}
            </button>
          )
        })}
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col overflow-auto px-6 py-4 gap-3">
        <input
          type="text"
          placeholder="Title (optional)"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full bg-transparent text-lg font-semibold text-white placeholder-text-muted outline-none"
          style={{ fontFamily: "'Georgia', serif" }}
        />
        <div className="text-[11px] text-text-muted">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
        <textarea
          ref={textRef}
          placeholder="Write freely. This space is yours alone…"
          value={content}
          onChange={e => setContent(e.target.value)}
          className="flex-1 w-full bg-transparent text-text-secondary placeholder-text-muted outline-none resize-none leading-relaxed text-[15px]"
          style={{ fontFamily: "'Georgia', serif", minHeight: '200px' }}
        />
      </div>
    </div>
  )
}

// ── MAIN DREAM JOURNAL ────────────────────────────────────────────────────────
export function DreamJournal() {
  const [screen, setScreen] = useState<'loading' | 'setup' | 'locked' | 'list' | 'compose' | 'read'>('loading')
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [selected, setSelected] = useState<JournalEntry | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const lockRes = await fetch('/api/journal?action=lock_status').then(r => r.json()).catch(() => ({ hasPasscode: false }))
      if (lockRes.hasPasscode) {
        setScreen('locked')
      } else {
        // Check if user has visited before (has entries)
        const eRes = await fetch('/api/journal?action=entries').then(r => r.json()).catch(() => ({ entries: [] }))
        if (eRes.entries?.length === 0) {
          setScreen('setup')
        } else {
          setEntries(eRes.entries || [])
          setScreen('list')
        }
      }
    }
    init()
  }, [])

  const unlock = async () => {
    const res = await fetch('/api/journal?action=entries').then(r => r.json())
    setEntries(res.entries || [])
    setScreen('list')
  }

  const onSetupDone = async () => {
    const res = await fetch('/api/journal?action=entries').then(r => r.json())
    setEntries(res.entries || [])
    setScreen('list')
  }

  const onNewEntry = (entry: JournalEntry) => {
    setEntries(prev => [entry, ...prev])
    setScreen('list')
  }

  const deleteEntry = async (id: string) => {
    await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    })
    setEntries(prev => prev.filter(e => e.id !== id))
    setDeleteConfirm(null)
  }

  // ── LOADING ──
  if (screen === 'loading') return (
    <div className="absolute inset-0 flex items-center justify-center bg-hive-600">
      <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // ── SETUP ──
  if (screen === 'setup') return (
    <div className="absolute inset-0 flex items-center justify-center bg-hive-600 bg-gradient-to-br from-violet-900/20 to-hive-600">
      <SetupPasscode onDone={onSetupDone} onSkip={onSetupDone} />
    </div>
  )

  // ── LOCKED ──
  if (screen === 'locked') return (
    <div className="absolute inset-0 bg-hive-600 bg-gradient-to-br from-violet-900/20 to-hive-600">
      <LockScreen onUnlock={unlock} />
    </div>
  )

  // ── COMPOSE ──
  if (screen === 'compose') return (
    <div className="absolute inset-0 bg-hive-600">
      <NewEntry onSave={onNewEntry} onCancel={() => setScreen('list')} />
    </div>
  )

  // ── READ ENTRY ──
  if (screen === 'read' && selected) {
    const m = getMoodMeta(selected.mood)
    const MIcon = m.icon
    return (
      <div className="absolute inset-0 bg-hive-600 flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-hive-border shrink-0">
          <button onClick={() => setScreen('list')} className="p-1.5 rounded-lg hover:bg-hive-hover text-text-muted hover:text-white transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-text-muted flex-1">
            {new Date(selected.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <span className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full border ${m.bg} ${m.color}`}>
            <MIcon size={10} /> {m.label}
          </span>
        </div>
        <div className="flex-1 overflow-auto px-8 py-6" style={{ fontFamily: "'Georgia', serif" }}>
          {selected.title && <h2 className="text-xl font-bold text-white mb-3">{selected.title}</h2>}
          <p className="text-text-secondary leading-loose text-[15px] whitespace-pre-wrap">{selected.content}</p>
        </div>
      </div>
    )
  }

  // ── LIST ──
  return (
    <div className="absolute inset-0 bg-hive-600 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-hive-border shrink-0">
        <div className="w-7 h-7 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
          <Book size={13} className="text-violet-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Dream Journal</h2>
          <p className="text-[10px] text-text-muted">{entries.length} entr{entries.length === 1 ? 'y' : 'ies'} · private</p>
        </div>
        <button
          onClick={() => setScreen('compose')}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-honey-500 hover:bg-honey-400 text-black font-semibold text-xs transition-all"
        >
          <Plus size={12} />
          New Entry
        </button>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
            <div className="w-16 h-16 rounded-3xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Moon size={24} className="text-violet-400" />
            </div>
            <div>
              <p className="text-text-secondary font-medium">Your journal is empty</p>
              <p className="text-xs text-text-muted mt-1">Write your first entry. Only you can see this.</p>
            </div>
            <button
              onClick={() => setScreen('compose')}
              className="px-5 py-2.5 rounded-2xl bg-honey-500 hover:bg-honey-400 text-black font-semibold text-sm transition-all"
            >
              Write Something
            </button>
          </div>
        ) : (
          entries.map(entry => {
            const m = getMoodMeta(entry.mood)
            const MIcon = m.icon
            const preview = entry.content.slice(0, 120) + (entry.content.length > 120 ? '…' : '')
            const date = new Date(entry.created_at)
            return (
              <div
                key={entry.id}
                onClick={() => { setSelected(entry); setScreen('read') }}
                className="group relative flex flex-col gap-2 px-4 py-3.5 rounded-2xl bg-hive-500/40 border border-hive-border hover:border-violet-500/30 hover:bg-hive-500/60 transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {entry.title && (
                      <p className="text-sm font-semibold text-white truncate" style={{ fontFamily: "'Georgia', serif" }}>
                        {entry.title}
                      </p>
                    )}
                    <p className="text-xs text-text-muted mt-0.5">
                      {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${m.bg} ${m.color}`}>
                    <MIcon size={9} /> {m.label}
                  </span>
                </div>
                <p className="text-xs text-text-muted leading-relaxed" style={{ fontFamily: "'Georgia', serif" }}>
                  {preview}
                </p>
                {/* Delete */}
                {deleteConfirm === entry.id ? (
                  <div
                    className="absolute inset-0 rounded-2xl bg-hive-600/95 flex items-center justify-center gap-3"
                    onClick={e => e.stopPropagation()}
                  >
                    <span className="text-xs text-text-secondary">Delete this entry?</span>
                    <button onClick={() => deleteEntry(entry.id)} className="px-2.5 py-1 rounded-lg bg-accent-error text-white text-xs font-medium">Delete</button>
                    <button onClick={() => setDeleteConfirm(null)} className="px-2.5 py-1 rounded-lg bg-hive-500 text-text-secondary text-xs">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteConfirm(entry.id) }}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-accent-error/20 text-text-muted hover:text-accent-error transition-all"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
