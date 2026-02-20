"use client"

import { useMemo } from "react"
import { useAppStore } from "@/store/appStore"
import { Globe, RefreshCw } from "lucide-react"

export function Preview() {
  const { files } = useAppStore()

  // Build a simple preview from HTML/JS/CSS files
  const previewHtml = useMemo(() => {
    const htmlFile = files.find((f) => f.name.endsWith(".html"))
    const cssFile = files.find((f) => f.name.endsWith(".css"))
    const jsFile = files.find(
      (f) => f.name.endsWith(".js") || f.name.endsWith(".ts")
    )

    if (!htmlFile && !cssFile && !jsFile) return null

    const html = htmlFile?.content || "<!DOCTYPE html><html><head></head><body></body></html>"
    const css = cssFile?.content ? `<style>${cssFile.content}</style>` : ""
    const js = jsFile?.content ? `<script>${jsFile.content}<\/script>` : ""

    // Inject CSS and JS into the HTML
    const fullHtml = html
      .replace("</head>", `${css}</head>`)
      .replace("</body>", `${js}</body>`)

    return fullHtml
  }, [files])

  if (!previewHtml) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted p-8">
        <Globe size={24} className="mb-2 text-honey-500/40" />
        <p className="text-xs text-center">
          Create an HTML, CSS, or JS file to see a live preview
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center h-8 px-3 border-b border-hive-border bg-hive-700 shrink-0">
        <Globe size={12} className="text-text-muted mr-2" />
        <span className="text-[11px] text-text-muted flex-1">Preview</span>
        <button
          className="p-1 rounded hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors"
          title="Refresh"
        >
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="flex-1 bg-white">
        <iframe
          srcDoc={previewHtml}
          title="Preview"
          sandbox="allow-scripts allow-modals"
          className="w-full h-full border-0"
        />
      </div>
    </div>
  )
}
