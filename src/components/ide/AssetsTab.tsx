"use client"

import { useState, useMemo } from "react"
import { useAppStore, AssetType, AssetSource } from "@/store/appStore"
import { Download, Search, X, ExternalLink, MessageSquare, FileCode, Globe, FileText, Music, Video, Table, Presentation, File, ChevronDown } from "lucide-react"

// ── Helpers ────────────────────────────────────────────────────────────────

function detectAssetType(name: string, language: string): AssetType {
  const ext = name.split(".").pop()?.toLowerCase() || ""
  if (["html", "htm"].includes(ext)) return "website"
  if (["jpg", "jpeg", "png", "gif", "svg", "webp", "ico", "bmp"].includes(ext)) return "image"
  if (["mp3", "wav", "ogg", "aac", "flac", "m4a"].includes(ext)) return "audio"
  if (["mp4", "webm", "mov", "avi", "mkv"].includes(ext)) return "video"
  if (["xlsx", "xls", "csv"].includes(ext)) return "excel"
  if (["pptx", "ppt"].includes(ext)) return "ppt"
  if (["pdf", "doc", "docx", "txt", "md"].includes(ext)) return "document"
  if (["js", "ts", "jsx", "tsx", "py", "css", "json"].includes(ext)) return "other"
  return "other"
}

function getTypeIcon(type: AssetType) {
  const cls = "shrink-0"
  switch (type) {
    case "website": return <Globe size={14} className={cls} />
    case "document": return <FileText size={14} className={cls} />
    case "image": return <FileCode size={14} className={cls} />
    case "audio": return <Music size={14} className={cls} />
    case "video": return <Video size={14} className={cls} />
    case "excel": return <Table size={14} className={cls} />
    case "ppt": return <Presentation size={14} className={cls} />
    default: return <File size={14} className={cls} />
  }
}

function getTypeColor(type: AssetType): string {
  switch (type) {
    case "website": return "text-blue-400 bg-blue-400/10"
    case "document": return "text-purple-400 bg-purple-400/10"
    case "image": return "text-green-400 bg-green-400/10"
    case "audio": return "text-pink-400 bg-pink-400/10"
    case "video": return "text-red-400 bg-red-400/10"
    case "excel": return "text-emerald-400 bg-emerald-400/10"
    case "ppt": return "text-orange-400 bg-orange-400/10"
    default: return "text-honey-500 bg-honey-500/10"
  }
}

// Helper: detect media URL — handles both absolute (https://) and relative (/api/image?) paths
function isMediaUrl(content: string): boolean {
  return content.startsWith('http://') || content.startsWith('https://') || content.startsWith('/api/') || content.startsWith('data:')
}

// Source code files belong in Files tab only — never surface in Assets
const SOURCE_FILE_EXTS = new Set(["js","ts","jsx","tsx","css","scss","json","py","rb","go","rs","cpp","c","h","java","php","sh","yaml","yml","toml","xml","env","lock","config","gitignore","prettierrc","eslintrc","babelrc"])

function isSourceFile(name: string): boolean {
  const ext = (name.split(".").pop() || "").toLowerCase()
  return SOURCE_FILE_EXTS.has(ext)
}

