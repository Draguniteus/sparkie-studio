"use client"

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store/appStore'

export function Terminal() {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef    = useRef<{ write: (s: string) => void; writeln: (s: string) => void } | null>(null)
  const fitRef     = useRef<{ fit: () => void } | null>(null)
  const lastLen    = useRef(0)
  const { terminalOutput, containerStatus, previewUrl } = useAppStore()

  useEffect(() => {
    if (!containerRef.current || termRef.current) return

    // All WC/xterm imports are dynamic — never resolved at build time
    ;(async () => {
      const [{ Terminal: XTerm }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-web-links'),
      ])
      // xterm CSS — inject once
      if (!document.querySelector('#xterm-css')) {
        const link = document.createElement('link')
        link.id = 'xterm-css'
        link.rel = 'stylesheet'
        link.href = 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css'
        document.head.appendChild(link)
      }

      const term = new XTerm({
        theme: {
          background: '#0d0d0d', foreground: '#e2e8f0', cursor: '#FFC30B',
          selectionBackground: '#FFC30B33', black: '#0d0d0d', brightBlack: '#374151',
          red: '#ef4444', brightRed: '#f87171', green: '#22c55e', brightGreen: '#4ade80',
          yellow: '#FFC30B', brightYellow: '#fde047', blue: '#60a5fa', brightBlue: '#93c5fd',
          magenta: '#c084fc', brightMagenta: '#d8b4fe', cyan: '#22d3ee', brightCyan: '#67e8f9',
          white: '#e2e8f0', brightWhite: '#f8fafc',
        },
        fontFamily: "'Fira Code','Cascadia Code','Courier New',monospace",
        fontSize: 13, lineHeight: 1.5, cursorBlink: true, cursorStyle: 'bar', scrollback: 5000,
      })

      const fit = new FitAddon()
      term.loadAddon(fit)
      term.loadAddon(new WebLinksAddon())
      term.open(containerRef.current!)
      fit.fit()

      termRef.current = term
      fitRef.current  = fit

      term.writeln('\x1b[38;2;255;195;11m  ⬡ Sparkie Studio Terminal\x1b[0m')
      term.writeln('\x1b[90m  WebContainer environment ready\x1b[0m')
      term.writeln('')
    })()

    const ro = new ResizeObserver(() => fitRef.current?.fit())
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Pipe store output into terminal
  useEffect(() => {
    if (!termRef.current) return
    const newText = terminalOutput.slice(lastLen.current)
    if (newText) {
      termRef.current.write(newText)
      lastLen.current = terminalOutput.length
    }
  }, [terminalOutput])

  // Status banners
  useEffect(() => {
    if (!termRef.current) return
    const banners: Record<string, string> = {
      booting:    '\x1b[33m⏳ Booting WebContainer...\x1b[0m\r\n',
      mounting:   '\x1b[33m📁 Mounting files...\x1b[0m\r\n',
      installing: '\x1b[33m📦 Running npm install...\x1b[0m\r\n',
      starting:   '\x1b[33m🚀 Starting dev server...\x1b[0m\r\n',
      ready:      `\x1b[32m✅ Server ready → ${previewUrl ?? 'localhost'}\x1b[0m\r\n`,
      error:      '\x1b[31m❌ WebContainer error — check output above\x1b[0m\r\n',
    }
    if (banners[containerStatus]) termRef.current.writeln(banners[containerStatus])
  }, [containerStatus, previewUrl])

  return (
    <div className="h-full flex flex-col bg-[#0d0d0d]">
      <div className="flex items-center h-7 px-3 bg-hive-700 border-b border-hive-border shrink-0 gap-2">
        <span className="text-[11px] text-text-muted font-mono">Terminal</span>
        {containerStatus === 'ready' && previewUrl && (
          <a href={previewUrl} target="_blank" rel="noopener noreferrer"
            className="ml-auto text-[10px] px-2 py-0.5 rounded bg-honey-500/10 text-honey-500 border border-honey-500/20 hover:bg-honey-500/20 transition-colors">
            {previewUrl} ↗
          </a>
        )}
      </div>
      <div ref={containerRef} className="flex-1 p-1 overflow-hidden" />
    </div>
  )
}
