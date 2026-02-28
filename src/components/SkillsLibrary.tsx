"use client"

import { useEffect, useState } from "react"
import { Zap, Plus, ExternalLink, CheckCircle2, Loader2, Search, BookOpen, Code2 } from "lucide-react"

interface Skill {
  id: number
  name: string
  description: string
  source_url: string
  category: string
  installed_at: string
}

const MARKETPLACE_SKILLS = [
  {
    name: "ace-music",
    description: "Generate unlimited free music with vocals using ACE-Step 1.5. Full songs, any genre, any language.",
    url: "https://raw.githubusercontent.com/ace-step/ace-step-skills/main/skills/acestep/SKILL.md",
    category: "Music",
    icon: "🎵",
    badge: "Free"
  },
  {
    name: "stripe-payments",
    description: "Process payments, create subscriptions, manage customers using the Stripe API.",
    url: "https://raw.githubusercontent.com/stripe/stripe-node/master/README.md",
    category: "Payments",
    icon: "💳",
    badge: "Popular"
  },
  {
    name: "sendgrid-email",
    description: "Send transactional and marketing emails via SendGrid with templates and analytics.",
    url: "https://raw.githubusercontent.com/sendgrid/sendgrid-nodejs/main/README.md",
    category: "Email",
    icon: "📧",
    badge: "Popular"
  },
  {
    name: "twilio-sms",
    description: "Send SMS, WhatsApp messages and make phone calls via Twilio's API.",
    url: "https://raw.githubusercontent.com/twilio/twilio-node/main/README.md",
    category: "Messaging",
    icon: "📱",
    badge: "Popular"
  },
  {
    name: "supabase-vector",
    description: "Semantic vector search using Supabase pgvector — find similar content by meaning.",
    url: "https://raw.githubusercontent.com/supabase/supabase/master/README.md",
    category: "Database",
    icon: "🔍",
    badge: "Pro"
  },
  {
    name: "openai-realtime",
    description: "OpenAI Realtime API for streaming audio conversations with low latency.",
    url: "https://raw.githubusercontent.com/openai/openai-node/master/README.md",
    category: "AI",
    icon: "🎙️",
    badge: "New"
  },
  {
    name: "eleven-labs-voice",
    description: "Ultra-realistic voice synthesis with custom voice cloning via ElevenLabs.",
    url: "https://raw.githubusercontent.com/elevenlabs/elevenlabs-python/main/README.md",
    category: "Voice",
    icon: "🔊",
    badge: "Premium"
  },
  {
    name: "resend-email",
    description: "Developer-friendly email API for transactional emails. Clean, fast, elegant.",
    url: "https://raw.githubusercontent.com/resendlabs/resend-node/main/README.md",
    category: "Email",
    icon: "✉️",
    badge: "Installed"
  },
]

const BADGE_STYLES: Record<string, string> = {
  Free: "bg-green-500/15 text-green-300 border-green-500/20",
  Popular: "bg-blue-500/15 text-blue-300 border-blue-500/20",
  New: "bg-violet-500/15 text-violet-300 border-violet-500/20",
  Pro: "bg-honey-500/15 text-honey-400 border-honey-500/20",
  Premium: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  Installed: "bg-green-500/20 text-green-300 border-green-500/30",
}

