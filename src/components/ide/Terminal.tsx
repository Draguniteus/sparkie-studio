"use client"

import { useEffect, useRef, useState } from 'react'
import type { Terminal as XTermType } from '@xterm/xterm'
import type { FitAddon as FitAddonType } from '@xterm/addon-fit'
import { useAppStore } from '@/store/appStore'
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

  // ââ Load xterm + init terminal ââââââââââââââââââââââââââââââââ
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

      term.write('\r\n\x1b[33m  â Sparkie Terminal\x1b[0m\r\n')
      term.write('\x1b[2m  Ready â E2B sandbox will connect when a build completes.\x1b[0m\r\n\r\n')
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

  // ââ Sync legacy terminalOutput â xterm (for WebContainer builds) âââââââââ
  useEffect(() => {
    if (!xtermRef.current || e2bMode) return
    const newOutput = terminalOutput.slice(prevOutputRef.current.length)
    if (newOutput) {
      xtermRef.current.write(newOutput)
      prevOutputRef.current = terminalOutput
    }
  }, [terminalOutput, e2bMode])

  // ââ flattenWithPaths: flatten FileNode tree preserving full relative paths â
  // flattenFileTree (from appStore) returns leaf nodes but loses folder path context.
  // This version walks the tree with a running prefix so E2B gets the correct paths
  // (e.g. sparkie/src/App.tsx instead of just App.tsx).
  type E2BFile = { name: string; content: string }
  function flattenWithPaths(
    nodes: import('@/store/appStore').FileNode[],
    prefix = ''
  ): E2BFile[] {
    return nodes.flatMap(n => {
      const p = prefix ? `${prefix}/${n.name}` : n.name
      if (n.type === 'folder') return flattenWithPaths(n.children ?? [], p)
      if (n.type === 'archive') return []
      return n.content ? [{ name: p, content: n.content }] : []
    })
  }

  // ââ Auto-run: execute pendingRunCommand via lazy E2B connect âââââââââââââââ
  // Called by build pipeline after files are written and package.json has scripts.dev.
  // Strategy: connect E2B lazily here (not at mount) so the SSE stream is opened
  // only when there is a command to run â avoids DO's 30s idle timeout killing
  // the connection during the 2-3 minute build window.
  useEffect(() => {
    console.log('[Terminal] useEffect pendingRunCommand:', pendingRunCommand, 'connected:', connected, 'ws:', wsRef.current?.readyState)
    if (!pendingRunCommand) return

    // If already connected (user manually opened terminal during build), fire directly.
    if (connected && wsRef.current?.readyState === 1) {
      const cmd = pendingRunCommand
      console.log('[Terminal] already connected â FIRING command:', cmd)
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
      ? flattenWithPaths(currentChat.files)
      : []
    console.log('[Terminal] lazy connect — passing', projectFiles.length, 'files to E2B')

    term.write('\r\n\x1b[2m  Connecting to E2B sandbox\u2026\x1b[0m\r\n')

    // ws shim must be declared before createES (createES closes over it)
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

    // EventSource factory with retry — handles 404 if session isn't registered yet
    let sessionId = ''
    let esRetries = 0
    const maxEsRetries = 5
    let es: EventSource

    function createES(): EventSource {
      const _es = new EventSource(`/api/terminal?sessionId=${sessionId}`)
      console.log('[Terminal] EventSource opening for sessionId=', sessionId)

      _es.onopen = () => {
        console.log('[Terminal] EventSource onopen — shell ready, firing cmd:', cmd)
        esRetries = 0
        ws.readyState = 1
        wsRef.current = _es as unknown as WebSocket
        setConnected(true)
        term.write('\x1b[32m  [E2B]\x1b[0m Shell ready\r\n\r\n')
        fitRef.current?.fit()
        setTimeout(() => {
          if (wsRef.current?.readyState === 1) {
            wsRef.current.send(JSON.stringify({ type: 'input', data: cmd + '\r' }))
            term.write('\r\n\x1b[33m  [Sparkie]\x1b[0m Running: ' + cmd + '\r\n')
          }
        }, 300)
      }

      _es.onerror = () => {
        console.error('[Terminal] EventSource error, readyState:', _es.readyState, 'retries:', esRetries)
        if (_es.readyState === EventSource.CLOSED && esRetries < maxEsRetries) {
          esRetries++
          _es.close()
          console.log('[Terminal] Retrying EventSource... attempt', esRetries)
          term.write('\r\n\x1b[33m  [E2B]\x1b[0m Retrying connection (' + esRetries + '/' + maxEsRetries + ')...\r\n')
          setTimeout(() => { es = createES() }, 600)
        } else if (_es.readyState === EventSource.CLOSED) {
          ws.readyState = 3
          setConnected(false)
          setContainerStatus('error')
          term.write('\r\n\x1b[31m  [E2B]\x1b[0m Connection failed after ' + maxEsRetries + ' retries\r\n')
        } else {
          term.write('\r\n\x1b[31m  [E2B]\x1b[0m Connection error (readyState=' + _es.readyState + ')\r\n')
        }
      }

      _es.onmessage = (e) => {
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
        // Server URL detection
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
            term.write('\r\n\x1b[32m  [Sparkie]\x1b[0m Preview ready \u2192 ' + url + '\r\n')
          }
        }
        if (raw.includes('ERROR') || raw.includes('error TS') || raw.includes('ENOENT')) {
          term.write('\r\n\x1b[31m  [Sparkie]\x1b[0m Build error detected \u2014 check above \u2191\r\n')
        }
      }

      return _es
    }

    // Kick off E2B create with 60s timeout
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
          console.error('[Terminal] E2B create failed:', res.status, errText)
          term.write('\r\n\x1b[31m  [Terminal] E2B create failed (' + res.status + '): ' + errText.slice(0, 80) + '\x1b[0m\r\n')
          setContainerStatus('error')
          return
        }
        const data = await res.json() as { sessionId: string; wsUrl: string }
        console.log('[Terminal] E2B session created:', data.sessionId)
        sessionId = data.sessionId
        sessionRef.current = data.sessionId
        setE2bMode(true)
        wsRef.current = ws as unknown as WebSocket
        es = createES()
      })
      .catch(err => {
        clearTimeout(fetchTimeout)
        if ((err as Error).name === 'AbortError') return  // already handled
        console.error('[Terminal] lazy connect fetch failed:', err)
        term.write('\r\n\x1b[31m  [Terminal] E2B connect failed: ' + String(err) + '\x1b[0m\r\n')
        setContainerStatus('error')
      })
  }, [pendingRunCommand, connected, setPendingRunCommand, setContainerStatus, setE2bMode, setConnected, setPreviewUrl, setIDETab])

  // ââ Server URL detection: watch WS output for localhost:PORT â set preview â
  // Patches the ws.onmessage handler at connection time is fragile (closure).
  // Instead we intercept via xterm.write with a post-write URL scan on raw data.
  // Implemented in connectE2B â see ws.onmessage extension below.

  // ââ ResizeObserver âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  useEffect(() => {
    if (!termRef.current || !fitRef.current) return
    const ro = new ResizeObserver(() => fitRef.current?.fit())
    ro.observe(termRef.current)
    return () => ro.disconnect()
  }, [])

  // ââ E2B PTY connection ââââââââââââââââââââââââââââââââââââââââââââââââââââ
    function clearTerminal() {
    xtermRef.current?.clear()
    prevOutputRef.current = ''
  }

  function reconnect() {
    wsRef.current?.close()
    setConnected(false)
    setE2bMode(false)
    sessionRef.current = ''
    const term = xtermRef.current
    if (!term) return
    term.clear()
    term.write('\r\n\x1b[33m  Reconnecting\u2026\x1b[0m\r\n')
    const currentChat = useAppStore.getState().chats.find(
      c => c.id === useAppStore.getState().currentChatId
    )
    const projectFiles = currentChat
      ? flattenWithPaths(currentChat.files)
      : []
    fetch('/api/terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', files: projectFiles }),
    })
      .then(async res => {
        if (!res.ok) { term.write('\r\n\x1b[31m  [E2B] Reconnect failed\x1b[0m\r\n'); return }
        const { sessionId } = await res.json() as { sessionId: string; wsUrl: string }
        sessionRef.current = sessionId
        setE2bMode(true)
        const es = new EventSource(`/api/terminal?sessionId=${sessionId}`)
        type WsShim = { readyState: number; onopen: (() => void) | null; onclose: (() => void) | null; onerror: (() => void) | null; onmessage: ((e: { data: string }) => void) | null; send: (d: string) => void; close: () => void }
        const ws: WsShim = {
          readyState: 0, onopen: null, onclose: null, onerror: null, onmessage: null,
          send: (data: string) => {
            const p = JSON.parse(data) as { type: string; data?: string; cols?: number; rows?: number }
            fetch('/api/terminal', { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: p.type === 'input' ? 'input' : 'resize', sessionId, ...p }) }).catch(() => {})
          },
          close: () => { es.close(); ws.readyState = 3 },
        }
        wsRef.current = ws as unknown as WebSocket
        es.onopen = () => { ws.readyState = 1; setConnected(true); fitRef.current?.fit(); term.write('\x1b[32m  [E2B]\x1b[0m Shell ready\r\n\r\n') }
        es.onerror = () => { if (es.readyState === EventSource.CLOSED) { ws.readyState = 3; setConnected(false); term.write('\r\n\x1b[33m  [E2B]\x1b[0m Session ended\r\n') } }
        es.onmessage = (e) => {
          let payload: { type: string; data: string } | null = null
          try { payload = JSON.parse(e.data) } catch { return }
          if (!payload) return
          if (payload.type === 'ping') return
          if (payload.type === 'connected') { ws.readyState = 1; ws.onopen?.(); return }
          term.write(payload.data ?? '')
        }
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
