"use client"

import { useState, useMemo, useEffect } from "react"
import { useAppStore, AssetType, AssetSource } from "@/store/appStore"
import { useShallow } from "zustand/react/shallow"
import {
  Download, Search, X, ExternalLink, MessageSquare,
  Globe, FileText, Music, Video, Table, File,
  Trash2, ChevronDown, Image, Play, ArrowUpDown,
  Sparkles, Palette, BarChart3, Projector,
} from "lucide-react"

// ── Helpers ────────────────────────────────────────────────────────────────

function detectAssetType(name: string): AssetType {
  const ext = name.split(".").pop()?.toLowerCase() || ""
  if (["html", "htm"].includes(ext)) return "website"
  if (["jpg", "jpeg", "png", "gif", "svg", "webp", "ico", "bmp"].includes(ext)) return "image"
  if (["mp3", "wav", "ogg", "aac", "flac", "m4a"].includes(ext)) return "audio"
  if (["mp4", "webm", "mov", "avi", "mkv"].includes(ext)) return "video"
  if (["xlsx", "xls", "csv"].includes(ext)) return "excel"
  if (["pptx", "ppt"].includes(ext)) return "ppt"
  if (["pdf", "doc", "docx", "txt", "md"].includes(ext)) return "document"
  return "other"
}

function getTypeIcon(type: AssetType, size = 14) {
  switch (type) {
    case "website": return <Globe size={size} />
    case "document": return <FileText size={size} />
    case "image": return <Image size={size} />
    case "audio": return <Music size={size} />
    case "video": return <Video size={size} />
    case "excel": return <Table size={size} />
    case "ppt": return <File size={size} />
    default: return <File size={size} />
  }
}

function getTypeBadge(type: AssetType): { bg: string; text: string; label: string } {
  switch (type) {
    case "website":  return { bg: "bg-purple-500/20", text: "text-purple-300", label: "Site" }
    case "image":    return { bg: "bg-blue-500/20",   text: "text-blue-300",   label: "Image" }
    case "audio":    return { bg: "bg-green-500/20",  text: "text-green-300",  label: "Audio" }
    case "video":    return { bg: "bg-orange-500/20", text: "text-orange-300", label: "Video" }
    case "document": return { bg: "bg-indigo-500/20", text: "text-indigo-300", label: "Doc" }
    case "excel":    return { bg: "bg-emerald-500/20",text: "text-emerald-300",label: "Excel" }
    case "ppt":      return { bg: "bg-amber-500/20",  text: "text-amber-300",  label: "PPT" }
    default:         return { bg: "bg-honey-500/20",  text: "text-honey-400",  label: "File" }
  }
}

function isMediaUrl(content: string): boolean {
  return content.startsWith("http://") || content.startsWith("https://") ||
    content.startsWith("/api/") || content.startsWith("data:")
}

const SOURCE_FILE_EXTS = new Set([
  "js","ts","jsx","tsx","css","scss","json","py","rb","go",
  "rs","cpp","c","h","java","php","sh","yaml","yml","toml",
  "xml","env","lock","config","gitignore","prettierrc","eslintrc","babelrc",
])
function isSourceFile(name: string): boolean {
  const ext = (name.split(".").pop() || "").toLowerCase()
  return SOURCE_FILE_EXTS.has(ext)
}

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d
  return date.toLocaleDateString([], { month: "short", day: "numeric" })
}

// ── Card Thumbnail ──────────────────────────────────────────────────────────

