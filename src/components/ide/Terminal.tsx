'use client'

import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store/appStore'
import type { FileNode } from '@/store/appStore'
import { Terminal as TermIcon, Play, Trash2, ExternalLink } from 'lucide-react'

// ─── lazy-load xterm so it doesn't bloat the initial bundle ──────────────────
async function loadXterm() {
  const [{ Terminal }, { FitAddon }] = await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
  ])
  if (!document.getElementById('xterm-css')) {
    const link = document.createElement('link')
    link.id   = 'xterm-css'
    link.rel  = 'stylesheet'
    link.href = 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.css'
    document.head.appendChild(link)
  }
  return { Terminal, FitAddon }
}

function buildWsUrl(path: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${path}`
}

type E2BFile = { name: string; content: string }

function flattenWithPaths(nodes: FileNode[], prefix = ''): E2BFile[] {
  return nodes.flatMap(n => {
    const p = prefix ? `${prefix}/${n.name}` : n.name
    if (n.type === 'folder')  return flattenWithPaths(n.children ?? [], p)
    if (n.type === 'archive') return []
    return n.content ? [{ name: p, content: n.content }] : []
  })
}

// ─── types ───────────────────────────────────────────────────────────────────
interface XTermInstance {
  open(el: HTMLElement): void
  write(data: string): void
  clear(): void
  dispose(): void
  onData(cb: (data: string) => void): void
  onResize(cb: (size: { cols: number; rows: number }) => void): void
  loadAddon(addon: unknown): void
}

// ─── component ───────────────────────────────────────────────────────────────
export function Terminal() {
  const {
    containerStatus, previewUrl, terminalOutput,
    pendingRunCommand, setPendingRunCommand,
    setPreviewUrl, setContainerStatus, setIDETab,
  } = useAppStore()

  const termDivRef  = useRef<HTMLDivElement>(null)
  const xtermRef    = useRef<XTermInstance | null>(null)
  const fitRef      = useRef<{ fit(): void } | null>(null)
  const wsRef       = useRef<WebSocket | null>(null)
  const sessionRef  = useRef<string>('')
  const mountedRef  = useRef(false)
  const prevOutputRef        = useRef('')
  const eagerPreviewUrlRef   = useRef<string | null>(null)

  // Use refs for WS lifecycle flags — never useState for these.
  // useState triggers re-render → cleanup → ws.close() → 1006.
  const connectedRef = useRef(false)
  const e2bModeRef   = useRef(false)
  // Minimal local state purely for the status badge re-render.
  // Set ONLY after ws.send() completes, never during onmessage.
  const [wsStatus, setWsStatus] = useState<'idle'|'connecting'|'live'|'error'>('idle')

  // ─── init xterm (once, on mount) ─────────────────────────────────────────
  useEffect(() => {
    if (!termDivRef.current) return
    mountedRef.current = true

    loadXterm().then(({ Terminal, FitAddon }) => {
      if (!termDivRef.current || xtermRef.current) return

      const term = new Terminal({
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
        fontSize: 12,
        lineHeight: 1.4,
        theme: {
          background: '#0a0a0a', foreground: '#e2e8f0', cursor: '#f59e0b',
          cursorAccent: '#0a0a0a',
          selectionBackground: 'rgba(245,158,11,0.3)',
          black: '#1a1a1a',      red: '#ef4444',     green: '#22c55e',
          yellow: '#f59e0b',     blue: '#3b82f6',    magenta: '#a855f7',
          cyan: '#06b6d4',       white: '#e2e8f0',
          brightBlack: '#374151', brightRed: '#f87171',   brightGreen: '#4ade80',
          brightYellow: '#fbbf24', brightBlue: '#60a5fa', brightMagenta: '#c084fc',
          brightCyan: '#22d3ee',  brightWhite: '#f9fafb',
        },
        cursorBlink: true,
        allowTransparency: true,
        scrollback: 3000,
      })

      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(termDivRef.current)
      fit.fit()
      xtermRef.current = term
      fitRef.current   = fit

      // Re-fire any command that arrived before xterm was ready
      const alreadyPending = useAppStore.getState().pendingRunCommand
      if (alreadyPending) {
        useAppStore.getState().setPendingRunCommand(null)
        setTimeout(() => useAppStore.getState().setPendingRunCommand(alreadyPending), 0)
      }

      term.write('\r\n\x1b[33m  \u26a1 Sparkie Terminal\x1b[0m\r\n')
      term.write('\x1b[2m  Ready \u2014 E2B sandbox will connect when a build completes.\x1b[0m\r\n\r\n')
    }).catch(err => console.error('xterm load failed:', err))

    return () => {
      mountedRef.current = false
      wsRef.current?.close()
      xtermRef.current?.dispose()
      xtermRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── sync legacy terminalOutput → xterm (WebContainer path) ─────────────
  useEffect(() => {
    if (!xtermRef.current || e2bModeRef.current) return
    const delta = terminalOutput.slice(prevOutputRef.current.length)
    if (delta) {
      xtermRef.current.write(delta)
      prevOutputRef.current = terminalOutput
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalOutput])

  // ─── core WS connection ───────────────────────────────────────────────────
  //
  // CRITICAL RULE (Grok + Qwen consensus):
  //   NEVER call Zustand setters or send WS frames from ws.onopen.
  //   onopen fires inside a React render cycle; any setState() there
  //   triggers a re-render => component remount => cleanup closes ws => 1006.
  //
  //   ALL state updates (setConnected, setE2bMode) + initial command send
  //   happen only in ws.onmessage when server sends {type:'connected'}.
  //   By that point the socket is fully stable and React is idle.
  //
  //   Additionally: when server sends {type:'preview', url}, we update
  //   previewUrl + containerStatus + switch IDE tab — all from onmessage.
  // ─────────────────────────────────────────────────────────────────────────
  function openWebSocket(
    sessionId: string,
    cmd: string,
    term: XTermInstance,
    retryCount = 0
  ): WebSocket {
    const url = buildWsUrl(`/api/terminal-ws?sessionId=${sessionId}`)
    console.log('[Terminal] Opening WebSocket:', url)

    const ws = new WebSocket(url)
    wsRef.current = ws
    if (mountedRef.current) setWsStatus('connecting')

    let retries = retryCount
    const maxRetries = 5

    // wire xterm listeners ONLY on open — NO state, NO sends
    ws.onopen = () => {
      console.log('[Terminal] ws.onopen — socket open, waiting for server connected frame')
      term.onData((data: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'input', data }))
        }
      })
      term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }))
        }
      })
    }

    // ALL state updates happen in onmessage
    ws.onmessage = (e) => {
      let payload: { type: string; data?: string; url?: string } | null = null
      try { payload = JSON.parse(e.data) } catch (_) { return }
      if (!payload) return

      const { type, data, url } = payload

      if (type === 'connected') {
        console.log('[Terminal] received connected — shell ready')
        // Update refs immediately — no re-render triggered.
        connectedRef.current = true
        e2bModeRef.current   = true
        term.write('\x1b[32m  [E2B]\x1b[0m Shell ready\r\n\r\n')
        fitRef.current?.fit()
        // Send the command FIRST, then update UI state.
        // Calling setState before ws.send() would schedule a React re-render
        // whose cleanup function closes wsRef.current — killing the socket.
        if (cmd && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data: cmd + '\r' }))
          term.write('\r\n\x1b[33m  [Sparkie]\x1b[0m Running: ' + cmd + '\r\n')
        }
        // Update badge state AFTER send — re-render is now safe.
        if (mountedRef.current) setWsStatus('live')
        return
      }

      // Vite/build server ready — broadcast preview URL
      if (type === 'preview' && url) {
        console.log('[Terminal] received preview URL:', url)
        if (mountedRef.current) {
          setPreviewUrl(url)
          setContainerStatus('ready')
          setIDETab('preview')
        }
        term.write('\r\n\x1b[32m  [Sparkie]\x1b[0m Preview ready \u26a1 ' + url + '\r\n')
        // Broadcast so ChatInput can post the URL as a clickable link in chat
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('sparkie_preview_ready', { detail: { url } }))
        }
        return
      }

      if (type === 'ping') return

      const raw = data ?? ''
      if (raw) term.write(raw)
    }

    ws.onclose = (e) => {
      console.log('[Terminal] WebSocket closed:', e.code, e.reason)
      connectedRef.current = false
      e2bModeRef.current   = false
      if (mountedRef.current) setWsStatus('idle')
      if (e.code !== 1000 && e.code !== 1001 && retries < maxRetries) {
        retries++
        term.write(`\r\n\x1b[33m  [E2B]\x1b[0m Reconnecting (${retries}/${maxRetries})...\r\n`)
        setTimeout(() => openWebSocket(sessionId, cmd, term, retries), 600 * retries)
      } else if (retries >= maxRetries) {
        setContainerStatus('error')
        if (mountedRef.current) setWsStatus('error')
        term.write(`\r\n\x1b[31m  [E2B]\x1b[0m Connection failed after ${maxRetries} retries\r\n`)
      }
    }

    ws.onerror = (err) => console.error('[Terminal] WebSocket error:', err)

    return ws
  }

  // ─── auto-run: fires when a build completes (pendingRunCommand set) ────────
  useEffect(() => {
    if (!pendingRunCommand) return

    if (connectedRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      const cmd = pendingRunCommand
      setPendingRunCommand(null)
      setContainerStatus('installing')
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'input', data: cmd + '\r' }))
          xtermRef.current?.write('\r\n\x1b[33m  [Sparkie]\x1b[0m Running: ' + cmd + '\r\n')
        }
      }, 300)
      return
    }

    const term = xtermRef.current
    if (!term) return

    const cmd = pendingRunCommand
    setPendingRunCommand(null)
    setContainerStatus('installing')

    const currentChat = useAppStore.getState().chats.find(
      c => c.id === useAppStore.getState().currentChatId
    )
    const projectFiles = currentChat ? flattenWithPaths(currentChat.files) : []

    term.write('\r\n\x1b[2m  Connecting to E2B sandbox\u2026\x1b[0m\r\n')

    const abort = new AbortController()
    const fetchTimeout = setTimeout(() => {
      abort.abort()
      term.write('\r\n\x1b[31m  [Terminal] E2B create timed out (60s)\x1b[0m\r\n')
      setContainerStatus('error')
    }, 60000)

    fetch('/api/terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', files: projectFiles }),
      signal: abort.signal,
    })
      .then(async res => {
        clearTimeout(fetchTimeout)
        if (!res.ok) {
          const errText = await res.text().catch(() => 'unknown')
          term.write(`\r\n\x1b[31m  [Terminal] E2B create failed (${res.status}): ${errText.slice(0, 80)}\x1b[0m\r\n`)
          setContainerStatus('error')
          return
        }
        const d = await res.json() as { sessionId: string; wsUrl: string; previewUrl?: string | null }
        sessionRef.current = d.sessionId
        if (d.previewUrl) eagerPreviewUrlRef.current = d.previewUrl
        openWebSocket(d.sessionId, cmd, term)
      })
      .catch(err => {
        clearTimeout(fetchTimeout)
        if ((err as Error).name === 'AbortError') return
        term.write(`\r\n\x1b[31m  [Terminal] E2B connect failed: ${String(err)}\x1b[0m\r\n`)
        setContainerStatus('error')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRunCommand])

  // ─── resize observer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!termDivRef.current || !fitRef.current) return
    const ro = new ResizeObserver(() => fitRef.current?.fit())
    ro.observe(termDivRef.current)
    return () => ro.disconnect()
  }, [])

  function clearTerminal() {
    xtermRef.current?.clear()
    prevOutputRef.current = ''
  }

  function reconnect() {
    wsRef.current?.close(1000, 'manual reconnect')
    connectedRef.current = false
    e2bModeRef.current   = false
    setWsStatus('idle')
    sessionRef.current          = ''
    eagerPreviewUrlRef.current  = null
    const term = xtermRef.current
    if (!term) return
    term.clear()
    term.write('\r\n\x1b[33m  Reconnecting\u2026\x1b[0m\r\n')

    const currentChat = useAppStore.getState().chats.find(
      c => c.id === useAppStore.getState().currentChatId
    )
    const projectFiles = currentChat ? flattenWithPaths(currentChat.files) : []

    fetch('/api/terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', files: projectFiles }),
    })
      .then(async res => {
        if (!res.ok) { term.write('\r\n\x1b[31m  [E2B] Reconnect failed\x1b[0m\r\n'); return }
        const d = await res.json() as { sessionId: string; wsUrl: string; previewUrl?: string | null }
        sessionRef.current = d.sessionId
        if (d.previewUrl) eagerPreviewUrlRef.current = d.previewUrl
        openWebSocket(d.sessionId, '', term)
      })
      .catch(() => term.write('\r\n\x1b[31m  [E2B] Reconnect error\x1b[0m\r\n'))
  }

  const statusColor =
    wsStatus === 'live'          ? 'text-[#22c55e]' :
    wsStatus === 'error'         ? 'text-[#ef4444]' :
    containerStatus === 'error'  ? 'text-[#ef4444]' :
    containerStatus === 'idle'   ? 'text-[#6b7280]' :
                                   'text-[#f59e0b]'

  const statusLabel =
    wsStatus === 'live'                ? 'Live Shell'    :
    wsStatus === 'connecting'          ? 'Connecting...' :
    containerStatus === 'ready'        ? 'Dev Server'    :
    containerStatus === 'error'        ? 'Error'         :
    containerStatus === 'idle'         ? 'Idle'          :
    (containerStatus as string)        || 'Terminal'

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-hive-700 border-b border-hive-border shrink-0">
        <TermIcon size={11} className="text-text-muted" />
        <span className="text-[11px] text-text-muted font-medium">Terminal</span>
        <span className={`text-[10px] font-medium ${statusColor} flex items-center gap-1`}>
          {wsStatus === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] inline-block animate-pulse" />}
          {statusLabel}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {previewUrl && (
            <a href={previewUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20 hover:bg-[#22c55e]/20 transition-colors">
              <ExternalLink size={9} />
              <span>Preview</span>
            </a>
          )}
          <button onClick={clearTerminal}
            className="w-6 h-6 rounded flex items-center justify-center text-text-muted hover:text-honey-400 hover:bg-hive-hover transition-colors"
            title="Clear terminal">
            <Trash2 size={11} />
          </button>
          <button onClick={reconnect}
            className="w-6 h-6 rounded flex items-center justify-center text-text-muted hover:text-honey-400 hover:bg-hive-hover transition-colors"
            title="New session">
            <Play size={11} />
          </button>
        </div>
      </div>
      <div ref={termDivRef} className="flex-1 overflow-hidden p-1" style={{ minHeight: 0 }} />
    </div>
  )
}
