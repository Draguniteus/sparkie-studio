"use client"

import { useEffect, useRef, useState } from 'react'
import type { Terminal as XTermType } from '@xterm/xterm'
import type { FitAddon as FitAddonType } from '@xterm/addon-fit'
import { useAppStore } from '@/store/appStore'
import type { FileNode } from '@/store/appStore'
import { Terminal as TermIcon, Play, Trash2, ExternalLink } from 'lucide-react'

async function loadXterm(): Promise<{ Terminal: typeof XTermType; FitAddon: typeof FitAddonType }> {
  const [{ Terminal }, { FitAddon }] = await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
  ])
  if (!document.getElementById('xterm-css')) {
    const link = document.createElement('link')
    link.id = 'xterm-css'
    link.rel = 'stylesheet'
    link.href = 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.css'
    document.head.appendChild(link)
  }
  return { Terminal, FitAddon }
}

/** Build a WebSocket URL from the current page origin. */
function buildWsUrl(path: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${path}`
}

type E2BFile = { name: string; content: string }

function flattenWithPaths(nodes: FileNode[], prefix = ''): E2BFile[] {
  return nodes.flatMap(n => {
    const p = prefix ? `${prefix}/${n.name}` : n.name
    if (n.type === 'folder') return flattenWithPaths(n.children ?? [], p)
    if (n.type === 'archive') return []
    return n.content ? [{ name: p, content: n.content }] : []
  })
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
  const eagerPreviewUrlRef = useRef<string | null>(null)

  // ── Load xterm + init terminal ──────────────────────────────────────────
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

      const alreadyPending = useAppStore.getState().pendingRunCommand
      if (alreadyPending) {
        useAppStore.getState().setPendingRunCommand(null)
        setTimeout(() => useAppStore.getState().setPendingRunCommand(alreadyPending), 0)
      }

      term.write('\r\n\x1b[33m  ⚡ Sparkie Terminal\x1b[0m\r\n')
      term.write('\x1b[2m  Ready – E2B sandbox will connect when a build completes.\x1b[0m\r\n\r\n')
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

  // ── Sync legacy terminalOutput → xterm (for WebContainer builds) ────────
  useEffect(() => {
    if (!xtermRef.current || e2bMode) return
    const newOutput = terminalOutput.slice(prevOutputRef.current.length)
    if (newOutput) {
      xtermRef.current?.write(newOutput)
      prevOutputRef.current = terminalOutput
    }
  }, [terminalOutput, e2bMode])

  // ── Open a WebSocket to the terminal server ──────────────────────────────
  function openWebSocket(sessionId: string, cmd: string, term: XTermInstance) {
    const url = buildWsUrl(`/api/terminal-ws?sessionId=${sessionId}`)
    console.log('[Terminal] Opening WebSocket:', url)
    const ws = new WebSocket(url)
    wsRef.current = ws

    let wsRetries = 0
    const maxWsRetries = 5

    ws.onopen = () => {
      console.log('[Terminal] WebSocket onopen – shell ready, firing cmd:', cmd)
      wsRetries = 0
      setConnected(true)
      setE2bMode(true)
      term.write('\x1b[32m  [E2B]\x1b[0m Shell ready\r\n\r\n')
      fitRef.current?.fit()
      if (cmd) {
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'input', data: cmd + '\r' }))
            term.write('\r\n\x1b[33m  [Sparkie]\x1b[0m Running: ' + cmd + '\r\n')
          }
        }, 300)
      }
    }

    ws.onmessage = (e) => {
      let payload: { type: string; data: string } | null = null
      try { payload = JSON.parse(e.data) } catch (_) { return }
      if (!payload) return
      const raw = payload.data ?? ''
      if (payload.type === 'ping' || payload.type === 'connected') return
      term.write(raw)
      if (!serverUrlDetectedRef.current && eagerPreviewUrlRef.current) {
        if (raw.includes('ready in') || raw.includes('Local:') || raw.includes('Network:')) {
          serverUrlDetectedRef.current = true
          const url = eagerPreviewUrlRef.current
          setPreviewUrl(url)
          setContainerStatus('ready')
          setIDETab('preview')
          term.write('\r\n\x1b[32m  [Sparkie]\x1b[0m Preview ready → ' + url + '\r\n')
        }
      }
      if (raw.includes('ERROR') || raw.includes('error TS') || raw.includes('ENOENT')) {
        term.write('\r\n\x1b[31m  [Sparkie]\x1b[0m Build error detected — check above ↑\r\n')
      }
    }

    ws.onclose = (e) => {
      console.log('[Terminal] WebSocket closed:', e.code, e.reason)
      setConnected(false)
      if (e.code !== 1000 && e.code !== 1001 && wsRetries < maxWsRetries) {
        wsRetries++
        term.write('\r\n\x1b[33m  [E2B]\x1b[0m Reconnecting (' + wsRetries + '/' + maxWsRetries + ')...\r\n')
        setTimeout(() => openWebSocket(sessionId, cmd, term), 600 * wsRetries)
      } else if (wsRetries >= maxWsRetries) {
        setContainerStatus('error')
        term.write('\r\n\x1b[31m  [E2B]\x1b[0m Connection failed after ' + maxWsRetries + ' retries\r\n')
      }
    }

    ws.onerror = (err) => {
      console.error('[Terminal] WebSocket error:', err)
    }

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

    return ws
  }

  // ── Auto-run: execute pendingRunCommand via lazy E2B connect ────────────
  useEffect(() => {
    if (!pendingRunCommand) return

    if (connected && wsRef.current?.readyState === WebSocket.OPEN) {
      const cmd = pendingRunCommand
      setPendingRunCommand(null)
      serverUrlDetectedRef.current = false
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
    serverUrlDetectedRef.current = false
    setContainerStatus('installing')

    const currentChat = useAppStore.getState().chats.find(
      c => c.id === useAppStore.getState().currentChatId
    )
    const projectFiles = currentChat ? flattenWithPaths(currentChat.files) : []

    term.write('\r\n\x1b[2m  Connecting to E2B sandbox…\x1b[0m\r\n')

    const abortCtrl = new AbortController()
    const fetchTimeout = setTimeout(() => {
      abortCtrl.abort()
      term.write('\r\n\x1b[31m  [Terminal] E2B create timed out (60s)\x1b[0m\r\n')
      setContainerStatus('error')
    }, 60000)

    fetch('/api/terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', files: projectFiles }),
      signal: abortCtrl.signal,
    })
      .then(async res => {
        clearTimeout(fetchTimeout)
        if (!res.ok) {
          const errText = await res.text().catch(() => 'unknown')
          term.write('\r\n\x1b[31m  [Terminal] E2B create failed (' + res.status + '): ' + errText.slice(0, 80) + '\x1b[0m\r\n')
          setContainerStatus('error')
          return
        }
        const data = await res.json() as { sessionId: string; wsUrl: string; previewUrl?: string | null }
        sessionRef.current = data.sessionId
        if (data.previewUrl) eagerPreviewUrlRef.current = data.previewUrl
        openWebSocket(data.sessionId, cmd, term)
      })
      .catch(err => {
        clearTimeout(fetchTimeout)
        if ((err as Error).name === 'AbortError') return
        term.write('\r\n\x1b[31m  [Terminal] E2B connect failed: ' + String(err) + '\x1b[0m\r\n')
        setContainerStatus('error')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRunCommand, connected])

  // ── ResizeObserver ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!termRef.current || !fitRef.current) return
    const ro = new ResizeObserver(() => fitRef.current?.fit())
    ro.observe(termRef.current)
    return () => ro.disconnect()
  }, [])

  function clearTerminal() {
    xtermRef.current?.clear()
    prevOutputRef.current = ''
  }

  function reconnect() {
    wsRef.current?.close(1000, 'manual reconnect')
    setConnected(false)
    setE2bMode(false)
    sessionRef.current = ''
    eagerPreviewUrlRef.current = null
    serverUrlDetectedRef.current = false
    const term = xtermRef.current
    if (!term) return
    term.clear()
    term.write('\r\n\x1b[33m  Reconnecting…\x1b[0m\r\n')

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
        const data = await res.json() as { sessionId: string; wsUrl: string; previewUrl?: string | null }
        sessionRef.current = data.sessionId
        if (data.previewUrl) eagerPreviewUrlRef.current = data.previewUrl
        openWebSocket(data.sessionId, '', term)
      })
      .catch(() => term.write('\r\n\x1b[31m  [E2B] Reconnect error\x1b[0m\r\n'))
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
      <div ref={termRef} className="flex-1 overflow-hidden p-1" style={{ minHeight: 0 }} />
    </div>
  )
}
