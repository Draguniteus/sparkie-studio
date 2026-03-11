"use client"

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Terminal as XTermType } from '@xterm/xterm'
import type { FitAddon as FitAddonType } from '@xterm/addon-fit'
import { useAppStore, flattenFileTree } from '@/store/appStore'
import { Terminal as TermIcon, Play, Square, Trash2, ExternalLink } from 'lucide-react'

// xterm loaded via npm imports (@xterm/xterm + @xterm/addon-fit)

interface XTermInstance {
  open(el: HTMLElement): void
  write(data: string): void
  clear(): void
  dispose(): void
  onData(cb: (data: string) => void): void
  onResize(cb: (size: { cols: number; rows: number }) => void): void
  loadAddon(addon: unknown): void
}

async function loadXterm(): Promise<{ Terminal: typeof XTermType; FitAddon: typeof FitAddonType }> {
  const [{ Terminal }, { FitAddon }] = await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
  ])
  // Inject xterm CSS once
  if (!document.getElementById('xterm-css')) {
    const link = document.createElement('link')
    link.id = 'xterm-css'
    link.rel = 'stylesheet'
    link.href = 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.css'
    document.head.appendChild(link)
  }
  return { Terminal, FitAddon }
}

export function Terminal() {
  const {
    containerStatus, previewUrl, terminalOutput,
    pendingRunCommand, setPendingRunCommand,
    setPreviewUrl, setContainerStatus, setIDETab,
  } = useAppStore()
  const termRef    = useRef<HTMLDivElement>(null)
  const xtermRef   = useRef<XTermInstance | null>(null)
  const fitRef     = useRef<{ fit(): void } | null>(null)
  const wsRef      = useRef<WebSocket | null>(null)
  const sessionRef = useRef<string>('')
  const [connected, setConnected] = useState(false)
  const [e2bMode, setE2bMode]    = useState(false)
  const prevOutputRef = useRef('')
  const serverUrlDetectedRef = useRef(false)

  // ── Load xterm + init terminal ────────────────────────────────
  useEffect(() => {
    if (!termRef.current) return

    loadXterm().then(({ Terminal, FitAddon }) => {
      if (!termRef.current || xtermRef.current) return

      const term = new Terminal({
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

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(termRef.current)
      fitAddon.fit()
      xtermRef.current = term
      fitRef.current = fitAddon

      term.write('\r\n\x1b[33m  ❖ Sparkie Terminal\x1b[0m\r\n')
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

  // ── Auto-run: execute pendingRunCommand when E2B shell is ready ──────────
  // Set by build pipeline after detecting package.json with scripts.dev.
  // Clears itself after sending so it doesn't re-fire on reconnect.
  useEffect(() => {
    console.log('[Terminal] useEffect pendingRunCommand:', pendingRunCommand, 'connected:', connected, 'ws:', wsRef.current?.readyState)
    if (!pendingRunCommand) return
    if (!connected || !wsRef.current || wsRef.current.readyState !== 1) {
      console.log('[Terminal] pendingRunCommand set but not yet connected — will fire on ws.onopen. connected:', connected, 'readyState:', wsRef.current?.readyState)
      // Do NOT clear pendingRunCommand — ws.onopen will pick it up when connection opens.
      // ws.onopen reads from useAppStore.getState().pendingRunCommand directly, so it will fire.
      return
    }
    const cmd = pendingRunCommand
    console.log('[Terminal] FIRING command:', cmd)
    setPendingRunCommand(null)
    serverUrlDetectedRef.current = false
    setContainerStatus('installing')
    // Sync project files into the sandbox BEFORE running the command.
    // connectE2B runs at mount time (before build finishes), so files weren't
    // in the store yet. Now that pendingRunCommand is set, files ARE ready.
    const syncFiles = async () => {
      const sid = sessionRef.current
      if (!sid) return
      const currentChat = useAppStore.getState().chats.find(
        c => c.id === useAppStore.getState().currentChatId
      )
      const projectFiles = currentChat
        ? flattenFileTree(currentChat.files)
            .filter(f => f.type === 'file' && f.content)
            .map(f => ({ name: f.name, content: f.content }))
        : []
      if (projectFiles.length > 0) {
        try {
          await fetch('/api/terminal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'sync-files', sessionId: sid, files: projectFiles }),
          })
          console.log('[Terminal] synced', projectFiles.length, 'files to sandbox before run')
        } catch (err) {
          console.warn('[Terminal] sync-files failed:', err)
        }
      }
    }
    syncFiles().finally(() => {
      // Slight delay so the shell is fully settled
      setTimeout(() => {
        console.log('[Terminal] setTimeout fired, ws readyState:', wsRef.current?.readyState)
        if (wsRef.current?.readyState === 1) {
          wsRef.current.send(JSON.stringify({ type: 'input', data: cmd + '\r' }))
          xtermRef.current?.write('\r\n\x1b[33m  [Sparkie]\x1b[0m Running: ' + cmd + '\r\n')
        } else {
          console.log('[Terminal] setTimeout: ws NOT open, dropping command')
        }
      }, 300)
    })
  }, [pendingRunCommand, connected, setPendingRunCommand, setContainerStatus])

  // ── Server URL detection: watch WS output for localhost:PORT → set preview ─
  // Patches the ws.onmessage handler at connection time is fragile (closure).
  // Instead we intercept via xterm.write with a post-write URL scan on raw data.
  // Implemented in connectE2B — see ws.onmessage extension below.

  // ── ResizeObserver ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!termRef.current || !fitRef.current) return
    const ro = new ResizeObserver(() => fitRef.current?.fit())
    ro.observe(termRef.current)
    return () => ro.disconnect()
  }, [])

  // ── E2B PTY connection ────────────────────────────────────────────────────
  const connectE2B = useCallback(async (term: XTermInstance) => {
    try {
      // Create a new E2B terminal session, passing current project files so
      // the sandbox already has them before the shell command fires.
      const currentChat = useAppStore.getState().chats.find(
        c => c.id === useAppStore.getState().currentChatId
      )
      const projectFiles = currentChat
        ? flattenFileTree(currentChat.files)
            .filter(f => f.type === 'file' && f.content)
            .map(f => ({ name: f.name, content: f.content }))
        : []
      const r = await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', files: projectFiles })
      })
      if (!r.ok) {
        term.write('\r\n\x1b[31m  [Terminal] E2B session unavailable — using build output mode\x1b[0m\r\n')
        return
      }
      const { sessionId, wsUrl } = await r.json() as { sessionId: string; wsUrl: string }
      sessionRef.current = sessionId
      setE2bMode(true)

      // Connect via EventSource (SSE) for PTY output + POST for input
      // DO App Platform does not support WS upgrades — SSE+POST is the correct protocol.
      const sseUrl = `/api/terminal?sessionId=${sessionId}`
      const es = new EventSource(sseUrl)

      // Create a WebSocket-shaped shim so the rest of the code is unchanged
      type WsShim = {
        readyState: number
        onopen: (() => void) | null
        onclose: (() => void) | null
        onerror: (() => void) | null
        onmessage: ((e: { data: string }) => void) | null
        send: (data: string) => void
        close: () => void
      }
      const ws: WsShim = {
        readyState: 0, // CONNECTING
        onopen: null, onclose: null, onerror: null, onmessage: null,
        send: (data: string) => {
          const parsed = JSON.parse(data) as { type: string; data?: string; cols?: number; rows?: number }
          fetch('/api/terminal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: parsed.type === 'resize' ? 'resize' : 'input', sessionId, data: parsed.data, cols: parsed.cols, rows: parsed.rows }),
          }).catch(() => {})
        },
        close: () => { es.close(); ws.readyState = 3 },
      }
      wsRef.current = ws as unknown as WebSocket

      es.onopen = () => {
        ws.readyState = 1 // OPEN
        ws.readyState = 1
        setConnected(true)
        term.write('\x1b[32m  [E2B]\x1b[0m Shell ready\r\n\r\n')
        // Send terminal size
        fitRef.current?.fit()
        // ── Race fix: fire any pending command that was already set before we connected ──
        const pending = useAppStore.getState().pendingRunCommand
        console.log('[Terminal] ws.onopen — pendingRunCommand in store:', pending)
        if (pending) {
          console.log('[Terminal] ws.onopen FIRING command:', pending)
          useAppStore.getState().setPendingRunCommand(null)
          serverUrlDetectedRef.current = false
          setContainerStatus('installing')
          setTimeout(() => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'input', data: pending + '\r' }))
              term.write('\r\n\x1b[33m  [Sparkie]\x1b[0m Running: ' + pending + '\r\n')
            }
          }, 300)
        }
      }
      es.onmessage = (e) => {
        let payload: { type: string; data: string } | null = null
        try { payload = JSON.parse(e.data) } catch { return }
        if (!payload) return
        const raw = payload.data ?? ''
        if (payload.type === 'ping') return
        if (payload.type === 'connected') {
          ws.readyState = 1
          ws.onopen?.()
          return
        }
        term.write(raw)
        // ── Server URL detection ────────────────────────────────────────────
        // Detect Vite/Next/Express/Parcel/CRA server URLs in terminal output.
        // Patterns: "localhost:5173", "http://localhost:PORT", "Local: http://..."
        if (!serverUrlDetectedRef.current) {
          const urlMatch = raw.match(/https?:\/\/(localhost|127\.0\.0\.1):(\d{2,5})/)
            || raw.match(/Local:\s+(https?:\/\/[^\s]+)/)
            || raw.match(/\blistening.*?https?:\/\/(localhost|127\.0\.0\.1):(\d{2,5})/i)
            || raw.match(/started server.*?https?:\/\/(localhost|127\.0\.0\.1):(\d+)/i)
          if (urlMatch) {
            // Extract full URL or build from host:port
            const fullUrl = urlMatch[0].match(/https?:\/\//) ? urlMatch[0].match(/(https?:\/\/[^\s,]+)/)?.[1] : `http://${urlMatch[1]}:${urlMatch[2]}`
            const devUrl = fullUrl?.replace(/\/$/, '') || null
            if (devUrl) {
              serverUrlDetectedRef.current = true
              setPreviewUrl(devUrl)
              setContainerStatus('ready')
              // Switch IDE to Preview tab
              setTimeout(() => setIDETab('preview'), 400)
              term.write('\r\n\x1b[32m  [Sparkie]\x1b[0m Preview ready → ' + devUrl + '\r\n')
            }
          }
        }
        // ── Detect build/install errors ─────────────────────────────────────────
        if (raw.includes('npm ERR!') || raw.includes('error Command failed') || raw.includes('ENOENT') || raw.includes('Cannot find module')) {
          setContainerStatus('error')
          term.write('\r\n\x1b[31m  [Sparkie]\x1b[0m Build error detected — check above ↑\r\n')
        }
      }
      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) {
          ws.readyState = 3
          setConnected(false)
          term.write('\r\n\x1b[33m  [E2B]\x1b[0m Session ended\r\n')
        } else {
          term.write('\r\n\x1b[31m  [E2B]\x1b[0m Connection error\r\n')
        }
      }

      // Forward keystrokes to sandbox
      term.onData((data) => {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'input', data }))
        }
      })

      // Forward resize events
      term.onResize(({ cols, rows }) => {
        if (ws.readyState === 1) {
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
