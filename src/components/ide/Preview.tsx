"use client"

import { useMemo, useState, useCallback } from "react"
import { useAppStore } from "@/store/appStore"
import { Globe, RefreshCw, Loader2, ExternalLink } from "lucide-react"

const PREVIEW_BASE_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; width: 100%; height: 100%;
    overflow: hidden; background: #0a0a0a;
  }
  svg:only-child, body > svg {
    display: block; width: 100% !important; height: 100% !important;
    max-width: 100vw; max-height: 100vh;
  }
  canvas { max-width: 100%; max-height: 100%; display: block; }
  body { display: flex; justify-content: center; align-items: center; }
`
const CODE_VIEWER_STYLES = `
  body { margin:0; padding:16px; font-family:'Fira Code','Cascadia Code',monospace;
    font-size:13px; line-height:1.6; background:#0d0d0d; color:#e2e8f0;
    overflow:auto; height:100vh; white-space:pre-wrap; word-break:break-all; }
  .line-num { color:#374151; user-select:none; display:inline-block; width:2.5em;
    text-align:right; margin-right:16px; }
  .kw{color:#c084fc} .str{color:#86efac} .num{color:#fbbf24}
  .cmt{color:#4b5563;font-style:italic} .fn{color:#60a5fa}
`

function buildCodeViewerHtml(content: string): string {
  const escaped = content.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
  const lines = escaped.split("\n")
  const numbered = lines.map((l,i) => `<span class="line-num">${i+1}</span>${l}`).join("\n")
  return `<!DOCTYPE html><html><head><style>${CODE_VIEWER_STYLES}</style></head><body>${numbered}</body></html>`
}

function buildMarkdownHtml(content: string): string {
  let html = content
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/^### (.+)$/gm,"<h3>$1</h3>").replace(/^## (.+)$/gm,"<h2>$1</h2>").replace(/^# (.+)$/gm,"<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>")
    .replace(/`([^`]+)`/g,"<code>$1</code>")
    .replace(/^- (.+)$/gm,"<li>$1</li>").replace(/(<li>.*<\/li>\n?)+/g,"<ul>$&</ul>")
    .replace(/\n{2,}/g,"</p><p>").replace(/\n/g,"<br>")
  return `<!DOCTYPE html><html><head><style>
    body{font-family:system-ui,sans-serif;padding:24px;max-width:800px;margin:0 auto;
      background:#111;color:#e2e8f0;line-height:1.7}
    h1,h2,h3{color:#FFC30B;margin-top:1.5em}
    code{background:#1e1e1e;padding:2px 6px;border-radius:4px;font-family:monospace}
    ul{padding-left:1.5em} li{margin:4px 0} strong{color:#f1f5f9} em{color:#94a3b8}
  </style></head><body><p>${html}</p></body></html>`
}

function buildJsonHtml(content: string): string {
  try {
    const pretty = JSON.stringify(JSON.parse(content), null, 2)
    const esc = pretty.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"([^"]+)":/g,'<span class="kw">"$1"</span>:')
      .replace(/: "([^"]*)"/g,': <span class="str">"$1"</span>')
      .replace(/: (\d+\.?\d*)/g,': <span class="num">$1</span>')
    return `<!DOCTYPE html><html><head><style>${CODE_VIEWER_STYLES}body{padding:16px}</style></head><body><pre>${esc}</pre></body></html>`
  } catch { return buildCodeViewerHtml(content) }
}

function buildReactHtml(jsx: string, css?: string): string {
  return `<!DOCTYPE html><html><head>
  <meta charset="UTF-8">
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>*{box-sizing:border-box}body{margin:0;background:#0a0a0a;color:#e2e8f0;font-family:system-ui}${css||""}</style>
  </head><body><div id="root"></div>
  <script type="text/babel">
    ${jsx}
    const _C = typeof App!=="undefined"?App:()=>React.createElement("div",{style:{padding:24}},"Rendered");
    ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(_C));
  </script></body></html>`
}

