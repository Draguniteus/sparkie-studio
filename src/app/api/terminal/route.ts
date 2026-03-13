import { NextRequest, NextResponse } from 'next/server'
import { Sandbox } from '@e2b/code-interpreter'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { sessions, encodeMessage } from '@/lib/terminalSessions'
import type { WsClient } from '@/lib/terminalSessions'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

// Vite dev-server ready signals
const VITE_READY_SIGNALS = ['Local:', 'ready in', 'Network:', 'VITE v', 'Serving!', 'Accepting connections', 'http://0.0.0.0:8080']

function broadcastToClients(clients: Set<WsClient>, msg: string) {
  clients.forEach(c => {
    if ((c as unknown as { readyState: number }).readyState === 1 /* OPEN */) {
      try { (c as unknown as { send(m: string): void }).send(msg) } catch (_) {}
    }
  })
}

// POST /api/terminal
export async function POST(req: NextRequest) {
  const apiKey = process.env.E2B_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'E2B_API_KEY not set' }, { status: 500 })

  // Allow internal server.js 'start' calls to bypass NextAuth
  const isInternal = req.headers.get('x-internal-call') === 'terminal-start'

  if (!isInternal) {
    let authSession = null
    try { authSession = await getServerSession(authOptions) } catch (_) {}
    if (!authSession?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as {
    action: 'create' | 'start' | 'input' | 'resize' | 'sync-files'
    sessionId?: string
    data?: string
    cmd?: string
    cols?: number
    rows?: number
    files?: { name?: string; path?: string; content: string }[]
  }

  // ── CREATE: sandbox + file write only. NO PTY. ──────────────────────────
  // PTY is created lazily via 'start' action once the WS connection is stable.
  if (body.action === 'create') {
    const sessionId = `term_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    try {
      const sbx = await Sandbox.create({ apiKey, timeoutMs: 30 * 60 * 1000 })

      const files = body.files ?? []
      if (files.length > 0) {
        const firstNested = files.find(f => (f.name ?? f.path ?? '').includes('/'))
        const projectRoot = firstNested ? (firstNested.name ?? firstNested.path ?? '').split('/')[0] : 'project'
        const dirs = new Set<string>()
        files.forEach(f => {
          const fullPath = (f.name ?? f.path ?? '').startsWith(projectRoot + '/')
            ? `/home/user/${(f.name ?? f.path ?? '')}`
            : `/home/user/${projectRoot}/${(f.name ?? f.path ?? '')}`
          dirs.add(fullPath.substring(0, fullPath.lastIndexOf('/')))
        })
        await sbx.commands.run(`mkdir -p ${[...dirs].join(' ')}`)
        await Promise.all(
          files.map(f => {
            const filePath = (f.name ?? f.path ?? '').startsWith(projectRoot + '/')
              ? `/home/user/${(f.name ?? f.path ?? '')}`
              : `/home/user/${projectRoot}/${(f.name ?? f.path ?? '')}`
            return sbx.files.write(filePath, f.content)
          })
        )
        // Ensure vite is configured correctly for E2B
        const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true, strictPort: true },
})
`
        await sbx.files.write(`/home/user/${projectRoot}/vite.config.ts`, viteConfig)
      }

      let previewUrl: string | null = null
      try { previewUrl = `https://${sbx.getHost(8080)}` } catch (_) {}  // npx serve port

      sessions.set(sessionId, {
        sbx,
        ptyPid: null,
        clients: new Set<WsClient>(),
        createdAt: Date.now(),
        previewUrl,
        logBuffer: [],
        buildDone: false,
        previewSent: false,
      })

      // Auto-start PTY with cmd if provided.
      // This eliminates the need for the client to send {type:'input'} over WS —
      // which DO's nginx proxy was swallowing (no [WS] pong received or message type
      // logs ever appeared, confirming client→server WS frames never reached server).
      // Grok/Qwen recommendation: static build + npx serve (no long-running dev server).
      const rawCmd = body.cmd ?? ''
      const createCmd = rawCmd || 'npm install && npm run build 2>&1 && npx serve -s dist -l 8080 --no-clipboard 2>&1'
      if (createCmd) {
        try {
          const pty = await sbx.pty.create({
            onData: (data: Uint8Array) => {
              const text = Buffer.from(data).toString('utf-8')
              const sess2 = sessions.get(sessionId)
              if (!sess2) return
              broadcastToClients(sess2.clients, encodeMessage('output', text))
              // Accumulate logs for /api/logs polling (Qwen model — no WS required)
              if (sess2.logBuffer.length < 500) {
                sess2.logBuffer.push(text)
              } else {
                sess2.logBuffer.shift()
                sess2.logBuffer.push(text)
              }
              if (!sess2.previewSent && sess2.previewUrl) {
                if (VITE_READY_SIGNALS.some(sig => text.includes(sig))) {
                  sess2.previewSent = true
                  sess2.buildDone = true
                  broadcastToClients(sess2.clients, JSON.stringify({ type: 'preview', url: sess2.previewUrl }))
                  console.log('[PTY] Preview ready — URL broadcast + polling available:', sess2.previewUrl)
                }
              }
            },
            cols: 80, rows: 24, timeoutMs: 0,
          })
          const sess2 = sessions.get(sessionId)!
          sess2.ptyPid = pty.pid
          await sbx.pty.sendInput(pty.pid, Buffer.from(createCmd, 'utf-8'))
          console.log('[create] PTY started, pid:', pty.pid, 'cmd:', createCmd.slice(0, 60))
        } catch (ptyErr) {
          console.error('[create] PTY start failed:', ptyErr)
          // Non-fatal — session still created, WS can still connect
        }
      }

      return NextResponse.json({
        sessionId,
        wsUrl: `/api/terminal-ws?sessionId=${sessionId}`,
        previewUrl,
      })
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 })
    }
  }

  // ── START: create PTY and run command. Called by server.js after WS is stable. ──
  // This is the key change: PTY starts AFTER the WS is open and has clients.
  // The PTY onData broadcasts to sess.clients which already contains the WS.
  // No burst-on-connect because the PTY didn't exist before this call.
  if (body.action === 'start' && body.sessionId) {
    const sess = sessions.get(body.sessionId)
    if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (sess.ptyPid !== null) return NextResponse.json({ ok: true, alreadyStarted: true })

    const cmd = body.cmd ?? ''
    try {
      const pty = await sess.sbx.pty.create({
        onData: (data: Uint8Array) => {
          const text = Buffer.from(data).toString('utf-8')
          broadcastToClients(sess.clients, encodeMessage('output', text))

          if (!sess.previewSent && sess.previewUrl) {
            if (VITE_READY_SIGNALS.some(sig => text.includes(sig))) {
              sess.previewSent = true
              broadcastToClients(sess.clients, JSON.stringify({ type: 'preview', url: sess.previewUrl }))
              console.log('[PTY] Vite ready — preview URL broadcast:', sess.previewUrl)
            }
          }
        },
        cols: 80,
        rows: 24,
        timeoutMs: 0,
      })
      sess.ptyPid = pty.pid
      if (cmd) {
        await sess.sbx.pty.sendInput(sess.ptyPid, Buffer.from(cmd, 'utf-8'))
      }
      return NextResponse.json({ ok: true, ptyPid: pty.pid })
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 })
    }
  }

  // ── INPUT ──────────────────────────────────────────────────────────────
  if (body.action === 'input' && body.sessionId && body.data) {
    const sess = sessions.get(body.sessionId)
    if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (sess.ptyPid === null) return NextResponse.json({ error: 'Terminal not started' }, { status: 503 })
    try { await sess.sbx.pty.sendInput(sess.ptyPid, Buffer.from(body.data, 'utf-8')) } catch (_) {}
    return NextResponse.json({ ok: true })
  }

  // ── RESIZE ─────────────────────────────────────────────────────────────
  if (body.action === 'resize' && body.sessionId && body.cols && body.rows) {
    const sess = sessions.get(body.sessionId)
    if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (sess.ptyPid !== null) {
      try { await sess.sbx.pty.resize(sess.ptyPid, { cols: body.cols, rows: body.rows }) } catch (_) {}
    }
    return NextResponse.json({ ok: true })
  }

  // ── SYNC-FILES ─────────────────────────────────────────────────────────
  if (body.action === 'sync-files' && body.sessionId) {
    const sess = sessions.get(body.sessionId)
    if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    const files = body.files ?? []
    if (files.length > 0) {
      const firstNested = files.find(f => (f.name ?? f.path ?? '').includes('/'))
      const projectRoot = firstNested ? (firstNested.name ?? firstNested.path ?? '').split('/')[0] : 'project'
      const syncDirs = new Set<string>()
      files.forEach(f => {
        const fullPath = (f.name ?? f.path ?? '').startsWith(projectRoot + '/')
          ? `/home/user/${(f.name ?? f.path ?? '')}`
          : `/home/user/${projectRoot}/${(f.name ?? f.path ?? '')}`
        syncDirs.add(fullPath.substring(0, fullPath.lastIndexOf('/')))
      })
      await sess.sbx.commands.run(`mkdir -p ${[...syncDirs].join(' ')}`)
      await Promise.all(
        files.map(f => {
          const filePath = (f.name ?? f.path ?? '').startsWith(projectRoot + '/')
            ? `/home/user/${(f.name ?? f.path ?? '')}`
            : `/home/user/${projectRoot}/${(f.name ?? f.path ?? '')}`
          return sess.sbx.files.write(filePath, f.content)
        })
      )
      const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true, strictPort: true },
})
`
      await sess.sbx.files.write(`/home/user/${projectRoot}/vite.config.ts`, viteConfig)
    }
    return NextResponse.json({ ok: true, synced: files.length })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