function AssetThumbnail({ name, content, type }: { name: string; content: string; type: AssetType }) {
  const ext = name.split(".").pop()?.toLowerCase() || ""

  // For HTML — show a mini preview via srcdoc
  if (type === "website" && (ext === "html" || ext === "htm")) {
    return (
      <div className="w-full h-full overflow-hidden rounded-t-lg bg-white">
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

  // For images (SVG, PNG, etc.) — render as data URI
  if (type === "image") {
    if (ext === "svg") {
      const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#0a0a0a] rounded-t-lg p-3 ring-1 ring-honey-500/20">
          <img src={dataUri} alt={name} className="max-w-full max-h-full object-contain" />
        </div>
      )
    }
    // URL-based images (Pollinations PNG/JPG or /api/image? proxy) — render directly
    if (isMediaUrl(content)) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#0a0a0a] rounded-t-lg overflow-hidden ring-1 ring-honey-500/20">
          <img src={content} alt={name} className="w-full h-full object-cover" loading="lazy" />
        </div>
      )
    }
  }

  if (type === "video") {
    // URL-based video (Pollinations or /api/image? proxy) — show video thumbnail
    if (isMediaUrl(content)) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#0a0a0a] rounded-t-lg overflow-hidden relative ring-1 ring-blue-500/30">
          <video src={content} className="w-full h-full object-cover" muted autoPlay loop playsInline preload="metadata" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
              <Video size={14} className="text-white ml-0.5" />
            </div>
          </div>
        </div>
      )
    }
  }

  // Audio — mini player card
  if (type === "audio") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 rounded-t-lg bg-gradient-to-b from-pink-500/10 to-pink-500/5 ring-1 ring-pink-500/20 px-3">
        <div className="w-10 h-10 rounded-xl bg-pink-500/15 flex items-center justify-center">
          <Music size={20} className="text-pink-400" />
        </div>
        <p className="text-[10px] text-pink-400/80 font-medium text-center truncate w-full px-2">
          {name.split("/").pop()?.replace(/\.mp3$/, "") || "Audio"}
        </p>
        {isMediaUrl(content) && (
          <audio
            src={content}
            controls
            className="w-full"
            style={{ height: 32, colorScheme: "dark" }}
            onClick={e => e.stopPropagation()}
          />
        )}
      </div>
    )
  }

  // Default: colored icon placeholder
  const typeColor = getTypeColor(type)
  const ext4 = ext.slice(0, 4).toUpperCase() || "FILE"
  return (
    <div className={`w-full h-full flex flex-col items-center justify-center gap-2 rounded-t-lg ${typeColor.split(" ")[1]}`}>
      <span className={`text-2xl font-mono font-bold ${typeColor.split(" ")[0]}`}>{ext4}</span>
      <span className={`text-[10px] font-medium opacity-60 ${typeColor.split(" ")[0]}`}>{name.split("/").pop()?.slice(0, 16)}</span>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

type FilterTab = "all" | AssetType
const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "website", label: "Website" },
  { key: "document", label: "Document" },
  { key: "excel", label: "Excel" },
  { key: "ppt", label: "PPT" },
  { key: "image", label: "Image" },
  { key: "video", label: "Video" },
  { key: "audio", label: "Audio" },
]

interface PreviewModal {
  name: string
  content: string
  type: AssetType
  chatId: string
  chatTitle: string
}