// ── Runtime error overlay script (injected into every srcdoc) ────────────────
const ERROR_OVERLAY_SCRIPT = `<script>
(function() {
  function showError(msg, src, line, col) {
    var existing = document.getElementById('__sparkie_err');
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.id = '__sparkie_err';
    overlay.style.cssText = [
      'position:fixed','top:0','left:0','right:0','bottom:0',
      'background:rgba(10,10,10,0.92)','z-index:999999',
      'display:flex','align-items:center','justify-content:center',
      'font-family:ui-monospace,monospace','padding:24px','box-sizing:border-box'
    ].join(';');
    overlay.innerHTML = '<div style=\"max-width:560px;width:100%\">'
      + '<div style=\"display:flex;align-items:center;gap:10px;margin-bottom:12px\">'
      + '<span style=\"font-size:18px\">⚠️</span>'
      + '<span style=\"color:#FFC30B;font-size:13px;font-weight:700;letter-spacing:0.05em\">RUNTIME ERROR</span>'
      + '</div>'
      + '<div style=\"background:#1a1a1a;border:1px solid #FFC30B33;border-radius:8px;padding:16px\">'
      + '<p style=\"color:#ef4444;font-size:12px;margin:0 0 8px;word-break:break-all\">' + String(msg).replace(/</g,'&lt;') + '</p>'
      + (line ? '<p style=\"color:#6b7280;font-size:11px;margin:0\">Line ' + line + (col ? ':' + col : '') + '</p>' : '')
      + '</div>'
      + '<p style=\"color:#4b5563;font-size:11px;margin:12px 0 0;text-align:center\">Fix the code and rebuild to dismiss</p>'
      + '</div>';
    document.body.appendChild(overlay);
  }
  window.onerror = function(msg, src, line, col, err) {
    showError(err ? err.message : msg, src, line, col);
    return true;
  };
  window.addEventListener('unhandledrejection', function(e) {
    showError(e.reason ? (e.reason.message || e.reason) : 'Unhandled promise rejection', null, null, null);
  });
})();
<\/script>`

// ── React Error Boundary — catches render errors in Preview ──────────────────
import React from 'react'