function CardThumbnail({ name, content, type }: { name: string; content: string; type: AssetType }) {
  const ext = name.split(".").pop()?.toLowerCase() || ""

  if (type === "website") {
    return (
      <div className="w-full h-full overflow-hidden bg-[#0d0d18]">
        <iframe
          srcDoc={content}
          sandbox="allow-scripts allow-same-origin"
          className="w-full h-full border-0 pointer-events-none"
          style={{ transform: "scale(0.35)", transformOrigin: "top left", width: "286%", height: "286%" }}
          title={name}
        />
      </div>
    )
  }

  if (type === "image") {
    const src = ext === "svg"
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`
      : isMediaUrl(content) ? content : null
    if (src) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#0d0d18] overflow-hidden">
          <img src={src} alt={name} className="w-full h-full object-cover" loading="lazy" />
        </div>
      )
    }
  }

  if (type === "video" && isMediaUrl(content)) {
    return (
      <div className="w-full h-full relative bg-[#0d0d18] overflow-hidden">
        <video
          src={content}
          className="w-full h-full object-cover"
          muted playsInline preload="metadata"
          onLoadedMetadata={e => { (e.target as HTMLVideoElement).currentTime = 0.5 }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-9 h-9 rounded-full bg-black/60 flex items-center justify-center ring-1 ring-white/20">
            <Play size={14} className="text-white ml-0.5" fill="white" />
          </div>
        </div>
      </div>
    )
  }

  if (type === "audio") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-green-900/30 to-[#0d0d18]">
        <div className="w-11 h-11 rounded-2xl bg-green-500/15 flex items-center justify-center ring-1 ring-green-500/20">
          <Music size={22} className="text-green-400" />
        </div>
        {/* Waveform bars */}
        <div className="flex items-end gap-0.5 h-6">
          {Array.from({ length: 16 }).map((_, i) => {
            const h = [3,5,8,6,10,7,12,9,11,8,6,10,7,5,8,4][i]
            return <div key={i} className="w-1 rounded-sm bg-green-500/40" style={{ height: h * 1.5 }} />
          })}
        </div>
      </div>
    )
  }

  // Excel
  if (type === "excel") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-emerald-900/20 to-[#0d0d18]">
        <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center ring-1 ring-emerald-500/20">
          <Table size={22} className="text-emerald-400" />
        </div>
        <span className="text-[9px] font-mono text-emerald-400/60">SPREADSHEET</span>
      </div>
    )
  }

  // PPT
  if (type === "ppt") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-amber-900/20 to-[#0d0d18]">
        <div className="w-11 h-11 rounded-xl bg-amber-500/15 flex items-center justify-center ring-1 ring-amber-500/20">
          <File size={22} className="text-amber-400" />
        </div>
        <span className="text-[9px] font-mono text-amber-400/60">PRESENTATION</span>
      </div>
    )
  }

  // Document / default
  const badge = getTypeBadge(type)
  const ext4 = ext.slice(0, 4).toUpperCase() || "FILE"
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[#0d0d18]">
      <div className={`w-11 h-11 rounded-xl ${badge.bg} flex items-center justify-center ring-1 ring-white/10`}>
        <span className={`text-lg font-mono font-bold ${badge.text}`}>{ext4}</span>
      </div>
    </div>
  )
}

// ── Filter tabs config ────────────────────────────────────────────────────
type FilterTab = "all" | AssetType
const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "website", label: "Site" },
  { key: "image", label: "Image" },
  { key: "audio", label: "Audio" },
  { key: "video", label: "Video" },
  { key: "document", label: "Doc" },
  { key: "excel", label: "Excel" },
  { key: "ppt", label: "PPT" },
]

type SortKey = "newest" | "oldest" | "type" | "name"

interface PreviewModal {
  id: string
  name: string
  content: string
  type: AssetType
  chatId: string
  chatTitle: string
  createdAt?: Date
}

// ── Empty state per type ──────────────────────────────────────────────────
const TYPE_PROMPTS: Record<string, { icon: string; prompt: string }> = {
  all:      { icon: "sparkles", prompt: "/build me a landing page" },
  website:  { icon: "globe",   prompt: "/build me a landing page" },
  image:    { icon: "palette", prompt: "generate an image of a sunset" },
  audio:    { icon: "music",   prompt: "make me a chill lo-fi track" },
  video:    { icon: "video",   prompt: "generate a video of ocean waves" },
  document: { icon: "file",    prompt: "/build me a resume template" },
  excel:    { icon: "chart",   prompt: "/build me a budget spreadsheet" },
  ppt:      { icon: "projector", prompt: "/build me a pitch deck" },
}

const ASSET_ICON_MAP: Record<string, { icon: typeof Sparkles | typeof Globe | typeof Palette | typeof Music | typeof Video | typeof FileText | typeof BarChart3 | typeof Projector; color: string }> = {
  sparkles:  { icon: Sparkles,        color: 'text-purple-300' },
  globe:     { icon: Globe,           color: 'text-blue-400' },
  palette:   { icon: Palette,        color: 'text-pink-400' },
  music:     { icon: Music,          color: 'text-pink-300' },
  video:     { icon: Video,          color: 'text-fuchsia-400' },
  file:      { icon: FileText,       color: 'text-blue-400' },
  chart:     { icon: BarChart3,   color: 'text-emerald-400' },
  projector: { icon: Projector,    color: 'text-amber-400' },
}

function EmptyState({ filter, onPrompt }: { filter: string; onPrompt: (p: string) => void }) {
  const cfg = TYPE_PROMPTS[filter] ?? TYPE_PROMPTS.all
  const label = filter === "all" ? "assets" : filter + "s"
  const iconEntry = ASSET_ICON_MAP[cfg.icon] ?? ASSET_ICON_MAP.sparkles
  const IconC = iconEntry.icon
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center gap-3">
      <div className="text-4xl"><IconC size={40} className={iconEntry.color} /></div>
      <p className="text-sm font-medium text-text-secondary">No {label} yet</p>
      <p className="text-[11px] text-text-muted">Ask Sparkie to create one</p>
      <button
        onClick={() => onPrompt(cfg.prompt)}
        className="mt-1 px-3 py-1.5 rounded-lg bg-hive-elevated border border-hive-border text-[11px] text-honey-500 hover:border-honey-500/40 hover:bg-hive-hover transition-all font-mono"
      >
        {cfg.prompt}
      </button>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────
export function AssetsTab() {
  const { assets, setCurrentChat, setActiveTab, removeAsset } = useAppStore(
    useShallow((s) => ({ assets: s.assets, setCurrentChat: s.setCurrentChat, setActiveTab: s.setActiveTab, removeAsset: s.removeAsset }))
  )
  const [filterTab, setFilterTab] = useState<FilterTab>("all")
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortKey>("newest")
  const [showSort, setShowSort] = useState(false)
  const [preview, setPreview] = useState<PreviewModal | null>(null)

  // FIX 18: Refresh assets from DB when a chat session completes
  useEffect(() => {
    const refresh = () => {
      fetch('/api/assets')
        .then(r => r.ok ? r.json() : null)
        .then((d: { assets?: import("@/store/appStore").Asset[] } | null) => {
          if (d?.assets && d.assets.length > 0) {
            useAppStore.setState({ assets: d.assets.map((a: import("@/store/appStore").Asset) => ({ ...a, createdAt: new Date(a.createdAt) })) })
          }
        })
        .catch(() => {})
    }
    window.addEventListener('sparkie:live-done', refresh)
    return () => window.removeEventListener('sparkie:live-done', refresh)
  }, [])

  const enriched = useMemo(() =>
    assets
      .filter(a => !isSourceFile(a.name))
      .filter(a => !(a.source === "agent" && (a.assetType === "document" || !a.assetType) && !a.name.match(/\.(pdf|doc|docx|txt|md|html|htm)$/i)))
      .map(a => ({ ...a, assetType: a.assetType || detectAssetType(a.name) })),
    [assets]
  )

  // Counts per type
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: enriched.length }
    for (const a of enriched) { c[a.assetType] = (c[a.assetType] ?? 0) + 1 }
    return c
  }, [enriched])

  const filtered = useMemo(() => {
    let list = enriched.filter(a => {
      if (filterTab !== "all" && a.assetType !== filterTab) return false
      if (search) {
        const q = search.toLowerCase()
        if (!a.name.toLowerCase().includes(q) && !a.chatTitle.toLowerCase().includes(q)) return false
      }
      return true
    })
    switch (sort) {
      case "oldest": list = [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); break
      case "type":   list = [...list].sort((a, b) => a.assetType.localeCompare(b.assetType)); break
      case "name":   list = [...list].sort((a, b) => a.name.localeCompare(b.name)); break
      default: break // newest = default DB order
    }
    return list
  }, [enriched, filterTab, search, sort])

  function handlePrompt(p: string) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sparkie:prefill-input", { detail: p }))
    }
  }

  async function downloadAsset(name: string, content: string) {
    const ext = name.split(".").pop()?.toLowerCase() || ""
    const MIME_MAP: Record<string, string> = {
      mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
      mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
      gif: "image/gif", svg: "image/svg+xml", webp: "image/webp",
      pdf: "application/pdf", txt: "text/plain", md: "text/markdown",
      html: "text/html", htm: "text/html", json: "application/json", csv: "text/csv",
    }
    const mimeType = MIME_MAP[ext] || "application/octet-stream"
    let objectUrl: string | null = null
    try {
      if (isMediaUrl(content)) {
        const res = await fetch(content)
        const serverMime = res.headers.get("content-type")?.split(";")[0].trim()
        const blob = await res.blob()
        objectUrl = URL.createObjectURL(new Blob([blob], { type: serverMime || mimeType }))
      } else {
        objectUrl = URL.createObjectURL(new Blob([content], { type: mimeType }))
      }
      const a = document.createElement("a"); a.href = objectUrl!; a.download = name
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
    } catch {
      if (isMediaUrl(content)) window.open(content, "_blank")
    } finally {
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl!), 1000)
    }
  }

  function openInNewWindow(content: string, name: string, type: AssetType) {
    const ext = name.split(".").pop()?.toLowerCase() || ""
    if (type === "website") {
      const win = window.open("", "_blank"); if (win) { win.document.open(); win.document.write(content); win.document.close() }
    } else if (isMediaUrl(content)) {
      window.open(content, "_blank")
    } else if (ext === "svg") {
      window.open(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`, "_blank")
    } else if (content.startsWith("data:")) {
      try {
        const [meta, b64] = content.split(",")
        const mime = meta.match(/data:([^;]+)/)?.[1] ?? "application/octet-stream"
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
        const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
        const win = window.open(url, "_blank")
        if (win) setTimeout(() => URL.revokeObjectURL(url), 60000)
        else URL.revokeObjectURL(url)
      } catch { window.open(content, "_blank") }
    } else {
      const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }))
      window.open(url, "_blank")
    }
  }

  const SORT_LABELS: Record<SortKey, string> = {
    newest: "Newest first", oldest: "Oldest first", type: "By type", name: "By name"
  }

  return (
    <div className="flex flex-col h-full bg-transparent" onClick={() => showSort && setShowSort(false)}>

      {/* ── Top bar: search + sort ─────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2 shrink-0">
        <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-hive-elevated border border-hive-border focus-within:border-honey-500/40 transition-colors">
          <Search size={12} className="text-text-muted shrink-0" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search assets…"
            className="flex-1 bg-transparent text-[11px] text-text-primary placeholder:text-text-muted outline-none min-w-0"
          />
          {search && <button onClick={() => setSearch("")} className="text-text-muted hover:text-text-secondary"><X size={11} /></button>}
        </div>
        {/* Sort dropdown */}
        <div className="relative shrink-0">
          <button
            onClick={e => { e.stopPropagation(); setShowSort(!showSort) }}
            className="flex items-center gap-1 p-1.5 rounded-lg bg-hive-elevated border border-hive-border text-text-muted hover:text-text-secondary hover:border-honey-500/30 transition-all"
            title={SORT_LABELS[sort]}
          >
            <ArrowUpDown size={12} />
          </button>
          {showSort && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-hive-elevated border border-hive-border rounded-xl shadow-2xl overflow-hidden min-w-[140px]">
              {(["newest","oldest","type","name"] as SortKey[]).map(k => (
                <button
                  key={k}
                  onClick={() => { setSort(k); setShowSort(false) }}
                  className={`w-full text-left px-3 py-2 text-[11px] hover:bg-hive-hover transition-colors ${sort === k ? "text-honey-500 font-medium" : "text-text-secondary"}`}
                >
                  {SORT_LABELS[k]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Filter tabs with counts ────────────────────────────── */}
      <div className="flex items-center gap-1 px-3 pb-2.5 overflow-x-auto scrollbar-hide shrink-0">
        {FILTER_TABS.map(({ key, label }) => {
          const count = counts[key] ?? 0
          const active = filterTab === key
          return (
            <button
              key={key}
              onClick={() => setFilterTab(key)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-all ${
                active
                  ? "bg-honey-500 text-black"
                  : "bg-hive-elevated border border-hive-border text-text-muted hover:text-text-secondary hover:border-honey-500/30"
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`${active ? "bg-black/20" : "bg-white/10"} rounded-full px-1 text-[9px] font-mono leading-4`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Grid ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {filtered.length === 0 ? (
          <EmptyState filter={filterTab} onPrompt={handlePrompt} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            {filtered.map(asset => {
              const badge = getTypeBadge(asset.assetType)
              return (
                <div
                  key={asset.id}
                  onClick={() => setPreview({
                    id: asset.id, name: asset.name, content: asset.content,
                    type: asset.assetType, chatId: asset.chatId, chatTitle: asset.chatTitle,
                    createdAt: asset.createdAt,
                  })}
                  className="group relative rounded-xl border border-white/[0.08] overflow-hidden cursor-pointer transition-all duration-200 hover:border-purple-500/40"
                  style={{
                    background: "#0f0f14",
                    boxShadow: "none",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(139,92,246,0.15)" }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = "none" }}
                >
                  {/* Thumbnail — 75% height */}
                  <div style={{ height: 130, background: "#1a1a24" }}>
                    <CardThumbnail name={asset.name} content={asset.content} type={asset.assetType} />
                  </div>

                  {/* Type badge — top-right corner */}
                  <div className={`absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold ${badge.bg} ${badge.text} backdrop-blur-sm`}>
                    {getTypeIcon(asset.assetType, 9)}
                    {badge.label}
                  </div>

                  {/* Footer — 25% */}
                  <div className="px-2.5 py-2 flex items-center gap-2" style={{ background: "#0a0a10", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-text-primary truncate leading-tight">
                        {asset.name.split("/").pop()}
                      </p>
                      <p className="text-[9px] text-text-muted/60 leading-tight mt-0.5">
                        {formatDate(asset.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); downloadAsset(asset.name, asset.content) }}
                        className="p-1 rounded-md hover:bg-white/10 text-text-muted hover:text-honey-500 transition-colors"
                        title="Download"
                      >
                        <Download size={11} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); if (window.confirm("Delete this asset?")) removeAsset(asset.id) }}
                        className="p-1 rounded-md hover:bg-red-500/20 text-text-muted hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Preview Modal ─────────────────────────────────────── */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(8px)" }}
          onClick={() => setPreview(null)}
        >
          <div
            className="relative flex flex-col rounded-2xl border border-white/10 overflow-hidden shadow-2xl"
            style={{ width: "min(92vw, 960px)", height: "min(88vh, 720px)", background: "#0a0a10" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0" style={{ borderColor: "rgba(255,255,255,0.08)", background: "#0f0f18" }}>
              <button
                onClick={() => setPreview(null)}
                className="flex items-center gap-1.5 text-text-muted hover:text-text-secondary transition-colors text-[11px]"
              >
                ← Back
              </button>
              <div className="flex-1 flex items-center gap-2 min-w-0">
                {(() => { const b = getTypeBadge(preview.type); return <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${b.bg} ${b.text}`}>{b.label}</span> })()}
                <span className="text-sm font-medium text-text-primary truncate">{preview.name.split("/").pop()}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {preview.chatId && (
                  <button
                    onClick={() => { setCurrentChat(preview.chatId); setActiveTab("chat"); setPreview(null) }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-text-secondary hover:bg-white/10 hover:text-text-primary transition-colors border border-white/10"
                  >
                    <MessageSquare size={11} />
                    Source
                  </button>
                )}
                <button
                  onClick={() => openInNewWindow(preview.content, preview.name, preview.type)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-text-secondary hover:bg-white/10 hover:text-text-primary transition-colors border border-white/10"
                >
                  <ExternalLink size={11} />
                  Open
                </button>
                <button
                  onClick={() => downloadAsset(preview.name, preview.content)}
                  className="p-1.5 rounded-lg text-text-secondary hover:bg-white/10 hover:text-honey-500 transition-colors border border-white/10"
                  title="Download"
                >
                  <Download size={13} />
                </button>
                <button
                  onClick={() => { if (window.confirm("Delete this asset?")) { removeAsset(preview.id); setPreview(null) } }}
                  className="p-1.5 rounded-lg text-text-secondary hover:bg-red-500/20 hover:text-red-400 transition-colors border border-white/10"
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
                <button
                  onClick={() => setPreview(null)}
                  className="p-1.5 rounded-lg text-text-secondary hover:bg-white/10 transition-colors border border-white/10"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Preview area */}
            <div className="flex-1 overflow-hidden" style={{ background: "#0a0a10" }}>
              <ModalPreview preview={preview} />
            </div>

            {/* Modal footer */}
            <div className="flex items-center gap-2 px-4 py-2.5 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "#0f0f18" }}>
              <span className="text-[10px] text-text-muted">Created by Sparkie</span>
              {preview.createdAt && (
                <span className="text-[10px] text-text-muted/50">· {new Date(preview.createdAt).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}</span>
              )}
              {preview.chatTitle && (
                <>
                  <span className="text-[10px] text-text-muted/30">·</span>
                  <span className="text-[10px] text-text-muted/50 truncate max-w-xs">From: {preview.chatTitle}</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ModalPreview({ preview }: { preview: PreviewModal }) {
  const ext = preview.name.split(".").pop()?.toLowerCase() || ""
  const { type, content, name } = preview

  if (type === "website") {
    return (
      <iframe
        srcDoc={content}
        sandbox="allow-scripts allow-same-origin"
        className="w-full h-full border-0"
        title={name}
      />
    )
  }

  if (type === "image") {
    const src = ext === "svg"
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`
      : isMediaUrl(content) ? content : null
    if (src) {
      return (
        <div className="w-full h-full flex items-center justify-center p-8" style={{ background: "#0a0a10" }}>
          <img src={src} alt={name} className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )
    }
  }

  if (type === "video" && isMediaUrl(content)) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: "#000" }}>
        <video src={content} controls autoPlay className="max-w-full max-h-full rounded-lg" />
      </div>
    )
  }

  if (type === "audio" && isMediaUrl(content)) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-6 p-8" style={{ background: "#0a0a10" }}>
        <div className="w-20 h-20 rounded-3xl bg-green-500/15 flex items-center justify-center ring-1 ring-green-500/20">
          <Music size={40} className="text-green-400" />
        </div>
        <p className="text-base font-medium text-text-primary text-center max-w-md">
          {name.split("/").pop()?.replace(/\.mp3$/, "")}
        </p>
        {/* Decorative waveform */}
        <div className="flex items-end gap-1 h-12">
          {Array.from({ length: 32 }).map((_, i) => {
            const h = [3,6,10,8,14,10,18,13,16,12,9,14,10,7,12,6,8,13,17,11,15,9,12,8,6,11,8,5,9,4,7,3][i]
            return <div key={i} className="w-1.5 rounded-sm bg-green-500/35" style={{ height: h * 2.5 }} />
          })}
        </div>
        <audio src={content} controls autoPlay className="w-full max-w-lg" style={{ colorScheme: "dark" }} />
      </div>
    )
  }

  return (
    <div className="w-full h-full overflow-auto p-4" style={{ background: "#0d0d18" }}>
      <pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap break-all leading-relaxed">
        {content}
      </pre>
    </div>
  )
}
