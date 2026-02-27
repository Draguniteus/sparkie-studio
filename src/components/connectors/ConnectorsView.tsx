"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Zap, Search, RefreshCw, CheckCircle2, X,
  ExternalLink, Loader2, MessageSquare, Share2,
  Code2, LayoutGrid, Users, Wallet, Bot, Key,
  PlugZap, Globe
} from "lucide-react"

interface ComposioApp {
  name: string
  displayName?: string
  description?: string
  logo?: string
  categories?: string[]
  authSchemes?: string[]
}

interface ConnectedAccount {
  id: string
  appName: string
  status: string
  createdAt?: string
}

// ── CATEGORY CONFIG ────────────────────────────────────────────────────────────
// keywords are matched against app.categories[] strings from Composio (case-insensitive)
const CATEGORIES: { key: string; label: string; icon: React.ElementType; keywords: string[] }[] = [
  { key: "",             label: "All Apps",     icon: Globe,       keywords: [] },
  { key: "communication",label: "Communication",icon: MessageSquare,keywords: ["communication","messaging","email","chat","team","collaboration"] },
  { key: "social",       label: "Social Media", icon: Share2,      keywords: ["social","social-media","social media","content","creator"] },
  { key: "developer",    label: "Developer",    icon: Code2,       keywords: ["developer","developer-tools","devops","code","development","engineering","cloud"] },
  { key: "productivity", label: "Productivity", icon: LayoutGrid,  keywords: ["productivity","project-management","project management","notes","tasks","calendar","documents"] },
  { key: "crm",          label: "CRM",          icon: Users,       keywords: ["crm","sales","marketing","customer","support","helpdesk"] },
  { key: "finance",      label: "Finance",      icon: Wallet,      keywords: ["finance","accounting","payment","billing","commerce","ecommerce"] },
  { key: "ai",           label: "AI Tools",     icon: Bot,         keywords: ["ai","ai-tools","ai tools","machine-learning","ml","artificial intelligence","llm"] },
]

const FEATURED: string[] = [
  "gmail","github","twitter","instagram","tiktok","slack","notion","discord",
  "google-calendar","hubspot","stripe","spotify","youtube","linkedin",
  "reddit","whatsapp","telegram","google-sheets","dropbox","shopify",
]

// ── SKELETON CARD ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="flex flex-col gap-3 p-4 rounded-2xl border border-white/5 bg-white/2 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-white/6 shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 bg-white/6 rounded w-20" />
          <div className="h-2 bg-white/4 rounded w-14" />
        </div>
      </div>
      <div className="space-y-1">
        <div className="h-2 bg-white/4 rounded w-full" />
        <div className="h-2 bg-white/4 rounded w-3/4" />
      </div>
      <div className="h-7 bg-white/4 rounded-lg mt-1" />
    </div>
  )
}

