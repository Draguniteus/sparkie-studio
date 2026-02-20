"use client"

import { useMemo, useState, useCallback } from "react"
import { useAppStore } from "@/store/appStore"
import { Globe, RefreshCw, Maximize2 } from "lucide-react"

export function Preview() {
  const { files } = useAppStore()
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const previewHtml = useMemo(() => {
    const htmlFile = files.find((f) => f.name.endsWith(".html"))
    const cssFile = files.find((f) => f.name.endsWith(".css"))
    const jsFile = files.find((f) => f.name.endsWith(".js") && !f.name.endsWith(".min.js"))
    const svgFile = files.find((f) => f.name.endsWith(".svg"))

    // If we have an HTML file, use it as the base
    if (htmlFile?.content) {
      let html = htmlFile.content
      if (cssFile?.content) html = html.replace("</head>", `<style>${cssFile.content}</style></head>`)
      if (jsFile?.content) html = html.replace("</body>", `<script>${jsFile.content}<\/script></body>`)
      // If there's an SVG file referenced, inject it
      if (svgFile?.content && !html.includes(svgFile.name)) {
        html = html.replace("</body>", `${svgFile.content}</body>`)
      }
      return html
    }

    // If we only have an SVG, wrap it in a basic HTML page
    if (svgFile?.content) {
      return `<!DOCTYPE html><html><head><style>body{margin:0;background:#0a0a0a;display:flex;justify-content:center;align-items:center;min-height:100vh;}</style></head><body>${svgFile.content}</body></html>`
    }

    // If we only have CSS/JS, build a minimal page
    if (cssFile?.content || jsFile?.content) {
      return `<!DOCTYPE html><html><head><style>${cssFile?.content || ""}</style></head><body><script>${jsFile?.content || ""}<\/script></body></html>`
    }

    return null
  }, [files, refreshKey])

  if (!previewHtml) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted p-8 bg-hive-600">
        <Globe size={32} className="mb-3 text-honey-500/30" />
        <p className="text-sm font-medium text-text-secondary mb-1">Live Preview</p>
        <p className="text-xs text-center">Generated projects will appear here</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-black">
      <div className="flex items-center h-7 px-3 bg-hive-700 border-b border-hive-border shrink-0">
        <Globe size={12} className="text-text-muted mr-2" />
        <span className="text-[11px] text-text-muted flex-1">Preview</span>
        <button onClick={refresh} className="p-1 rounded hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors" title="Refresh">
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <iframe
          key={refreshKey}
          srcDoc={previewHtml}
          title="Preview"
          sandbox="allow-scripts allow-modals"
          className="w-full h-full border-0"
        />
      </div>
    </div>
  )
}
