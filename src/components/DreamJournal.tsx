"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  Lock, Book, Plus, Trash2, ChevronLeft,
  Moon, Target, Sparkles, StickyNote,
  Star, Check, Bold, Italic, List, ListOrdered,
  Pencil
} from "lucide-react"

// ── TYPES ────────────────────────────────────────────────────────────────────
interface JournalEntry {
  id: string
  title?: string
  content: string
  category: string
  mood?: string
  created_at: string
}

// ── CATEGORIES ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  {
    key: 'night_dreams',
    label: 'Night Dreams',
    icon: Moon,
    color: 'text-violet-400',
    bg: 'bg-violet-500/20',
    border: 'border-violet-500/40',
    activeBorder: 'border-violet-400',
    glow: 'shadow-violet-500/20',
    gradient: 'from-violet-900/30 to-transparent',
    emptyIcon: Moon,
    emptyTitle: 'No dreams recorded yet',
    emptyText: 'Capture last night\'s dream before it fades away.',
    emptyAction: 'Record a Dream',
    description: 'Dreams from sleep',
    renameable: false,
  },
  {
    key: 'vision_board',
    label: 'Vision Board',
    icon: Sparkles,
    color: 'text-amber-400',
    bg: 'bg-amber-500/20',
    border: 'border-amber-500/40',
    activeBorder: 'border-amber-400',
    glow: 'shadow-amber-500/20',
    gradient: 'from-amber-900/20 to-transparent',
    emptyIcon: Sparkles,
    emptyTitle: 'Your vision awaits',
    emptyText: 'Write the life you\'re building. Desires, manifestations, what you\'re calling in.',
    emptyAction: 'Paint Your Vision',
    description: 'Desires & manifestations',
    renameable: false,
  },
  {
    key: 'goals',
    label: 'Goals & Milestones',
    icon: Target,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/20',
    border: 'border-emerald-500/40',
    activeBorder: 'border-emerald-400',
    glow: 'shadow-emerald-500/20',
    gradient: 'from-emerald-900/20 to-transparent',
    emptyIcon: Target,
    emptyTitle: 'Locked and loaded',
    emptyText: 'Drop your goals, milestones, and wins here. Track what you\'re determined to hit.',
    emptyAction: 'Set a Goal',
    description: 'Goals & accomplishments',
    renameable: false,
  },
  {
    key: 'custom',
    label: 'Notes',
    icon: StickyNote,
    color: 'text-sky-400',
    bg: 'bg-sky-500/20',
    border: 'border-sky-500/40',
    activeBorder: 'border-sky-400',
    glow: 'shadow-sky-500/20',
    gradient: 'from-sky-900/20 to-transparent',
    emptyIcon: StickyNote,
    emptyTitle: 'Blank canvas',
    emptyText: 'Anything that doesn\'t fit elsewhere. Tap the pencil to rename this category.',
    emptyAction: 'Write a Note',
    description: 'Your custom space',
    renameable: true,
  },
]

function getCat(key: string) {
  return CATEGORIES.find(c => c.key === key) || CATEGORIES[0]
}

// ── MARKDOWN RENDERER ─────────────────────────────────────────────────────────
function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
  // bullet lists
  const lines = html.split('\n')
  const out: string[] = []
  let inUl = false
  let inOl = false
  for (const line of lines) {
    const ulMatch = line.match(/^- (.+)/)
    const olMatch = line.match(/^\d+\. (.+)/)
    if (ulMatch) {
      if (!inUl) { if (inOl) { out.push('</ol>'); inOl = false } out.push('<ul class="my-2 ml-4 space-y-1 list-disc">'); inUl = true }
      out.push('<li class="text-text-secondary leading-relaxed">' + ulMatch[1] + '</li>')
    } else if (olMatch) {
      if (!inOl) { if (inUl) { out.push('</ul>'); inUl = false } out.push('<ol class="my-2 ml-4 space-y-1 list-decimal">'); inOl = true }
      out.push('<li class="text-text-secondary leading-relaxed">' + olMatch[1] + '</li>')
    } else {
      if (inUl) { out.push('</ul>'); inUl = false }
      if (inOl) { out.push('</ol>'); inOl = false }
      out.push(line === '' ? '<br/>' : '<p class="leading-relaxed mb-2">' + line + '</p>')
    }
  }
  if (inUl) out.push('</ul>')
  if (inOl) out.push('</ol>')
  return out.join('\n')
}

