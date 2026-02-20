"use client"

import { useMemo, useState, useCallback } from "react"
import { useAppStore } from "@/store/appStore"
import { Globe, RefreshCw } from "lucide-react"

// CSS injected into every preview to guarantee scale-to-fit (no overflow/scrollbars)
const PREVIEW_BASE_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    width: 100%; height: 100%;
    overflow: hidden;
    background: #0a0a0a;
  }
  /* Scale root SVG to fit container */
  svg:only-child, body > svg {
    display: block;
    width: 100% !important;
    height: 100% !important;
    max-width: 100vw;
    max-height: 100vh;
    object-fit: contain;
  }
  /* Canvas fills container */
  canvas { max-width: 100%; max-height: 100%; display: block; }
  /* Flex-center any single top-level element */
  body {
    display: flex;
    justify-content: center;
    align-items: center;
  }
`

export function Preview() {
  const { files } = useAppStore()
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const previewHtml = useMemo(() => {
    const htmlFile = files.find((f) => f.name.endsWith(".html"))
    const cssFile = files.find((f) => f.name.endsWith(".css"))
    const jsFile = files.find((f) => f.name.endsWith(".js") && !f.name.endsWith(".min.js"))
    const svgFile = files.find((f) => f.name.endsWith(".svg"))

    if (htmlFile?.content) {
      let html = htmlFile.content
      // Inject scale-to-fit base styles first, then user CSS
      const baseTag = `<style id="__sparkie_base">${PREVIEW_BASE_STYLES}</style>`
      if (html.includes("<head>")) {
        html = html.replace("<head>", `<head>${baseTag}`)
      } else {
        html = baseTag + html
      }
      if (cssFile?.content) html = html.replace("</head>", `<style>${cssFile.content}</style></head>`)
      if (jsFile?.content) html = html.replace("</body>", `<script>${jsFile.content}<\/script></body>`)
      if (svgFile?.content && !html.includes(svgFile.name)) {
        html = html.replace("</body>", `${svgFile.content}</body>`)
      }
      return html
    }

    // SVG-only — scale to fit perfectly
    if (svgFile?.content) {
      // Strip fixed width/height from root SVG tag and use viewBox-based scaling
      const svgContent = svgFile.content.replace(
        /<svg([^>]*)>/i,
        (match, attrs) => {
          // Keep viewBox but remove explicit width/height that cause overflow
          const cleaned = attrs
            .replace(/\s+width\s*=\s*["'][^"']*["']/gi, "")
            .replace(/\s+height\s*=\s*["'][^"']*["']/gi, "")
          return `<svg${cleaned} style="width:100%;height:100%;max-width:100vw;max-height:100vh;">`
        }
      )
      return `<!DOCTYPE html><html><head><style>${PREVIEW_BASE_STYLES}</style></head><body>${svgContent}</body></html>`
    }

    if (cssFile?.content || jsFile?.content) {
      return `<!DOCTYPE html><html><head><style>${PREVIEW_BASE_STYLES}${cssFile?.content || ""}</style></head><body><script>${jsFile?.content || ""}<\/script></body></html>`
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
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      <div className="flex items-center h-7 px-3 bg-hive-700 border-b border-hive-border shrink-0">
        <Globe size={12} className="text-text-muted mr-2" />
        <span className="text-[11px] text-text-muted flex-1">Preview</span>
        <button
          onClick={refresh}
          className="p-1 rounded hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors"
          title="Refresh"
        >
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <iframe
          key={refreshKey}
          srcDoc={previewHtml}
          title="Preview"
          sandbox="allow-scripts allow-modals"
          className="w-full h-full border-0 block"
          style={{ display: "block" }}
        />
      </div>
    </div>
  )
}