// ── API KEY MODAL ─────────────────────────────────────────────────────────────
function ApiKeyModal({ app, fields, onSubmit, onClose }: {
  app: ComposioApp
  fields: Array<{ name: string; displayName?: string; description?: string; required?: boolean }>
  onSubmit: (values: Record<string, string>) => void
  onClose: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    setSubmitting(true)
    await onSubmit(values)
    setSubmitting(false)
  }

  const allFilled = fields.filter(f => f.required !== false).every(f => values[f.name]?.trim())

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 bg-hive-600 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8">
          {app.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={app.logo} alt={app.displayName} className="w-8 h-8 rounded-lg object-contain bg-white/5" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-honey-500/15 flex items-center justify-center">
              <Key size={14} className="text-honey-500" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">{app.displayName || app.name}</p>
            <p className="text-[11px] text-text-muted">Enter your credentials to connect</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/8 text-text-muted hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>
        {/* Fields */}
        <div className="px-5 py-4 space-y-3">
          {fields.map(f => (
            <div key={f.name} className="space-y-1.5">
              <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">
                {f.displayName || f.name}
              </label>
              {f.description && <p className="text-[10px] text-text-muted">{f.description}</p>}
              <input
                type={f.name.toLowerCase().includes("secret") || f.name.toLowerCase().includes("key") || f.name.toLowerCase().includes("token") ? "password" : "text"}
                placeholder={`Enter ${f.displayName || f.name}…`}
                value={values[f.name] || ""}
                onChange={e => setValues(prev => ({ ...prev, [f.name]: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-hive-elevated border border-white/10 rounded-lg text-white placeholder-text-muted focus:outline-none focus:border-honey-500/50 focus:ring-1 focus:ring-honey-500/20"
              />
            </div>
          ))}
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-text-muted text-sm hover:text-white hover:border-white/20 transition-all">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!allFilled || submitting}
            className="flex-1 py-2.5 rounded-xl bg-honey-500 hover:bg-honey-400 text-black font-semibold text-sm disabled:opacity-40 transition-all"
          >
            {submitting ? <Loader2 size={14} className="animate-spin mx-auto" /> : "Connect"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── APP CARD ──────────────────────────────────────────────────────────────────
function AppCard({ app, connected, isConnecting, isDisconnecting, onConnect, onDisconnect }: {
  app: ComposioApp
  connected: boolean
  isConnecting: boolean
  isDisconnecting: boolean
  onConnect: () => void
  onDisconnect: () => void
}) {
  return (
    <div className={`group relative flex flex-col gap-3 p-4 rounded-2xl border transition-all duration-200 ${
      connected
        ? "border-honey-500/35 bg-gradient-to-b from-honey-500/8 to-honey-500/3 shadow-[0_0_20px_rgba(234,179,8,0.06)]"
        : "border-white/7 bg-white/2 hover:border-white/14 hover:bg-white/4"
    }`}>
      {/* Icon + name */}
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          {app.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={app.logo}
              alt={app.displayName}
              className="w-10 h-10 rounded-xl object-contain bg-white/5 border border-white/6"
              onError={e => { (e.target as HTMLImageElement).style.display = "none" }}
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-honey-500/10 border border-honey-500/20 flex items-center justify-center">
              <PlugZap size={16} className="text-honey-500" />
            </div>
          )}
          {connected && (
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-hive-600 flex items-center justify-center">
              <CheckCircle2 size={8} className="text-white" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white leading-tight">{app.displayName || app.name}</p>
          {app.categories?.[0] && (
            <p className="text-[10px] text-text-muted mt-0.5 capitalize">{app.categories[0].replace(/-/g, " ")}</p>
          )}
        </div>
      </div>

      {/* Description */}
      {app.description && (
        <p className="text-[11px] text-text-muted leading-relaxed line-clamp-2 flex-1">{app.description}</p>
      )}

      {/* Action */}
      {connected ? (
        <button
          onClick={onDisconnect}
          disabled={isDisconnecting}
          className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-[11px] font-medium border border-red-500/25 text-red-400 hover:bg-red-500/12 hover:border-red-500/40 transition-all disabled:opacity-50"
        >
          {isDisconnecting ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />}
          {isDisconnecting ? "Disconnecting…" : "Disconnect"}
        </button>
      ) : (
        <button
          onClick={onConnect}
          disabled={isConnecting}
          className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-[11px] font-semibold border border-honey-500/35 text-honey-400 bg-honey-500/8 hover:bg-honey-500/16 hover:border-honey-500/55 hover:text-honey-300 transition-all disabled:opacity-50"
        >
          {isConnecting ? <Loader2 size={10} className="animate-spin" /> : <ExternalLink size={10} />}
          {isConnecting ? "Opening…" : "Connect"}
        </button>
      )}
    </div>
  )
}

// ── MAIN VIEW ─────────────────────────────────────────────────────────────────
export function ConnectorsView() {
  const [allApps, setAllApps] = useState<ComposioApp[]>([])
  const [connections, setConnections] = useState<ConnectedAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState("")
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)
  // API key modal reserved for future use
  const searchRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const loadConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/connectors?action=status")
      if (res.ok) {
        const data = await res.json() as { connections: ConnectedAccount[] }
        setConnections(data.connections ?? [])
      }
    } catch { /* non-fatal */ }
  }, [])

  // Load ALL apps once (client-side category filtering)
  const loadApps = useCallback(async (reset = true) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ action: "apps" })
      if (query.trim()) params.set("q", query.trim())
      if (!reset && cursor) params.set("cursor", cursor)

      const res = await fetch(`/api/connectors?${params}`)
      if (!res.ok) throw new Error("Failed to load apps")

      const data = await res.json() as { items?: ComposioApp[]; nextCursor?: string }
      const items = data.items ?? []

      setAllApps(prev => reset ? items : [...prev, ...items])
      setCursor(data.nextCursor ?? null)
      setHasMore(!!data.nextCursor)
    } catch {
      showToast("Could not load apps", "error")
    } finally {
      setLoading(false)
    }
  }, [query, cursor])

  useEffect(() => {
    loadConnections()
    loadApps(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-fetch when search query changes (debounced)
  useEffect(() => {
    const t = setTimeout(() => loadApps(true), 350)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  // Client-side category filter
  const filteredApps = activeCategory
    ? allApps.filter(app => {
        const catConfig = CATEGORIES.find(c => c.key === activeCategory)
        if (!catConfig || !catConfig.keywords.length) return true
        const appCats = (app.categories ?? []).map(c => c.toLowerCase())
        return catConfig.keywords.some(kw => appCats.some(ac => ac.includes(kw) || kw.includes(ac)))
      })
    : allApps

  // Featured apps first when no search/filter active
  const displayApps = (!query.trim() && !activeCategory)
    ? [
        ...allApps.filter(a => FEATURED.includes(a.name.toLowerCase())),
        ...allApps.filter(a => !FEATURED.includes(a.name.toLowerCase())),
      ]
    : filteredApps

  const isConnected = (name: string) =>
    connections.some(c => c.appName.toLowerCase() === name.toLowerCase() && c.status === "ACTIVE")

  const getConnection = (name: string) =>
    connections.find(c => c.appName.toLowerCase() === name.toLowerCase() && c.status === "ACTIVE")

  const handleConnect = async (app: ComposioApp) => {
    const appName = app.name
    setConnecting(appName)
    try {
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect", appName }),
      })
      const data = await res.json() as { authUrl?: string; status?: string; error?: string; detail?: string }

      if (!res.ok || data.error) {
        const msg = data.error || "Connection failed"
        // Show the Composio detail if available to help diagnose
        showToast(msg, "error")
        setConnecting(null)
        return
      }

      if (data.status === "ACTIVE") {
        showToast(`${app.displayName || appName} connected!`)
        await loadConnections()
        setConnecting(null)
        return
      }

      if (data.authUrl) {
        const popup = window.open(
          data.authUrl,
          "sparkie_oauth",
          "width=620,height=720,scrollbars=yes,resizable=yes,left=200,top=100"
        )
        const poll = setInterval(async () => {
          if (popup?.closed) {
            clearInterval(poll)
            await loadConnections()
            setConnecting(null)
            showToast(`${app.displayName || appName} connected!`)
          }
        }, 1000)
      } else {
        setConnecting(null)
      }
    } catch {
      showToast("Connection failed", "error")
      setConnecting(null)
    }
  }



  const handleDisconnect = async (appName: string) => {
    const conn = getConnection(appName)
    if (!conn) return
    setDisconnecting(appName)
    try {
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect", connectedAccountId: conn.id }),
      })
      const data = await res.json() as { success?: boolean; error?: string }
      if (data.success) {
        showToast(`${appName} disconnected`)
        setConnections(prev => prev.filter(c => c.id !== conn.id))
      } else {
        showToast(data.error ?? "Disconnect failed", "error")
      }
    } catch {
      showToast("Disconnect failed", "error")
    } finally {
      setDisconnecting(null)
    }
  }

  const connectedCount = connections.filter(c => c.status === "ACTIVE").length

  return (
    <div className="flex flex-col h-full bg-hive-600 overflow-hidden">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-medium shadow-xl transition-all border ${
          toast.type === "success"
            ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
            : "bg-red-500/15 border-red-500/30 text-red-300"
        }`}>
          {toast.type === "success" ? <CheckCircle2 size={14} /> : <X size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-hive-border shrink-0">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-honey-500/15 border border-honey-500/20 flex items-center justify-center">
              <Zap size={14} className="text-honey-400" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">Connectors</h1>
              <p className="text-[10px] text-text-muted">
                {connectedCount > 0 ? `${connectedCount} app${connectedCount !== 1 ? "s" : ""} connected` : "No apps connected yet"}
              </p>
            </div>
          </div>
          <button
            onClick={() => { loadApps(true); loadConnections() }}
            className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/6 text-text-muted hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw size={13} />
          </button>
        </div>
        <p className="text-[11px] text-text-muted mt-2">Give Sparkie access to your tools — read emails, post, schedule, and more.</p>
      </div>

      {/* Connected pills */}
      {connectedCount > 0 && (
        <div className="px-4 py-2.5 border-b border-hive-border shrink-0 bg-emerald-500/4">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            <span className="text-[10px] text-emerald-400/70 font-semibold uppercase tracking-widest shrink-0">Active</span>
            {connections.filter(c => c.status === "ACTIVE").map(c => (
              <span key={c.id} className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-medium whitespace-nowrap shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {c.appName}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="px-4 pt-3 pb-2 shrink-0">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search 1,000+ apps…"
            className="w-full pl-8 pr-3 py-2.5 text-[13px] bg-white/4 border border-white/8 rounded-xl text-white placeholder-white/25 focus:outline-none focus:border-honey-500/50 focus:ring-1 focus:ring-honey-500/15 transition-all"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-text-muted hover:text-white transition-colors">
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto scrollbar-none shrink-0">
        {CATEGORIES.map(cat => {
          const isActive = activeCategory === cat.key
          const Icon = cat.icon
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all ${
                isActive
                  ? "bg-honey-500 text-hive-900 shadow-[0_2px_12px_rgba(234,179,8,0.3)]"
                  : "bg-white/4 border border-white/8 text-text-muted hover:text-white hover:border-white/16"
              }`}
            >
              <Icon size={10} />
              {cat.label}
            </button>
          )
        })}
      </div>

      {/* App Grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {loading && allApps.length === 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : displayApps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-4 text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center">
              <Search size={18} className="text-text-muted" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">No apps found</p>
              <p className="text-xs text-text-muted mt-1">
                {query ? `Nothing matching "${query}" in this category` : "No apps in this category"}
              </p>
            </div>
            <button
              onClick={() => { setQuery(""); setActiveCategory("") }}
              className="px-4 py-2 rounded-xl border border-white/10 text-text-muted text-xs hover:text-white hover:border-white/20 transition-all"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            {/* Section label */}
            {!query.trim() && !activeCategory && (
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest pb-1">
                {connectedCount > 0 ? "Featured Apps" : "Popular Integrations"}
              </p>
            )}
            {activeCategory && (
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest pb-1">
                {CATEGORIES.find(c => c.key === activeCategory)?.label} · {displayApps.length} apps
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {displayApps.map(app => (
                <AppCard
                  key={app.name}
                  app={app}
                  connected={isConnected(app.name)}
                  isConnecting={connecting === app.name}
                  isDisconnecting={disconnecting === app.name}
                  onConnect={() => handleConnect(app)}
                  onDisconnect={() => handleDisconnect(app.name)}
                />
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={() => loadApps(false)}
                  className="px-5 py-2 text-xs text-text-muted hover:text-white border border-white/8 rounded-xl hover:border-white/16 transition-all"
                >
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