export function AssetsTab() {
  const { assets, setCurrentChat, setActiveTab } = useAppStore()
  const [filterTab, setFilterTab] = useState<FilterTab>("all")
  const [sourceFilter, setSourceFilter] = useState<AssetSource | "all">("all")
  const [search, setSearch] = useState("")
  const [preview, setPreview] = useState<PreviewModal | null>(null)
  const [showSourceMenu, setShowSourceMenu] = useState(false)

  // Enrich assets with auto-detected type if missing
  const enriched = useMemo(() =>
    assets.map(a => ({
      ...a,
      assetType: a.assetType || detectAssetType(a.name, a.language),
      source: a.source || ("agent" as AssetSource),
    })),
    [assets]
  )

  // Filter
  const filtered = useMemo(() => {
    return enriched
      .slice()
      .reverse()
      .filter(a => {
        // Exclude raw source/config files (they live in Files tab)
        if (isSourceFile(a.name)) return false
        // Exclude AI conversational text captured as nameless doc
        if (a.source === "agent" && a.assetType === "document" && !a.name.match(/\.(pdf|doc|docx|txt|md)$/i)) return false
        if (filterTab !== "all" && a.assetType !== filterTab) return false
        if (sourceFilter !== "all" && a.source !== sourceFilter) return false
        if (search) {
          const q = search.toLowerCase()
          if (!a.name.toLowerCase().includes(q) && !a.chatTitle.toLowerCase().includes(q)) return false
        }
        return true
      })
  }, [enriched, filterTab, sourceFilter, search])

  async function downloadAsset(name: string, content: string) {
    // Derive correct MIME type from filename extension so browser saves with the right type
    const ext = name.split(".").pop()?.toLowerCase() || ""
    const MIME_MAP: Record<string, string> = {
      mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", aac: "audio/aac",
      mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
      svg: "image/svg+xml", webp: "image/webp",
      pdf: "application/pdf", txt: "text/plain", md: "text/markdown",
      html: "text/html", htm: "text/html", json: "application/json",
      csv: "text/csv",
    }
    const mimeType = MIME_MAP[ext] || "application/octet-stream"
    let objectUrl: string | null = null
    try {
      if (isMediaUrl(content)) {
        const res = await fetch(content)
        // Use server MIME if available and sensible, otherwise use our derived one
        const serverMime = res.headers.get("content-type")?.split(";")[0].trim()
        const blob = await res.blob()
        const typedBlob = new Blob([blob], { type: serverMime || mimeType })
        objectUrl = URL.createObjectURL(typedBlob)
      } else {
        const blob = new Blob([content], { type: mimeType })
        objectUrl = URL.createObjectURL(blob)
      }
      const a = document.createElement("a")
      a.href = objectUrl
      a.download = name  // name already has the correct extension
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {
      if (isMediaUrl(content)) window.open(content, "_blank")
    } finally {
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl!), 1000)
    }
  }

  function openInNewWindow(content: string, name: string, type: AssetType) {
    const ext = name.split(".").pop()?.toLowerCase() || ""
    if (type === "website" && (ext === "html" || ext === "htm")) {
      const win = window.open("", "_blank")
      if (win) {
        win.document.open()
        win.document.write(content)
        win.document.close()
      }
    } else if (type === "image" || type === "video") {
      // URL-based (Pollinations) — open directly
      if (isMediaUrl(content)) {
        window.open(content, "_blank")
      } else if (ext === "svg") {
        const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`
        window.open(dataUri, "_blank")
      }
    } else if (type === "audio") {
      if (isMediaUrl(content)) window.open(content, "_blank")
    } else {
      const blob = new Blob([content], { type: "text/plain" })
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank")
    }
  }

  const sourceLabel = sourceFilter === "all" ? "All Sources" : sourceFilter === "agent" ? "From Agent" : "From You"

  // Empty state
  if (assets.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <AssetsHeader
          filterTab={filterTab} setFilterTab={setFilterTab}
          sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
          sourceLabel={sourceLabel} showSourceMenu={showSourceMenu}
          setShowSourceMenu={setShowSourceMenu}
          search={search} setSearch={setSearch}
        />
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-hive-elevated flex items-center justify-center mb-4">
            <Globe size={28} className="text-honey-500/40" />
          </div>
          <p className="text-sm font-medium text-text-secondary mb-1">No assets yet</p>
          <p className="text-[11px] text-text-muted leading-relaxed">
            Files and projects created by Sparkie will appear here,<br />
            organized by type and ready to reuse.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" onClick={() => showSourceMenu && setShowSourceMenu(false)}>
      <AssetsHeader
        filterTab={filterTab} setFilterTab={setFilterTab}
        sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
        sourceLabel={sourceLabel} showSourceMenu={showSourceMenu}
        setShowSourceMenu={setShowSourceMenu}
        search={search} setSearch={setSearch}
      />

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-text-muted">No assets match your filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(asset => (
              <div
                key={asset.id}
                onClick={() => setPreview({ name: asset.name, content: asset.content, type: asset.assetType, chatId: asset.chatId, chatTitle: asset.chatTitle })}
                className="group relative flex flex-col rounded-xl border border-hive-border bg-hive-elevated hover:border-honey-500/30 hover:bg-hive-hover transition-all cursor-pointer overflow-hidden"
                style={{ height: "160px" }}
              >
                {/* Thumbnail */}
                <div className="flex-1 overflow-hidden">
                  <AssetThumbnail name={asset.name} content={asset.content} type={asset.assetType} />
                </div>

                {/* Footer */}
                <div className="px-2.5 py-2 border-t border-hive-border bg-hive-700/80 flex items-center gap-2">
                  <div className={`p-1 rounded-md ${getTypeColor(asset.assetType)}`}>
                    {getTypeIcon(asset.assetType)}
                  </div>
                  <span className="text-[11px] font-medium text-text-primary truncate flex-1">
                    {asset.name.split("/").pop()}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); downloadAsset(asset.name, asset.content) }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-hive-border text-text-muted hover:text-honey-500 transition-all"
                    title="Download"
                  >
                    <Download size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setPreview(null)}
        >
          <div
            className="relative bg-hive-700 rounded-2xl border border-hive-border shadow-2xl overflow-hidden flex flex-col"
            style={{ width: "min(90vw, 900px)", height: "min(85vh, 700px)" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-hive-border bg-hive-elevated shrink-0">
              <div className={`p-1.5 rounded-md ${getTypeColor(preview.type)}`}>
                {getTypeIcon(preview.type)}
              </div>
              <span className="text-sm font-medium text-text-primary truncate flex-1">{preview.name.split("/").pop()}</span>

              {/* Action buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    setCurrentChat(preview.chatId)
                    setActiveTab("chat")
                    setPreview(null)
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-text-secondary hover:bg-hive-hover hover:text-text-primary transition-colors border border-hive-border"
                  title="Locate in task"
                >
                  <MessageSquare size={12} />
                  Locate in Task
                </button>
                <button
                  onClick={() => openInNewWindow(preview.content, preview.name, preview.type)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-text-secondary hover:bg-hive-hover hover:text-text-primary transition-colors border border-hive-border"
                  title="Open in new window"
                >
                  <ExternalLink size={12} />
                  Open
                </button>
                <button
                  onClick={() => downloadAsset(preview.name, preview.content)}
                  className="p-1.5 rounded-lg text-text-secondary hover:bg-hive-hover hover:text-honey-500 transition-colors border border-hive-border"
                  title="Download"
                >
                  <Download size={14} />
                </button>
                <button
                  onClick={() => setPreview(null)}
                  className="p-1.5 rounded-lg text-text-secondary hover:bg-hive-hover hover:text-accent-error transition-colors border border-hive-border"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Preview Content */}
            <div className="flex-1 overflow-hidden bg-white">
              <PreviewContent preview={preview} />
            </div>

            {/* Modal footer */}
            <div className="flex items-center gap-2 px-4 py-2 border-t border-hive-border bg-hive-elevated shrink-0">
              <MessageSquare size={11} className="text-text-muted" />
              <span className="text-[11px] text-text-muted">From: {preview.chatTitle}</span>
              <span className="ml-auto text-[10px] text-text-muted opacity-50">Created by Sparkie Agent</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PreviewContent({ preview }: { preview: PreviewModal }) {
  const ext = preview.name.split(".").pop()?.toLowerCase() || ""
  const { type, content, name } = preview

  if (type === "website" && (ext === "html" || ext === "htm")) {
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
    if (ext === "svg") {
      const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`
      return (
        <div className="w-full h-full flex items-center justify-center bg-hive-elevated p-8">
          <img src={dataUri} alt={name} className="max-w-full max-h-full object-contain" />
        </div>
      )
    }
    if (isMediaUrl(content)) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-hive-elevated p-8">
          <img src={content} alt={name} className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )
    }
  }

  if (type === "video" && isMediaUrl(content)) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <video src={content} controls className="max-w-full max-h-full rounded-lg" />
      </div>
    )
  }

  // Audio player
  if (type === "audio" && isMediaUrl(content)) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-hive-elevated p-8">
        <div className="w-16 h-16 rounded-2xl bg-pink-500/15 flex items-center justify-center">
          <Music size={32} className="text-pink-400" />
        </div>
        <p className="text-sm font-medium text-text-primary text-center max-w-md">{name.split("/").pop()?.replace(/\.mp3$/, "")}</p>
        <audio src={content} controls autoPlay className="w-full max-w-md" style={{ colorScheme: "dark" }} />
      </div>
    )
  }

  // Code/text fallback — show with syntax highlight vibe
  return (
    <div className="w-full h-full overflow-auto bg-hive-600 p-4">
      <pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap break-all leading-relaxed">
        {content}
      </pre>
    </div>
  )
}

