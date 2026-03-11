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
      term.write('\x1b[2m  Ready — E2B sandbox will connect when a build completes.\x1b[0m\r\n\r\n')
      // connectE2B is called lazily from the pendingRunCommand useEffect,
      // not here at mount. Connecting at mount causes the SSE stream to
      // time out (DO 30s idle limit) before the build finishes.
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

  // ── Auto-run: execute pendingRunCommand via lazy E2B connect ───────────────
  // Called by build pipeline after files are written and package.json has scripts.dev.
  // Strategy: connect E2B lazily here (not at mount) so the SSE stream is opened
  // only when there is a command to run — avoids DO's 30s idle timeout killing
  // the connection during the 2-3 minute build window.
  useEffect(() => {
    console.log('[Terminal] useEffect pendingRunCommand:', pendingRunCommand, 'connected:', connected, 'ws:', wsRef.current?.readyState)
    if (!pendingRunCommand) return

    // If already connected (user manually opened terminal during build), fire directly.
    if (connected && wsRef.current?.readyState === 1) {
      const cmd = pendingRunCommand
      console.log('[Terminal] already connected — FIRING command:', cmd)
      setPendingRunCommand(null)
      serverUrlDetectedRef.current = false
      setContainerStatus('installing')
      setTimeout(() => {
        if (wsRef.current?.readyState === 1) {
          wsRef.current.send(JSON.stringify({ type: 'input', data: cmd + '\r' }))
          xtermRef.current?.write('\r\n\x1b[33m  [Sparkie]\x1b[0m Running: ' + cmd + '\r\n')
        }
      }, 300)
      return
    }

    // Not connected yet — lazy connect now with project files, then fire command.
    const cmd = pendingRunCommand
    console.log('[Terminal] lazy E2B connect for command:', cmd)
    setPendingRunCommand(null)
    serverUrlDetectedRef.current = false
    setContainerStatus('installing')

    const term = xtermRef.current
    if (!term) return

    // Collect project files now (build is done, files ARE in the store).
    const currentChat = useAppStore.getState().chats.find(
      c => c.id === useAppStore.getState().currentChatId
    )
    const projectFiles = currentChat
      ? flattenFileTree(currentChat.files)
          .filter(f => f.type === 'file' && f.content)
          .map(f => ({ name: f.name, content: f.content }))
      : []
    console.log('[Terminal] lazy connect — passing', projectFiles.length, 'files to E2B')

    term.write('\r\n\x1b[2m  Connecting to E2B sandbox…\x1b[0m\r\n')

    fetch('/api/terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', files: projectFiles }),
    })
      .then(async r => {
        if (!r.ok) {
          term.write('\r\n\x1b[31m  [Terminal] E2B unavailable — cannot run dev server\x1b[0m\r\n')
          setContainerStatus('idle')
          return
        }
        const { sessionId } = await r.json() as { sessionId: string; wsUrl: string }
        sessionRef.current = sessionId
        setE2bMode(true)

        const sseUrl = `/api/terminal?sessionId=${sessionId}`
        const es = new EventSource(sseUrl)

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
          readyState: 0,
          onopen: null, onclose: null, onerror: null, onmessage: null,
          send: (data: string) => {
            const parsed = JSON.parse(data) as { type: string; data?: string; cols?: number; rows?: number }
            fetch('/api/terminal', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: parsed.type === 'input' ? 'input' : 'resize', sessionId, ...parsed }),
            }).catch(() => {})
          },
          close: () => { es.close(); ws.readyState = 3 },
        }
        wsRef.current = ws as unknown as WebSocket

        es.onopen = () => {
          ws.readyState = 1
          setConnected(true)
          term.write('\x1b[32m  [E2B]\x1b[0m Shell ready\r\n\r\n')
          fitRef.current?.fit()
          // Fire the command now that we're connected.
          console.log('[Terminal] lazy es.onopen — FIRING:', cmd)
          setTimeout(() => {
            if (wsRef.current?.readyState === 1) {
              wsRef.current.send(JSON.stringify({ type: 'input', data: cmd + '\r' }))
              term.write('\r\n\x1b[33m  [Sparkie]\x1b[0m Running: ' + cmd + '\r\n')
            }
          }, 300)
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
          // ── Server URL detection ─────────────────────────────────────────
          if (!serverUrlDetectedRef.current) {
            const urlMatch = raw.match(/https?:\/\/[^\s]+:[0-9]+/) ??
                             raw.match(/Local:\s+(https?:\/\/[^\s]+)/) ??
                             raw.match(/localhost:[0-9]+/)
            if (urlMatch) {
              let url = urlMatch[1] ?? urlMatch[0]
              if (!url.startsWith('http')) url = 'http://' + url
              serverUrlDetectedRef.current = true
              setPreviewUrl(url)
              setContainerStatus('ready')
              setIDETab('preview')
              term.write('\r\n\x1b[32m  [Sparkie]\x1b[0m Preview ready → ' + url + '\r\n')
            }
          }
          // ── Build error detection ────────────────────────────────────────
          if (raw.includes('ERROR') || raw.includes('error TS') || raw.includes('ENOENT')) {
            term.write('\r\n\x1b[31m  [Sparkie]\x1b[0m Build error detected — check above ↑\r\n')
          }
        }
      })
      .catch(err => {
        console.error('[Terminal] lazy connect failed:', err)
        term.write('\r\n\x1b[31m  [Terminal] E2B connect failed: ' + String(err) + '\x1b[0m\r\n')
        setContainerStatus('idle')
      })
  }, [pendingRunCommand, connected, setPendingRunCommand, setContainerStatus, setE2bMode, setConnected, setPreviewUrl, setIDETab])

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