export function SkillsLibrary() {
  const [installedSkills, setInstalledSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState<string | null>(null)
  const [customUrl, setCustomUrl] = useState("")
  const [customName, setCustomName] = useState("")
  const [customDesc, setCustomDesc] = useState("")
  const [activeTab, setActiveTab] = useState<"marketplace" | "installed" | "custom">("marketplace")
  const [searchQ, setSearchQ] = useState("")
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  async function loadInstalled() {
    setLoading(true)
    try {
      const r = await fetch("/api/skills")
      if (r.ok) {
        const d = await r.json() as { skills: Skill[] }
        setInstalledSkills(d.skills ?? [])
      }
    } catch {}
    setLoading(false)
  }

  async function installSkill(url: string, name: string, desc: string) {
    setInstalling(name)
    try {
      const r = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, name, description: desc })
      })
      const d = await r.json() as { ok: boolean; message?: string; error?: string }
      if (d.ok) {
        showToast(`✅ "${name}" installed! Sparkie can now use this skill.`, true)
        await loadInstalled()
      } else {
        showToast(`❌ Failed: ${d.error ?? "Unknown error"}`, false)
      }
    } catch (e) {
      showToast(`❌ Network error`, false)
    }
    setInstalling(null)
  }

  useEffect(() => { loadInstalled() }, [])

  const filteredMarketplace = MARKETPLACE_SKILLS.filter(s =>
    !searchQ || s.name.toLowerCase().includes(searchQ.toLowerCase()) || s.description.toLowerCase().includes(searchQ.toLowerCase()) || s.category.toLowerCase().includes(searchQ.toLowerCase())
  )

  const isInstalled = (name: string) => installedSkills.some(s => s.name === name)

  return (
    <div className="h-full flex flex-col bg-hive-600">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-hive-border shrink-0">
        <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
          <Zap size={16} className="text-violet-400" />
        </div>
        <div>
          <div className="text-sm font-semibold text-text-primary">Skills Library</div>
          <div className="text-[10px] text-text-muted">Expand Sparkie's capabilities — one click to learn</div>
        </div>
        {installedSkills.length > 0 && (
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/20 font-medium">
            {installedSkills.length} installed
          </span>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`mx-4 mt-3 px-3 py-2 rounded-lg text-sm border ${toast.ok ? "bg-green-500/10 border-green-500/20 text-green-300" : "bg-red-500/10 border-red-500/20 text-red-300"}`}>
          {toast.msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0.5 px-4 pt-3 shrink-0">
        {(["marketplace", "installed", "custom"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors capitalize ${activeTab === tab ? "bg-violet-500/15 text-violet-300" : "text-text-muted hover:text-text-secondary hover:bg-hive-hover"}`}
          >
            {tab === "installed" ? `Installed (${installedSkills.length})` : tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {/* Marketplace */}
        {activeTab === "marketplace" && (
          <>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Search skills..."
                className="w-full pl-7 pr-3 py-1.5 bg-hive-elevated border border-hive-border rounded-lg text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-violet-500/40"
              />
            </div>
            {filteredMarketplace.map(skill => (
              <div key={skill.name} className="bg-hive-elevated rounded-xl border border-hive-border p-3.5 hover:border-violet-500/20 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-hive-600 flex items-center justify-center text-base shrink-0 border border-hive-border">
                    {skill.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-sm font-medium text-text-primary">{skill.name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${BADGE_STYLES[skill.badge] ?? ""}`}>{skill.badge}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-hive-600 text-text-muted border border-hive-border">{skill.category}</span>
                    </div>
                    <p className="text-xs text-text-secondary leading-relaxed">{skill.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-hive-border/50">
                  <a href={skill.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-secondary transition-colors">
                    <ExternalLink size={10} />
                    <span>View docs</span>
                  </a>
                  <button
                    onClick={() => !isInstalled(skill.name) && installSkill(skill.url, skill.name, skill.description)}
                    disabled={isInstalled(skill.name) || installing === skill.name}
                    className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      isInstalled(skill.name)
                        ? "bg-green-500/10 text-green-400 border border-green-500/20 cursor-default"
                        : installing === skill.name
                          ? "bg-violet-500/10 text-violet-400 border border-violet-500/20 cursor-wait"
                          : "bg-violet-500/15 text-violet-300 border border-violet-500/20 hover:bg-violet-500/25"
                    }`}
                  >
                    {isInstalled(skill.name)
                      ? <><CheckCircle2 size={11} /> Installed</>
                      : installing === skill.name
                        ? <><Loader2 size={11} className="animate-spin" /> Installing...</>
                        : <><Zap size={11} /> Install</>
                    }
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Installed */}
        {activeTab === "installed" && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-text-muted text-sm">
                <Loader2 size={14} className="animate-spin" /> Loading...
              </div>
            ) : installedSkills.length === 0 ? (
              <div className="text-center py-10 text-text-muted text-sm">No skills installed yet. Browse the marketplace!</div>
            ) : (
              installedSkills.map(skill => (
                <div key={skill.id} className="bg-hive-elevated rounded-xl border border-green-500/20 p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-primary">{skill.name}</div>
                      <div className="text-[10px] text-text-muted truncate">{skill.description}</div>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-hive-600 text-text-muted border border-hive-border shrink-0">{skill.category}</span>
                  </div>
                  {skill.source_url && (
                    <a href={skill.source_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 mt-2 text-[10px] text-text-muted hover:text-text-secondary">
                      <ExternalLink size={9} /> {skill.source_url.slice(0, 60)}...
                    </a>
                  )}
                </div>
              ))
            )}
          </>
        )}

        {/* Custom URL */}
        {activeTab === "custom" && (
          <div className="flex flex-col gap-3">
            <div className="bg-hive-elevated rounded-xl border border-hive-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <Code2 size={14} className="text-honey-500" />
                <span className="text-sm font-medium text-text-primary">Install from URL</span>
              </div>
              <div className="text-xs text-text-muted mb-3">
                Give Sparkie any documentation URL — GitHub README, API docs, tutorial, OpenAPI spec. She'll read it and permanently gain that knowledge.
              </div>
              <input
                value={customUrl}
                onChange={e => setCustomUrl(e.target.value)}
                placeholder="https://docs.example.com/api"
                className="w-full px-3 py-2 bg-hive-600 border border-hive-border rounded-lg text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-honey-500/40 mb-2"
              />
              <input
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder="Skill name (e.g. stripe-payments)"
                className="w-full px-3 py-2 bg-hive-600 border border-hive-border rounded-lg text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-honey-500/40 mb-2"
              />
              <input
                value={customDesc}
                onChange={e => setCustomDesc(e.target.value)}
                placeholder="What does this skill enable Sparkie to do?"
                className="w-full px-3 py-2 bg-hive-600 border border-hive-border rounded-lg text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-honey-500/40 mb-3"
              />
              <button
                onClick={() => customUrl && customName && installSkill(customUrl, customName, customDesc)}
                disabled={!customUrl || !customName || !!installing}
                className="w-full py-2 rounded-lg text-xs font-medium transition-all bg-honey-500/15 text-honey-400 border border-honey-500/20 hover:bg-honey-500/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {installing ? <><Loader2 size={11} className="animate-spin" /> Installing...</> : <><BookOpen size={11} /> Install & Learn</>}
              </button>
            </div>
            <div className="text-[10px] text-text-muted px-1">
              <div className="font-medium mb-1">Example URLs:</div>
              <div className="flex flex-col gap-0.5 text-text-muted/70">
                <span>• clawhub.ai/fspecii/ace-music</span>
                <span>• raw.githubusercontent.com/...</span>
                <span>• docs.stripe.com/api</span>
                <span>• platform.openai.com/docs/api-reference</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
