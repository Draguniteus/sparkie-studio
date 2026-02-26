"use client"

import { useEffect, useState, useCallback } from "react"
import { Search, Zap, CheckCircle2, Loader2, ExternalLink, X, RefreshCw } from "lucide-react"

interface ComposioApp {
  name: string
  displayName: string
  description: string
  logo?: string
  categories?: string[]
}

interface ConnectedAccount {
  id: string
  appName: string
  status: string
  createdAt: string
}

const FEATURED_APPS = [
  "gmail", "github", "twitter", "instagram", "tiktok", "slack",
  "notion", "discord", "google-calendar", "hubspot", "stripe",
  "spotify", "youtube", "linkedin", "reddit", "whatsapp",
  "telegram", "google-sheets", "dropbox", "shopify",
]

const CATEGORY_LABELS: Record<string, string> = {
  "": "All Apps",
  communication: "Communication",
  social: "Social Media",
  developer: "Developer",
  productivity: "Productivity",
  crm: "CRM",
  finance: "Finance",
  ai: "AI Tools",
}

export function ConnectorsView() {
  const [apps, setApps] = useState<ComposioApp[]>([])
  const [connections, setConnections] = useState<ConnectedAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("")
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
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

  const loadApps = useCallback(async (reset = true) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ action: "apps" })
      if (query.trim()) params.set("q", query.trim())
      if (category) params.set("category", category)
      if (!reset && cursor) params.set("cursor", cursor)

      const res = await fetch(`/api/connectors?${params}`)
      if (!res.ok) throw new Error("Failed to load apps")

      const data = await res.json() as { items?: ComposioApp[]; nextCursor?: string }
      const items = data.items ?? []

      setApps(prev => reset ? items : [...prev, ...items])
      setCursor(data.nextCursor ?? null)
      setHasMore(!!data.nextCursor)
    } catch {
      showToast("Could not load apps", "error")
    } finally {
      setLoading(false)
    }
  }, [query, category, cursor])

  // Initial load
  useEffect(() => {
    loadConnections()
    loadApps(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounced search/category changes
  useEffect(() => {
    const t = setTimeout(() => loadApps(true), 350)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category])

  const isConnected = (appName: string) =>
    connections.some(c => c.appName.toLowerCase() === appName.toLowerCase() && c.status === "ACTIVE")

  const getConnection = (appName: string) =>
    connections.find(c => c.appName.toLowerCase() === appName.toLowerCase() && c.status === "ACTIVE")

  const handleConnect = async (appName: string) => {
    setConnecting(appName)
    try {
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect", appName }),
      })
      const data = await res.json() as { authUrl?: string; status?: string; error?: string }

      if (data.error) {
        showToast(data.error, "error")
        return
      }

      if (data.status === "ACTIVE") {
        showToast(`${appName} connected!`)
        await loadConnections()
        return
      }

      if (data.authUrl) {
        // Open OAuth in popup
        const popup = window.open(
          data.authUrl,
          "sparkie_oauth",
          "width=600,height=700,scrollbars=yes,resizable=yes"
        )

        // Poll for popup close / connection completion
        const poll = setInterval(async () => {
          if (popup?.closed) {
            clearInterval(poll)
            await loadConnections()
            setConnecting(null)
          }
        }, 1000)
      }
    } catch {
      showToast("Connection failed", "error")
    } finally {
      // Don't clear connecting here for OAuth flow — clear on poll
      if (!connecting) setConnecting(null)
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

  // Highlighted featured apps (show first if no search)
  const displayApps = query.trim() || category
    ? apps
    : [
        ...apps.filter(a => FEATURED_APPS.includes(a.name.toLowerCase())),
        ...apps.filter(a => !FEATURED_APPS.includes(a.name.toLowerCase())),
      ]

  return (
    <div className="flex flex-col h-full bg-hive-600 overflow-hidden">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg transition-all ${
          toast.type === "success"
            ? "bg-honey-500/20 border border-honey-500/40 text-honey-300"
            : "bg-red-500/20 border border-red-500/40 text-red-300"
        }`}>
          {toast.type === "success" ? <CheckCircle2 size={14} /> : <X size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-hive-border shrink-0">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-honey-500/15 flex items-center justify-center">
              <Zap size={14} className="text-honey-500" />
            </div>
            <h1 className="text-base font-semibold text-text-primary">Connectors</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-text-muted">{connections.length} connected</span>
            <button
              onClick={loadConnections}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors"
              title="Refresh connections"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
        <p className="text-[12px] text-text-muted">Connect your apps — Sparkie can read, write, and act on your behalf.</p>
      </div>

      {/* Search + Filter */}
      <div className="px-4 py-3 border-b border-hive-border shrink-0 space-y-2">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search 1,000+ apps..."
            className="w-full pl-8 pr-3 py-2 text-sm bg-hive-elevated border border-hive-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-honey-500/50 focus:ring-1 focus:ring-honey-500/20"
          />
        </div>

        {/* Category pills */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setCategory(key)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                category === key
                  ? "bg-honey-500 text-hive-900"
                  : "bg-hive-elevated border border-hive-border text-text-muted hover:text-text-secondary hover:border-honey-500/30"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Connected Apps Banner (if any) */}
      {connections.length > 0 && (
        <div className="px-4 py-2.5 border-b border-hive-border shrink-0 bg-honey-500/5">
          <p className="text-[11px] text-honey-500/80 font-medium mb-1.5">Active connections</p>
          <div className="flex flex-wrap gap-1.5">
            {connections.map(c => (
              <span key={c.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-honey-500/10 border border-honey-500/20 text-honey-400 text-[11px] font-medium">
                <CheckCircle2 size={10} />
                {c.appName}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* App Grid */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading && apps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <Loader2 size={22} className="animate-spin text-honey-500/50" />
            <p className="text-sm text-text-muted">Loading apps...</p>
          </div>
        ) : displayApps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <p className="text-sm text-text-muted">No apps found for "{query}"</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {displayApps.map(app => {
                const connected = isConnected(app.name)
                const isConnecting = connecting === app.name
                const isDisconnecting = disconnecting === app.name

                return (
                  <div
                    key={app.name}
                    className={`group relative flex flex-col gap-2 p-3 rounded-xl border transition-all ${
                      connected
                        ? "border-honey-500/30 bg-honey-500/5"
                        : "border-hive-border bg-hive-elevated hover:border-hive-border/80 hover:bg-hive-hover"
                    }`}
                  >
                    {/* App icon + name */}
                    <div className="flex items-center gap-2">
                      {app.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={app.logo}
                          alt={app.displayName}
                          className="w-7 h-7 rounded-lg object-contain bg-white/5"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-lg bg-honey-500/10 flex items-center justify-center">
                          <Zap size={12} className="text-honey-500" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-text-primary truncate">{app.displayName || app.name}</p>
                        {app.categories?.[0] && (
                          <p className="text-[10px] text-text-muted">{app.categories[0]}</p>
                        )}
                      </div>
                      {connected && (
                        <CheckCircle2 size={13} className="ml-auto shrink-0 text-honey-500" />
                      )}
                    </div>

                    {/* Description */}
                    {app.description && (
                      <p className="text-[11px] text-text-muted line-clamp-2 leading-relaxed">
                        {app.description}
                      </p>
                    )}

                    {/* Action button */}
                    <div className="flex gap-1.5 mt-auto pt-1">
                      {connected ? (
                        <button
                          onClick={() => handleDisconnect(app.name)}
                          disabled={!!isDisconnecting}
                          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 transition-all disabled:opacity-50"
                        >
                          {isDisconnecting ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />}
                          Disconnect
                        </button>
                      ) : (
                        <button
                          onClick={() => handleConnect(app.name)}
                          disabled={!!isConnecting}
                          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium bg-honey-500/10 border border-honey-500/30 text-honey-400 hover:bg-honey-500/15 hover:text-honey-300 transition-all disabled:opacity-50"
                        >
                          {isConnecting ? <Loader2 size={10} className="animate-spin" /> : <ExternalLink size={10} />}
                          {isConnecting ? "Opening..." : "Connect"}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center mt-4">
                <button
                  onClick={() => loadApps(false)}
                  className="px-4 py-2 text-sm text-text-muted hover:text-text-secondary border border-hive-border rounded-lg hover:border-honey-500/30 transition-all"
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