interface EBState { hasError: boolean; errorMsg: string }
class PreviewErrorBoundary extends React.Component<{ children: React.ReactNode }, EBState> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, errorMsg: '' }
  }
  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, errorMsg: error.message || 'Unknown render error' }
  }
  componentDidCatch(error: Error) {
    console.error('[Sparkie Preview Error]', error)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex flex-col items-center justify-center bg-[#0a0a0a] p-8">
          <div className="max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-lg">⚠️</span>
              <span className="text-honey-500 text-sm font-bold tracking-wide">RENDER ERROR</span>
            </div>
            <div className="bg-hive-elevated border border-honey-500/20 rounded-xl p-4 mb-4">
              <p className="text-red-400 text-xs font-mono break-all">{this.state.errorMsg}</p>
            </div>
            <p className="text-text-muted text-xs text-center">Fix the code and rebuild to dismiss</p>
            <button
              onClick={() => this.setState({ hasError: false, errorMsg: '' })}
              className="mt-4 w-full py-2 rounded-lg border border-hive-border text-text-secondary text-xs hover:bg-hive-hover transition-colors"
            >
              Retry Preview
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Container status display
const STATUS_LABELS: Record<string, string> = {
  booting:    "Booting WebContainer…",
  mounting:   "Mounting files…",
  installing: "Installing packages…",
  starting:   "Starting dev server…",
  error:      "Container error",
}

// Recursively flatten a FileNode tree into leaf files only
function flattenFiles(nodes: import("@/store/appStore").FileNode[]): import("@/store/appStore").FileNode[] {
  return nodes.flatMap(n =>
    n.type === "folder" || n.type === "archive"
      ? flattenFiles(n.children ?? [])
      : [n]
  )
}

// Opens current preview content in a new full-screen browser tab
function openPreviewInNewWindow(html: string) {
  const win = window.open("", "_blank")
  if (win) {
    win.document.open()
    win.document.write(html)
    win.document.close()
  }
}


export function Preview() {
  const { files, containerStatus, previewUrl } = useAppStore()
  // Always search the flat list of leaf files (handles folder-wrapped builds)
  const flatFiles = flattenFiles(files)
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = useCallback(() => setRefreshKey(k => k + 1), [])

  // If WC is running/ready, use its URL
  const isWCActive = ['booting','mounting','installing','starting','ready'].includes(containerStatus)
  const isWCReady  = containerStatus === 'ready' && previewUrl

  const { previewHtml, previewType } = useMemo(() => {
    if (isWCActive) return { previewHtml: null, previewType: null }

    const htmlFile = flatFiles.find(f => f.name.endsWith(".html"))
    const cssFile  = flatFiles.find(f => f.name.endsWith(".css"))
    const jsFile   = flatFiles.find(f => f.name.endsWith(".js") && !f.name.endsWith(".min.js"))
    const tsxFile  = flatFiles.find(f => f.name.endsWith(".tsx") || f.name.endsWith(".jsx"))
    const svgFile  = flatFiles.find(f => f.name.endsWith(".svg"))
    const mdFile   = flatFiles.find(f => f.name.endsWith(".md") || f.name.endsWith(".mdx"))
    const jsonFile = flatFiles.find(f => f.name.endsWith(".json"))
    const pyFile   = flatFiles.find(f => f.name.endsWith(".py"))
    const anyCode  = flatFiles.find(f => f.type === "file" && f.content)

    if (htmlFile?.content) {
      // Viewport meta + base styles injected into every preview
      const base = `<meta name="viewport" content="width=device-width, initial-scale=1.0"><style id="__sparkie">${PREVIEW_BASE_STYLES}html,body{overflow:auto;display:block}</style>`

      // Strip external @import rules (Google Fonts etc.) — WebContainers blocks external requests
      // and raw @import text outside <style> tags renders as visible body text
      const stripExternalImports = (css: string) =>
        css.replace(/@import\s+url\s*\(\s*['"]?https?:\/\/[^)'"]+['"]?\s*\)\s*[^;]*;?/gi, '')
          .replace(/@import\s+['"]https?:\/\/[^'"]+['"]\s*[^;]*;?/gi, '')

      // Hoist any @import rules in <style> blocks — keep local ones, strip external
      // Strip relative <script src> and <link stylesheet> — these 404 in srcdoc iframes
      const stripRelativeAssets = (h: string) => h
        .replace(/<script[^>]+src=["'][^"'#][^"']*["'][^>]*><\/script>/gi, '')
        .replace(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi, '')

      const hoistedHtml = stripRelativeAssets(htmlFile.content).replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_match, attrs, css) => {
        const localImports = (css.match(/@import[^;]+;/g) || [])
          .filter((r: string) => !/https?:\/\//i.test(r))
          .join('\n')
        const rest = css.replace(/@import[^;]+;/g, '').trimStart()
        // Wrap hoisted imports in their own <style> block so they're never bare text
        return localImports
          ? `<style>${localImports}</style><style${attrs}>${rest}</style>`
          : `<style${attrs}>${rest}</style>`
      })

      const errorOverlay = `${ERROR_OVERLAY_SCRIPT}`
      let html = hoistedHtml.includes("<head>")
        ? hoistedHtml.replace("<head>", `<head>${base}`)
        : `<!DOCTYPE html><html><head>${base}</head><body>${hoistedHtml}</body></html>`
      // Inject runtime error overlay before </head>
      html = html.replace('</head>', `${errorOverlay}</head>`)

      if (cssFile?.content) {
        const cleanCss = stripExternalImports(cssFile.content)
        const importRules = (cleanCss.match(/@import[^;]+;/g) || []).join('\n')
        const restCss = cleanCss.replace(/@import[^;]+;/g, '').trim()
        const orderedCss = importRules ? `${importRules}\n${restCss}` : restCss
        html = html.replace("</head>", `<style>${orderedCss}</style></head>`)
      }
      if (jsFile?.content) html = html.replace("</body>", `<script>${jsFile.content}<\/script></body>`)
      return { previewHtml: html, previewType: "html" }
    }
    if (tsxFile?.content) return { previewHtml: buildReactHtml(tsxFile.content, cssFile?.content), previewType: "react" }
    if (svgFile?.content) {
      const svg = svgFile.content.replace(/<svg([^>]*)>/i,(_,a) =>
        `<svg${a.replace(/\s+width\s*=\s*["'][^"']*["']/gi,"").replace(/\s+height\s*=\s*["'][^"']*["']/gi,"")} style="width:100%;height:100%;max-width:100vw;max-height:100vh">`)
      return { previewHtml:`<!DOCTYPE html><html><head><style>${PREVIEW_BASE_STYLES}</style></head><body>${svg}</body></html>`, previewType:"svg" }
    }
    if (jsFile?.content || cssFile?.content) {
      return { previewHtml:`<!DOCTYPE html><html><head><style>${PREVIEW_BASE_STYLES}${cssFile?.content||""}</style></head><body><script>${jsFile?.content||""}<\/script></body></html>`, previewType:"js" }
    }
    if (mdFile?.content)   return { previewHtml: buildMarkdownHtml(mdFile.content), previewType: "markdown" }
    if (jsonFile?.content) return { previewHtml: buildJsonHtml(jsonFile.content), previewType: "json" }
    if (pyFile?.content)   return { previewHtml: buildCodeViewerHtml(pyFile.content), previewType: "code" }
    if (anyCode?.content)  return { previewHtml: buildCodeViewerHtml(anyCode.content), previewType: "code" }
    return { previewHtml: null, previewType: null }
  }, [files, isWCActive, refreshKey])

  const typeLabel: Record<string,string> = { html:"HTML",react:"React",svg:"SVG",js:"JS",markdown:"Markdown",json:"JSON",code:"Code" }

  // ── Loading state (WC spinning up) ────────────────────────────────────────
  if (isWCActive && !isWCReady) {
    return (
      <div className="h-full flex flex-col bg-[#0a0a0a]">
        <div className="flex items-center h-7 px-3 bg-hive-700 border-b border-hive-border shrink-0 gap-2">
          <Globe size={12} className="text-text-muted" />
          <span className="text-[11px] text-text-muted flex-1">Preview</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-honey-500/10 text-honey-500 border border-honey-500/20">
            WebContainer
          </span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-muted">
          <Loader2 size={24} className="animate-spin text-honey-500" />
          <p className="text-sm font-medium text-text-secondary">{STATUS_LABELS[containerStatus]}</p>
          <p className="text-xs text-center px-8">Starting a full Node.js environment in your browser…</p>
        </div>
      </div>
    )
  }

  // ── WC server ready — show live localhost iframe ──────────────────────────
  if (isWCReady) {
    return (
      <div className="h-full flex flex-col bg-[#0a0a0a]">
        <div className="flex items-center h-7 px-3 bg-hive-700 border-b border-hive-border shrink-0 gap-2">
          <Globe size={12} className="text-text-muted" />
          <span className="text-[11px] text-text-muted flex-1 font-mono truncate">{previewUrl}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20">Live</span>
          <button onClick={refresh} className="p-1 rounded hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors" title="Refresh">
            <RefreshCw size={12} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <iframe key={refreshKey} src={previewUrl!} title="Preview" className="w-full h-full border-0 block" allow="cross-origin-isolated" />
        </div>
      </div>
    )
  }

  // ── Static preview (no package.json) ──────────────────────────────────────
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
        <span className="text-[11px] text-text-muted flex-1">Preview
          {previewType && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-honey-500/10 text-honey-500 border border-honey-500/20">
              {typeLabel[previewType] || previewType}
            </span>
          )}
        </span>
        <button
          onClick={() => openPreviewInNewWindow(previewHtml)}
          className="p-1 rounded hover:bg-hive-hover text-text-muted hover:text-honey-500 transition-colors"
          title="Open in new window"
        >
          <ExternalLink size={12} />
        </button>
        <button onClick={refresh} className="p-1 rounded hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors" title="Refresh">
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <PreviewErrorBoundary>
          <iframe key={refreshKey} srcDoc={previewHtml} title="Preview"
            sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin allow-downloads"
            className="w-full h-full border-0 block" />
        </PreviewErrorBoundary>
      </div>
    </div>
  )
}