// ── PIN PAD ───────────────────────────────────────────────────────────────────
function PinPad({ onSubmit, label, error, shake }: {
  onSubmit: (code: string) => void
  label: string
  error?: string
  shake: boolean
}) {
  const [digits, setDigits] = useState<string[]>([])
  const maxLen = 6

  const press = useCallback((d: string) => {
    setDigits(prev => {
      if (prev.length >= maxLen) return prev
      const next = [...prev, d]
      if (next.length >= 4) setTimeout(() => onSubmit(next.join('')), 80)
      return next
    })
  }, [onSubmit])

  const del = useCallback(() => setDigits(d => d.slice(0, -1)), [])

  const submit = useCallback(() => {
    setDigits(prev => {
      if (prev.length >= 4) onSubmit(prev.join(''))
      return prev
    })
  }, [onSubmit])

  // Full keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        setDigits(prev => {
          if (prev.length >= maxLen) return prev
          const next = [...prev, e.key]
          if (next.length >= 4) setTimeout(() => onSubmit(next.join('')), 80)
          return next
        })
      } else if (e.key === 'Backspace') {
        setDigits(d => d.slice(0, -1))
      } else if (e.key === 'Enter') {
        setDigits(prev => {
          if (prev.length >= 4) onSubmit(prev.join(''))
          return prev
        })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onSubmit])

  // Reset on shake
  useEffect(() => {
    if (shake) setTimeout(() => setDigits([]), 400)
  }, [shake])

  const dotCount = Math.max(4, digits.length)

  // Layout: 1-9 normal, row4 = [DEL, 0, ENTER]
  const topKeys = ['1','2','3','4','5','6','7','8','9']

  return (
    <div className={`flex flex-col items-center gap-7 transition-transform ${shake ? 'animate-[shake_0.35s_ease-in-out]' : ''}`}>
      <p className="text-[11px] text-white/40 tracking-widest uppercase">{label}</p>

      {/* Dots with glow */}
      <div className="flex gap-4">
        {Array.from({ length: dotCount }).map((_, i) => (
          <div
            key={i}
            className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-200 ${
              i < digits.length
                ? 'bg-violet-400 border-violet-400 scale-110 shadow-[0_0_10px_rgba(167,139,250,0.9)]' 
                : 'bg-transparent border-white/20'
            }`}
          />
        ))}
      </div>

      {error && (
        <p className="text-xs text-red-400 -mt-3">{error}</p>
      )}

      {/* Number grid 3x3 */}
      <div className="grid grid-cols-3 gap-3">
        {topKeys.map(k => (
          <button
            key={k}
            onClick={() => press(k)}
            className="w-[4.5rem] h-[4.5rem] rounded-2xl bg-white/6 border border-white/10 text-white text-xl font-light hover:bg-white/12 hover:border-violet-400/40 active:scale-90 transition-all duration-100"
          >
            {k}
          </button>
        ))}
      </div>

      {/* Bottom row: DEL | 0 | ENTER */}
      <div className="grid grid-cols-3 gap-3">
        {/* DEL — left */}
        <button
          onClick={del}
          className="w-[4.5rem] h-[4.5rem] rounded-2xl bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white active:scale-90 transition-all duration-100 flex items-center justify-center"
          title="Delete"
        >
          <svg width="24" height="18" viewBox="0 0 24 18" fill="none">
            <path d="M9 1L2 9l7 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 9h22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="15" y1="5" x2="21" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="21" y1="5" x2="15" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
        {/* 0 — center */}
        <button
          onClick={() => press('0')}
          className="w-[4.5rem] h-[4.5rem] rounded-2xl bg-white/6 border border-white/10 text-white text-xl font-light hover:bg-white/12 hover:border-violet-400/40 active:scale-90 transition-all duration-100"
        >
          0
        </button>
        {/* ENTER — right */}
        <button
          onClick={submit}
          disabled={digits.length < 4}
          title="Enter"
          className="w-[4.5rem] h-[4.5rem] rounded-2xl bg-violet-500/25 border border-violet-400/50 text-violet-300 hover:bg-violet-500/45 hover:border-violet-300 active:scale-90 disabled:opacity-25 disabled:pointer-events-none transition-all duration-100 flex items-center justify-center"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M4 11l5.5 5.5L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
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

  const handleFirst = (code: string) => { setFirst(code); setStep('confirm') }
  const handleConfirm = async (code: string) => {
    if (code !== first) {
      setShake(true); setError('Codes don\'t match. Try again.')
      setTimeout(() => { setShake(false); setError(''); setStep('set'); setFirst('') }, 700)
      return
    }
    await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_passcode', passcode: code }),
    })
    onDone()
  }

  if (step === 'intro') return (
    <div className="flex flex-col items-center gap-8 max-w-xs text-center">
      <div className="relative">
        <div className="w-24 h-24 rounded-3xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shadow-[0_0_50px_rgba(139,92,246,0.3)]">
          <Lock size={36} className="text-violet-300" />
        </div>
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-hive-600 flex items-center justify-center">
          <Star size={9} className="text-white fill-white" />
        </div>
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-white tracking-tight">Your Private Vault</h2>
        <p className="text-sm text-text-muted leading-relaxed">
          This space is entirely yours. Lock it with a passcode — like a real diary with a real lock.
        </p>
      </div>
      <div className="flex flex-col gap-2.5 w-full">
        <button
          onClick={() => setStep('set')}
          className="w-full py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-all shadow-[0_4px_24px_rgba(139,92,246,0.4)]"
        >
          Add Passcode Lock
        </button>
        <button
          onClick={onSkip}
          className="w-full py-3 rounded-2xl border border-white/10 text-text-muted hover:text-white hover:border-white/20 text-sm transition-all"
        >
          Skip for now
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-14 h-14 rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
        <Lock size={22} className="text-violet-300" />
      </div>
      <PinPad
        onSubmit={step === 'set' ? handleFirst : handleConfirm}
        label={step === 'set' ? 'Choose a 4-6 digit passcode' : 'Confirm your passcode'}
        error={error}
        shake={shake}
      />
    </div>
  )
}

// ── LOCK SCREEN ───────────────────────────────────────────────────────────────
function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [unlocking, setUnlocking] = useState(false)

  const handleSubmit = async (code: string) => {
    if (unlocking) return
    setUnlocking(true)
    const res = await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify_passcode', passcode: code }),
    }).then(r => r.json())
    setUnlocking(false)

    if (res.valid) {
      onUnlock()
    } else {
      const next = attempts + 1
      setAttempts(next)
      setShake(true)
      setError(next >= 3 ? `Wrong passcode (${next} attempts)` : 'Wrong passcode')
      setTimeout(() => { setShake(false); setError('') }, 700)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-10">
      <div className="flex flex-col items-center gap-4">
        <div className={`relative w-20 h-20 rounded-3xl border flex items-center justify-center transition-all duration-300 ${
          shake ? 'bg-red-500/20 border-red-500/50' : 'bg-violet-500/15 border-violet-500/25 shadow-[0_0_50px_rgba(139,92,246,0.2)]'
        }`}>
          <Lock size={30} className={`transition-colors duration-300 ${shake ? 'text-red-400' : 'text-violet-300'}`} />
          <div className="absolute inset-0 rounded-3xl bg-violet-400/5 blur-2xl -z-10 scale-200" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-white tracking-tight">Dream Journal</h3>
          <p className="text-[11px] text-white/30 mt-0.5 tracking-widest uppercase">Private · Encrypted</p>
        </div>
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

// ── RICH TEXT TOOLBAR ─────────────────────────────────────────────────────────
function RichToolbar({ onInsert }: { onInsert: (prefix: string, suffix?: string, placeholder?: string) => void }) {
  const tools = [
    { icon: Bold,        title: 'Bold',         p: '**', s: '**', ph: 'bold text' },
    { icon: Italic,      title: 'Italic',        p: '*',  s: '*',  ph: 'italic text' },
    { icon: List,        title: 'Bullet list',   p: '\n- ', s: '', ph: 'item' },
    { icon: ListOrdered, title: 'Numbered list', p: '\n1. ', s: '', ph: 'item' },
  ]
  return (
    <div className="flex items-center gap-0.5 px-4 py-2 border-b border-hive-border shrink-0">
      {tools.map(t => (
        <button
          key={t.title}
          title={t.title}
          type="button"
          onClick={() => onInsert(t.p, t.s, t.ph)}
          className="p-2 rounded-lg text-text-muted hover:text-white hover:bg-white/8 transition-all"
        >
          <t.icon size={13} />
        </button>
      ))}
      <span className="ml-2 text-[10px] text-white/20">**bold** *italic* - bullet 1. number</span>
    </div>
  )
}

// ── NEW ENTRY COMPOSE ─────────────────────────────────────────────────────────
function NewEntry({
  initialCategory,
  onSave,
  onCancel,
}: {
  initialCategory: string
  onSave: (e: JournalEntry) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState(initialCategory)
  const [saving, setSaving] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { textRef.current?.focus() }, [])

  const insertMarkdown = (prefix: string, suffix = '', placeholder = '') => {
    const ta = textRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = content.slice(start, end) || placeholder
    const newContent = content.slice(0, start) + prefix + selected + suffix + content.slice(end)
    setContent(newContent)
    setTimeout(() => {
      const newPos = start + prefix.length + selected.length + suffix.length
      ta.setSelectionRange(newPos, newPos)
      ta.focus()
    }, 0)
  }

  const save = async () => {
    if (!content.trim()) return
    setSaving(true)
    const res = await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', title, content, category }),
    }).then(r => r.json())
    setSaving(false)
    if (res.entry) onSave(res.entry)
  }

  const cat = getCat(category)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-hive-border shrink-0">
        <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-hive-hover text-text-muted hover:text-white transition-colors">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-medium text-text-secondary flex-1">New entry</span>
        <span className={`flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-full border ${cat.bg} ${cat.border} ${cat.color}`}>
          <cat.icon size={9} /> {cat.label}
        </span>
        <button
          onClick={save}
          disabled={!content.trim() || saving}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-honey-500 hover:bg-honey-400 disabled:opacity-40 text-black font-semibold text-xs transition-all ml-1"
        >
          <Check size={12} />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Category selector */}
      <div className="flex gap-1.5 px-4 py-2.5 border-b border-hive-border shrink-0 overflow-x-auto">
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-medium whitespace-nowrap transition-all ${
              category === c.key
                ? `${c.bg} ${c.border} ${c.color}`
                : 'border-white/8 text-text-muted hover:border-white/16 hover:text-white/60'
            }`}
          >
            <c.icon size={10} />
            {c.label}
          </button>
        ))}
      </div>

      <RichToolbar onInsert={insertMarkdown} />

      <div className="flex-1 flex flex-col overflow-auto px-6 py-4 gap-3">
        <input
          type="text"
          placeholder="Title (optional)"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full bg-transparent text-lg font-semibold text-white placeholder-white/20 outline-none"
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
          onKeyDown={e => {
            if (e.key === 'Tab') { e.preventDefault(); insertMarkdown('  ') }
          }}
          className="flex-1 w-full bg-transparent text-text-secondary placeholder-white/20 outline-none resize-none leading-relaxed text-[15px]"
          style={{ fontFamily: "'Georgia', serif", minHeight: '200px' }}
        />
      </div>
    </div>
  )
}

