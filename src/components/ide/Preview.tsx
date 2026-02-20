"use client"

import { useMemo, useState, useCallback } from "react"
import { useAppStore } from "@/store/appStore"
import { Globe, RefreshCw, Code, FileText, Braces } from "lucide-react"

const PREVIEW_BASE_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    width: 100%; height: 100%;
    overflow: hidden;
    background: #0a0a0a;
  }
  svg:only-child, body > svg {
    display: block;
    width: 100% !important;
    height: 100% !important;
    max-width: 100vw;
    max-height: 100vh;
  }
  canvas { max-width: 100%; max-height: 100%; display: block; }
  body { display: flex; justify-content: center; align-items: center; }
`

// Syntax highlight theme for non-runnable code display
const CODE_VIEWER_STYLES = `
  body {
    margin: 0; padding: 16px;
    font-family: 'Fira Code', 'Cascadia Code', monospace;
    font-size: 13px; line-height: 1.6;
    background: #0d0d0d; color: #e2e8f0;
    overflow: auto; height: 100vh;
    white-space: pre-wrap; word-break: break-all;
  }
  .line-num { color: #374151; user-select: none; display: inline-block; width: 2.5em; text-align: right; margin-right: 16px; }
  .kw { color: #c084fc; } .str { color: #86efac; } .num { color: #fbbf24; }
  .cmt { color: #4b5563; font-style: italic; } .fn { color: #60a5fa; }
  .type { color: #f0abfc; } .op { color: #94a3b8; }
`

function buildCodeViewerHtml(content: string, lang: string): string {
  const escaped = content
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const lines = escaped.split("\n")
  const numbered = lines.map((line, i) =>
    `<span class="line-num">${i + 1}</span>${line}`
  ).join("\n")
  return `<!DOCTYPE html><html><head><style>${CODE_VIEWER_STYLES}</style></head><body>${numbered}</body></html>`
}

function buildMarkdownHtml(content: string): string {
  // Simple markdown → HTML (headings, bold, italic, code, lists, links)
  let html = content
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>")
  return `<!DOCTYPE html><html><head><style>
    body { font-family: system-ui, sans-serif; padding: 24px; max-width: 800px; margin: 0 auto;
      background: #111; color: #e2e8f0; line-height: 1.7; }
    h1,h2,h3 { color: #FFC30B; margin-top: 1.5em; }
    code { background: #1e1e1e; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
    a { color: #60a5fa; } ul { padding-left: 1.5em; } li { margin: 4px 0; }
    strong { color: #f1f5f9; } em { color: #94a3b8; }
  </style></head><body><p>${html}</p></body></html>`
}

function buildJsonHtml(content: string): string {
  try {
    const pretty = JSON.stringify(JSON.parse(content), null, 2)
    const escaped = pretty.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"([^"]+)":/g, '<span class="kw">"$1"</span>:')
      .replace(/: "([^"]*)"/g, ': <span class="str">"$1"</span>')
      .replace(/: (\d+\.?\d*)/g, ': <span class="num">$1</span>')
      .replace(/: (true|false|null)/g, ': <span class="fn">$1</span>')
    return `<!DOCTYPE html><html><head><style>${CODE_VIEWER_STYLES}body{padding:16px;}</style></head><body><pre>${escaped}</pre></body></html>`
  } catch {
    return buildCodeViewerHtml(content, "json")
  }
}

function buildReactHtml(jsxContent: string, cssContent?: string): string {
  const css = cssContent || ""
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    ${PREVIEW_BASE_STYLES}
    ${css}
    body { overflow: auto; display: block; }
    #root { width: 100%; min-height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    ${jsxContent}
    const rootEl = document.getElementById('root');
    const root = ReactDOM.createRoot(rootEl);
    // Try to find a default export or App component
    const Component = typeof App !== 'undefined' ? App
      : typeof default_1 !== 'undefined' ? default_1
      : () => React.createElement('div', {style:{padding:24,color:'#e2e8f0'}}, 'Component rendered');
    root.render(React.createElement(Component));
  </script>
</body>
</html>`
}

type PreviewMode = "render" | "code"

export function Preview() {
  const { files } = useAppStore()
  const [refreshKey, setRefreshKey] = useState(0)
  const [mode, setMode] = useState<PreviewMode>("render")

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const { previewHtml, previewType, hasRunnable } = useMemo(() => {
    const htmlFile = files.find((f) => f.name.endsWith(".html"))
    const cssFile = files.find((f) => f.name.endsWith(".css"))
    const jsFile = files.find((f) => f.name.endsWith(".js") && !f.name.endsWith(".min.js"))
    const tsxFile = files.find((f) => f.name.endsWith(".tsx") || f.name.endsWith(".jsx"))
    const svgFile = files.find((f) => f.name.endsWith(".svg"))
    const mdFile = files.find((f) => f.name.endsWith(".md") || f.name.endsWith(".mdx"))
    const jsonFile = files.find((f) => f.name.endsWith(".json"))
    const pyFile = files.find((f) => f.name.endsWith(".py"))
    const anyCode = files.find((f) => f.type === "file" && f.content)

    // ── HTML (primary render target) ──
    if (htmlFile?.content) {
      let html = htmlFile.content
      const baseTag = `<style id="__sparkie_base">${PREVIEW_BASE_STYLES}html,body{overflow:auto;display:block;}</style>`
      html = html.includes("<head>") ? html.replace("<head>", `<head>${baseTag}`) : baseTag + html
      if (cssFile?.content) html = html.replace("</head>", `<style>${cssFile.content}</style></head>`)
      if (jsFile?.content) html = html.replace("</body>", `<script>${jsFile.content}<\/script></body>`)
      if (svgFile?.content && !html.includes(svgFile.name)) {
        html = html.replace("</body>", `${svgFile.content}</body>`)
      }
      return { previewHtml: html, previewType: "html", hasRunnable: true }
    }

    // ── React/TSX/JSX ──
    if (tsxFile?.content) {
      return { previewHtml: buildReactHtml(tsxFile.content, cssFile?.content), previewType: "react", hasRunnable: true }
    }

    // ── SVG only ──
    if (svgFile?.content) {
      const svgContent = svgFile.content.replace(
        /<svg([^>]*)>/i,
        (_m, attrs) => {
          const cleaned = attrs
            .replace(/\s+width\s*=\s*["'][^"']*["']/gi, "")
            .replace(/\s+height\s*=\s*["'][^"']*["']/gi, "")
          return `<svg${cleaned} style="width:100%;height:100%;max-width:100vw;max-height:100vh;">`
        }
      )
      const html = `<!DOCTYPE html><html><head><style>${PREVIEW_BASE_STYLES}</style></head><body>${svgContent}</body></html>`
      return { previewHtml: html, previewType: "svg", hasRunnable: true }
    }

    // ── Standalone JS/CSS ──
    if (jsFile?.content || cssFile?.content) {
      const html = `<!DOCTYPE html><html><head><style>${PREVIEW_BASE_STYLES}${cssFile?.content || ""}</style></head><body><script>${jsFile?.content || ""}<\/script></body></html>`
      return { previewHtml: html, previewType: "js", hasRunnable: true }
    }

    // ── Markdown ──
    if (mdFile?.content) {
      return { previewHtml: buildMarkdownHtml(mdFile.content), previewType: "markdown", hasRunnable: true }
    }

    // ── JSON ──
    if (jsonFile?.content) {
      return { previewHtml: buildJsonHtml(jsonFile.content), previewType: "json", hasRunnable: true }
    }

    // ── Python / other code → syntax viewer ──
    if (pyFile?.content) {
      return { previewHtml: buildCodeViewerHtml(pyFile.content, "python"), previewType: "code", hasRunnable: true }
    }

    // ── Any other file → code viewer ──
    if (anyCode?.content) {
      const lang = anyCode.name.split(".").pop() || "txt"
      return { previewHtml: buildCodeViewerHtml(anyCode.content, lang), previewType: "code", hasRunnable: true }
    }

    return { previewHtml: null, previewType: null, hasRunnable: false }
  }, [files, refreshKey])

  const typeLabel: Record<string, string> = {
    html: "HTML", react: "React", svg: "SVG", js: "JS",
    markdown: "Markdown", json: "JSON", code: "Code", 
  }

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
      <div className="flex items-center h-7 px-3 bg-hive-700 border-b border-hive-border shrink-0 gap-2">
        <Globe size={12} className="text-text-muted" />
        <span className="text-[11px] text-text-muted flex-1">
          Preview
          {previewType && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-honey-500/10 text-honey-500 border border-honey-500/20">
              {typeLabel[previewType] || previewType}
            </span>
          )}
        </span>
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
          sandbox="allow-scripts allow-modals allow-forms allow-popups"
          className="w-full h-full border-0 block"
        />
      </div>
    </div>
  )
}
