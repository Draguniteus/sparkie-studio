"use client"

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppStore } from '@/store/appStore'
import { Terminal as TermIcon, Play, Square, Trash2, ExternalLink } from 'lucide-react'

declare global {
  interface Window {
    Terminal: new (options?: Record<string, unknown>) => XTermInstance
    FitAddon: new () => { fit(): void; proposeDimensions(): { cols: number; rows: number } | undefined }
    _xtermLoaded?: boolean
  }
}

interface XTermInstance {
  open(el: HTMLElement): void
  write(data: string): void
  clear(): void
  dispose(): void
  onData(cb: (data: string) => void): void
  onResize(cb: (size: { cols: number; rows: number }) => void): void
  loadAddon(addon: unknown): void
}

function loadXterm(): Promise<void> {
  if (window._xtermLoaded) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css'
    document.head.appendChild(css)

    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js'
    script.onload = () => {
      const fitScript = document.createElement('script')
      fitScript.src = 'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js'
      fitScript.onload = () => { window._xtermLoaded = true; resolve() }
      fitScript.onerror = reject
      document.head.appendChild(fitScript)
    }
    script.onerror = reject
    document.head.appendChild(script)
  })
}

export function Terminal() {
  const { containerStatus, previewUrl, terminalOutput } = useAppStore()
  const termRef    = useRef<HTMLDivElement>(null)
  const xtermRef   = useRef<XTermInstance | null>(null)
  const fitRef     = useRef<{ fit(): void } | null>(null)
  const wsRef      = useRef<WebSocket | null>(null)
  const sessionRef = useRef<string>('')
  const [connected, setConnected] = useState(false)
  const [e2bMode, setE2bMode]    = useState(false)
  const prevOutputRef = useRef('')

  // ── Load xterm + init terminal ───────────────────────────────────────────
  useEffect(() => {
    if (!termRef.current) return

    loadXterm().then(() => {
      if (!termRef.current || xtermRef.current) return

      const term = new window.Terminal({
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
        fontSize: 12,
        lineHeight: 1.4,
        theme: {
          background: '#0a0a0a',
          foreground: '#e2e8f0',
          cursor: '#f59e0b',
          cursorAccent: '#0a0a0a',
          selectionBackground: 'rgba(245,158,11,0.3)',
          black: '#1a1a1a',
          red: '#ef4444',
          green: '#22c55e',
          yellow: '#f59e0b',
          blue: '#3b82f6',
          magenta: '#a855f7',
          cyan: '#06b6d4',
          white: '#e2e8f0',
          brightBlack: '#374151',
          brightRed: '#f87171',
          brightGreen: '#4ade80',
          brightYellow: '#fbbf24',
          brightBlue: '#60a5fa',
          brightMagenta: '#c084fc',
          brightCyan: '#22d3ee',
          brightWhite: '#f9fafb',
        },
        cursorBlink: true,
        allowTransparency: true,
        scrollback: 3000,
      })

      const fitAddon = new window.FitAddon()
      term.loadAddon(fitAddon)
      term.open(termRef.current)
      fitAddon.fit()
      xtermRef.current = term
      fitRef.current = fitAddon

      term.write('\r\n\x1b[33m  ✦ Sparkie Terminal\x1b[0m\r\n')
      term.write('\x1b[2m  Connected to E2B cloud sandbox\x1b[0m\r\n')
      term.write('\x1b[2m  Type commands below — press Enter to run\x1b[0m\r\n\r\n')

      // Connect E2B terminal session
      connectE2B(term)
    }).catch(err => {
      console.error('xterm load failed:', err)
    })

    return () => {
      wsRef.current?.close()
      xtermRef.current?.dispose()
      xtermRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Sync legacy terminalOutput → xterm (for WebContainer builds) ─────────
  useEffect(() => {
    if (!xtermRef.current || e2bMode) return
    const newOutput = terminalOutput.slice(prevOutputRef.current.length)
    if (newOutput) {
      xtermRef.current.write(newOutput)
      prevOutputRef.current = terminalOutput
    }
  }, [terminalOutput, e2bMode])

  // ── ResizeObserver ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!termRef.current || !fitRef.current) return
    const ro = new ResizeObserver(() => fitRef.current?.fit())
    ro.observe(termRef.current)
    return () => ro.disconnect()
  }, [])

  // ── E2B PTY connection ─────────────────────────────────────────────────────
  const connectE2B = useCallback(async (term: XTermInstance) => {
    try {
      // Create a new E2B terminal session
      const r = await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' })
      })
      if (!r.ok) {
        term.write('\r\n\x1b[31m  [Terminal] E2B session unavailable — using build output mode\x1b[0m\r\n')
        return
      }
      const { sessionId, wsUrl } = await r.json() as { sessionId: string; wsUrl: string }
      sessionRef.current = sessionId
      setE2bMode(true)

      // Connect WebSocket for PTY I/O
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        term.write('\x1b[32m  [E2B]\x1b[0m Shell ready\r\n\r\n')
        // Send terminal size
        const dims = fitRef.current?.fit()
        void dims
      }
      ws.onmessage = (e) => {
        term.write(e.data as string)
      }
      ws.onclose = () => {
        setConnected(false)
        term.write('\r\n\x1b[33m  [E2B]\x1b[0m Session ended\r\n')
      }
      ws.onerror = () => {
        term.write('\r\n\x1b[31m  [E2B]\x1b[0m WebSocket error\r\n')
      }

      // Forward keystrokes to sandbox
      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }))
        }
      })

      // Forward resize events
      term.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols, rows }))
        }
      })

    } catch {
      // Fallback to build output mode
    }
  }, [])

  function clearTerminal() {
    xtermRef.current?.clear()
    prevOutputRef.current = ''
  }

  function reconnect() {
    wsRef.current?.close()
    setConnected(false)
    setE2bMode(false)
    if (xtermRef.current) {
      xtermRef.current.clear()
      xtermRef.current.write('\r\n\x1b[33m  Reconnecting...\x1b[0m\r\n')
      connectE2B(xtermRef.current)
    }
  }

  const statusColor =
    connected         ? 'text-[#22c55e]' :
    containerStatus === 'error' ? 'text-[#ef4444]' :
    containerStatus === 'idle'  ? 'text-[#6b7280]' :
                                  'text-[#f59e0b]'

  const statusLabel =
    connected        ? 'Live Shell' :
    e2bMode          ? 'Connecting...' :
    containerStatus === 'ready'       ? 'Dev Server' :
    containerStatus === 'error'       ? 'Error' :
    containerStatus === 'idle'        ? 'Idle' :
    (containerStatus as string)       || 'Terminal'

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-hive-700 border-b border-hive-border shrink-0">
        <TermIcon size={11} className="text-text-muted" />
        <span className="text-[11px] text-text-muted font-medium">Terminal</span>
        <span className={`text-[10px] font-medium ${statusColor} flex items-center gap-1`}>
          {connected && <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] inline-block animate-pulse" />}
          {statusLabel}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20 hover:bg-[#22c55e]/20 transition-colors"
            >
              <ExternalLink size={9} />
              <span>Preview</span>
            </a>
          )}
          <button
            onClick={clearTerminal}
            className="w-6 h-6 rounded flex items-center justify-center text-text-muted hover:text-honey-400 hover:bg-hive-hover transition-colors"
            title="Clear terminal"
          >
            <Trash2 size={11} />
          </button>
          <button
            onClick={reconnect}
            className="w-6 h-6 rounded flex items-center justify-center text-text-muted hover:text-honey-400 hover:bg-hive-hover transition-colors"
            title="New session"
          >
            <Play size={11} />
          </button>
        </div>
      </div>

      {/* xterm.js mount point */}
      <div ref={termRef} className="flex-1 overflow-hidden p-1" style={{ minHeight: 0 }} />
    </div>
  )
}