// ── CATEGORY CARD ─────────────────────────────────────────────────────────────
function CategoryCard({ cat, count, isActive, onClick }: {
  cat: typeof CATEGORIES[0]
  count: number
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col gap-3 p-4 rounded-2xl border transition-all duration-200 text-left group ${
        isActive
          ? `${cat.bg} ${cat.border} shadow-lg ${cat.glow}`
          : 'bg-white/3 border-white/8 hover:bg-white/6 hover:border-white/14'
      }`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
        isActive ? `${cat.bg} ${cat.border} border` : 'bg-white/5 border border-white/8 group-hover:border-white/16'
      }`}>
        <cat.icon size={16} className={isActive ? cat.color : 'text-text-muted group-hover:text-white/60'} />
      </div>
      <div>
        <p className={`text-[11px] font-semibold leading-tight ${isActive ? 'text-white' : 'text-text-muted group-hover:text-white/70'}`}>
          {cat.label}
        </p>
        <p className={`text-[10px] mt-0.5 ${isActive ? cat.color : 'text-text-muted/60'}`}>
          {count} {count === 1 ? 'entry' : 'entries'}
        </p>
      </div>
    </button>
  )
}

// ── READ ENTRY ────────────────────────────────────────────────────────────────
function ReadEntry({ entry, onBack, onDelete }: {
  entry: JournalEntry
  onBack: () => void
  onDelete: (id: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const cat = getCat(entry.category || 'night_dreams')

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-hive-border shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-hive-hover text-text-muted hover:text-white transition-colors">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm text-text-muted flex-1">
          {new Date(entry.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <span className={`flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-full border ${cat.bg} ${cat.border} ${cat.color}`}>
          <cat.icon size={9} /> {cat.label}
        </span>
        {confirmDelete ? (
          <div className="flex items-center gap-1.5 ml-1">
            <button onClick={() => { onDelete(entry.id); onBack() }} className="px-2.5 py-1 rounded-lg bg-red-500/80 hover:bg-red-500 text-white text-[11px] font-medium transition-all">Delete</button>
            <button onClick={() => setConfirmDelete(false)} className="px-2.5 py-1 rounded-lg border border-white/10 text-text-muted text-[11px]">Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="ml-1 p-1.5 rounded-lg border border-white/8 text-text-muted hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-all"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto px-8 py-6">
        {entry.title && (
          <h2 className="text-xl font-bold text-white mb-4" style={{ fontFamily: "'Georgia', serif" }}>
            {entry.title}
          </h2>
        )}
        <div
          className="text-text-secondary text-[15px]"
          style={{ fontFamily: "'Georgia', serif" }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.content) }}
        />
      </div>
    </div>
  )
}

// ── MAIN DREAM JOURNAL ────────────────────────────────────────────────────────
export function DreamJournal() {
  const [screen, setScreen] = useState<'loading' | 'setup' | 'locked' | 'list' | 'compose' | 'read'>('loading')
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [activeCategory, setActiveCategory] = useState('night_dreams')
  const [selected, setSelected] = useState<JournalEntry | null>(null)
  const [customCatName, setCustomCatName] = useState('Notes')
  const [editingCatName, setEditingCatName] = useState(false)
  const catNameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function init() {
      const lockRes = await fetch('/api/journal?action=lock_status').then(r => r.json()).catch(() => ({ hasPasscode: false }))
      if (lockRes.hasPasscode) {
        setScreen('locked')
      } else {
        const eRes = await fetch('/api/journal?action=entries').then(r => r.json()).catch(() => ({ entries: [] }))
        if (!eRes.entries?.length) {
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
    setActiveCategory(entry.category || 'night_dreams')
    setScreen('list')
  }

  const deleteEntry = async (id: string) => {
    await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    })
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const liveCats = CATEGORIES.map(c => c.key === 'custom' ? { ...c, label: customCatName } : c)
  const filteredEntries = entries.filter(e => (e.category || 'night_dreams') === activeCategory)
  const activeCat = liveCats.find(c => c.key === activeCategory) || liveCats[0]

  if (screen === 'loading') return (
    <div className="absolute inset-0 flex items-center justify-center bg-hive-600">
      <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (screen === 'setup') return (
    <div className="absolute inset-0 flex items-center justify-center bg-hive-600 bg-gradient-to-br from-violet-900/30 via-hive-600 to-hive-600">
      <SetupPasscode onDone={onSetupDone} onSkip={onSetupDone} />
    </div>
  )

  if (screen === 'locked') return (
    <div className="absolute inset-0 bg-hive-600 bg-gradient-to-br from-violet-900/30 via-hive-600 to-hive-600">
      <LockScreen onUnlock={unlock} />
    </div>
  )

  if (screen === 'compose') return (
    <div className="absolute inset-0 bg-hive-600">
      <NewEntry
        initialCategory={activeCategory}
        onSave={onNewEntry}
        onCancel={() => setScreen('list')}
      />
    </div>
  )

  if (screen === 'read' && selected) return (
    <div className="absolute inset-0 bg-hive-600 flex flex-col">
      <ReadEntry entry={selected} onBack={() => setScreen('list')} onDelete={deleteEntry} />
    </div>
  )

  // ── LIST VIEW ──
  return (
    <div className="absolute inset-0 bg-hive-600 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-hive-border shrink-0">
        <div className="w-8 h-8 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
          <Book size={14} className="text-violet-400" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-white tracking-tight">Dream Journal</h2>
          <p className="text-[10px] text-text-muted">{entries.length} {entries.length === 1 ? 'entry' : 'entries'} · private</p>
        </div>
        <button
          onClick={() => setScreen('compose')}
          className="ml-auto flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-honey-500 hover:bg-honey-400 text-black font-semibold text-xs transition-all"
        >
          <Plus size={12} />
          New Entry
        </button>
      </div>

      {/* Category cards */}
      <div className="grid grid-cols-4 gap-2 px-4 py-3 border-b border-hive-border shrink-0">
        {liveCats.map(cat => (
          <CategoryCard
            key={cat.key}
            cat={cat}
            count={entries.filter(e => (e.category || 'night_dreams') === cat.key).length}
            isActive={activeCategory === cat.key}
            onClick={() => setActiveCategory(cat.key)}
          />
        ))}
      </div>

      {/* Active section header */}
      <div className="flex items-center gap-2 px-5 py-3 shrink-0">
        <activeCat.icon size={13} className={activeCat.color} />
        {editingCatName && activeCat.key === 'custom' ? (
          <input
            ref={catNameRef}
            value={customCatName}
            onChange={e => setCustomCatName(e.target.value)}
            onBlur={() => setEditingCatName(false)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingCatName(false) }}
            className="text-sm font-semibold text-white bg-transparent border-b border-violet-400/60 outline-none w-36 pb-0.5"
            autoFocus
          />
        ) : (
          <span className="text-sm font-semibold text-white">{activeCat.label}</span>
        )}
        {activeCat.key === 'custom' && !editingCatName && (
          <button
            onClick={() => { setEditingCatName(true); setTimeout(() => catNameRef.current?.select(), 50) }}
            className="p-1 rounded text-text-muted hover:text-white transition-colors"
            title="Rename"
          >
            <Pencil size={10} />
          </button>
        )}
        <span className="ml-auto text-[10px] text-white/25">{activeCat.description}</span>
      </div>

      {/* Entry list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-2">
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-8">
            <div className={`w-16 h-16 rounded-3xl ${activeCat.bg} border ${activeCat.border} flex items-center justify-center shadow-lg`}>
              <activeCat.emptyIcon size={26} className={activeCat.color} />
            </div>
            <div>
              <p className="text-white font-semibold">{activeCat.emptyTitle}</p>
              <p className="text-xs text-text-muted mt-1.5 leading-relaxed max-w-[220px]">{activeCat.emptyText}</p>
            </div>
            <button
              onClick={() => setScreen('compose')}
              className="px-5 py-2.5 rounded-2xl bg-honey-500 hover:bg-honey-400 text-black font-semibold text-sm transition-all"
            >
              {activeCat.emptyAction}
            </button>
          </div>
        ) : (
          filteredEntries.map(entry => {
            const cat = getCat(entry.category || 'night_dreams')
            const liveCat = liveCats.find(c => c.key === cat.key) || cat
            const preview = entry.content
              .replace(/\*\*(.*?)\*\*/g, '$1')
              .replace(/\*(.*?)\*/g, '$1')
              .replace(/^[-\d]+\.? /gm, '')
              .slice(0, 130) + (entry.content.length > 130 ? '…' : '')
            const date = new Date(entry.created_at)
            return (
              <div
                key={entry.id}
                onClick={() => { setSelected(entry); setScreen('read') }}
                className="group relative flex flex-col gap-2 px-4 py-4 pl-5 rounded-2xl border border-white/6 hover:border-white/14 bg-white/2 hover:bg-white/5 transition-all cursor-pointer overflow-hidden"
              >
                {/* Colored left accent bar */}
                <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${cat.bg.replace('/20', '').replace('bg-', 'bg-')}`}
                  style={{ background: cat.key === 'night_dreams' ? 'rgb(139 92 246 / 0.7)' :
                    cat.key === 'vision_board' ? 'rgb(245 158 11 / 0.7)' :
                    cat.key === 'goals' ? 'rgb(52 211 153 / 0.7)' :
                    'rgb(56 189 248 / 0.7)' }} />

                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {entry.title && (
                      <p className="text-sm font-semibold text-white truncate" style={{ fontFamily: "'Georgia', serif" }}>
                        {entry.title}
                      </p>
                    )}
                    <p className="text-[10px] text-text-muted mt-0.5">
                      {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${cat.bg} ${cat.border} ${cat.color}`}>
                    <cat.icon size={9} /> {liveCat.label}
                  </span>
                </div>
                <p className="text-xs text-text-muted leading-relaxed" style={{ fontFamily: "'Georgia', serif" }}>
                  {preview}
                </p>
                <button
                  onClick={e => { e.stopPropagation(); deleteEntry(entry.id) }}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/15 text-text-muted hover:text-red-400 transition-all"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