// ── Header subcomponent ────────────────────────────────────────────────────

interface HeaderProps {
  filterTab: FilterTab
  setFilterTab: (t: FilterTab) => void
  sourceFilter: AssetSource | "all"
  setSourceFilter: (s: AssetSource | "all") => void
  sourceLabel: string
  showSourceMenu: boolean
  setShowSourceMenu: (v: boolean) => void
  search: string
  setSearch: (v: string) => void
}

function AssetsHeader({ filterTab, setFilterTab, sourceFilter, setSourceFilter, sourceLabel, showSourceMenu, setShowSourceMenu, search, setSearch }: HeaderProps) {
  return (
    <div className="flex flex-col border-b border-hive-border shrink-0">
      {/* Top row: source toggle + search */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Source dropdown */}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowSourceMenu(!showSourceMenu) }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-hive-elevated border border-hive-border text-[11px] font-medium text-text-secondary hover:text-text-primary hover:border-honey-500/40 transition-all"
          >
            {sourceLabel}
            <ChevronDown size={11} />
          </button>
          {showSourceMenu && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-hive-elevated border border-hive-border rounded-lg shadow-xl overflow-hidden min-w-[130px]">
              {([["all", "All Sources"], ["agent", "From Agent"], ["user", "From You"]] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => { setSourceFilter(val); setShowSourceMenu(false) }}
                  className={`w-full text-left px-3 py-2 text-[11px] hover:bg-hive-hover transition-colors ${sourceFilter === val ? "text-honey-500 font-medium" : "text-text-secondary"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-hive-elevated border border-hive-border focus-within:border-honey-500/40 transition-colors">
          <Search size={12} className="text-text-muted shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by file or task name"
            className="flex-1 bg-transparent text-[11px] text-text-primary placeholder:text-text-muted outline-none min-w-0"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-text-muted hover:text-text-secondary transition-colors">
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-3 pb-2.5 overflow-x-auto scrollbar-hide">
        {FILTER_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilterTab(key)}
            className={`px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all ${
              filterTab === key
                ? "bg-honey-500 text-black"
                : "bg-hive-elevated border border-hive-border text-text-muted hover:text-text-secondary hover:border-honey-500/30"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
