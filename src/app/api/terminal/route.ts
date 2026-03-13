import { NextRequest, NextResponse } from 'next/server'
import { Sandbox } from '@e2b/code-interpreter'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { sessions, encodeMessage } from '@/lib/terminalSessions'
import type { WsClient } from '@/lib/terminalSessions'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

// Vite dev-server ready signals (any of these in PTY output = server is up)
const VITE_READY_SIGNALS = [
  'Local:',
  'ready in',
  'Network:',
  'VITE v',
]

function broadcastToClients(clients: Set<WsClient>, msg: string) {
  clients.forEach(c => {
    if ((c as unknown as { readyState: number }).readyState === 1 /* OPEN */) {
      try { (c as unknown as { send(m: string): void }).send(msg) } catch (_) {}
    }
  })
}

// POST /api/terminal — create session, send input, resize, or sync-files
export async function POST(req: NextRequest) {
  const apiKey = process.env.E2B_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'E2B_API_KEY not set' }, { status: 500 })
  }

  const authSession = await getServerSession(authOptions)
  if (!authSession?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as {
    action: 'create' | 'input' | 'resize' | 'sync-files'
    sessionId?: string
    data?: string
    cols?: number
    rows?: number
  }

  // Create new terminal session
  if (body.action === 'create') {
    const sessionId = `term_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    try {
      const sbx = await Sandbox.create({ apiKey, timeoutMs: 30 * 60 * 1000 })

      const files = (body as typeof body & { files?: { name: string; content: string }[] }).files ?? []
      if (files.length > 0) {
        const firstNested = files.find(f => f.name.includes('/'))
        const projectRoot = firstNested ? firstNested.name.split('/')[0] : 'project'
        // mkdir -p all parent dirs before writing — E2B requires dirs to exist
        const dirs = new Set<string>()
        files.forEach(f => {
          const fullPath = f.name.startsWith(projectRoot + '/')
            ? `/home/user/${f.name}`
            : `/home/user/${projectRoot}/${f.name}`
          const dir = fullPath.substring(0, fullPath.lastIndexOf('/'))
          dirs.add(dir)
        })
        await sbx.commands.run(`mkdir -p ${[...dirs].join(' ')}`)
        await Promise.all(
          files.map(f => {
            const filePath = f.name.startsWith(projectRoot + '/')
              ? `/home/user/${f.name}`
              : `/home/user/${projectRoot}/${f.name}`
            return sbx.files.write(filePath, f.content)
          })
        )
        const viteConfigContent = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    strictPort: true,
  },
})
`
        await sbx.files.write(`/home/user/${projectRoot}/vite.config.ts`, viteConfigContent)
      }

      // Grab preview URL upfront — E2B exposes a stable public HTTPS URL per sandbox
      let previewUrl: string | null = null
      try {
        previewUrl = `https://${sbx.getHost(5173)}`
      } catch (_) {
        // getHost unavailable
      }

      const sess = {
        sbx,
        ptyPid: null as number | null,
        clients: new Set<WsClient>(),
        createdAt: Date.now(),
        previewUrl,          // stored so PTY onData can broadcast it
        previewSent: false,  // broadcast only once per session
      }
      sessions.set(sessionId, sess)

      // Create PTY — output broadcasts to all connected WS clients
      // Also watches for Vite ready signal and broadcasts {type:'preview'} frame
      const pty = await sbx.pty.create({
        onData: (data: Uint8Array) => {
          const text = Buffer.from(data).toString('utf-8')
          const msg = encodeMessage('output', text)
          broadcastToClients(sess.clients, msg)

          // Detect Vite dev-server ready — broadcast preview URL once
          if (!sess.previewSent && sess.previewUrl) {
            const isReady = VITE_READY_SIGNALS.some(sig => text.includes(sig))
            if (isReady) {
              sess.previewSent = true
              const previewMsg = JSON.stringify({ type: 'preview', url: sess.previewUrl })
              broadcastToClients(sess.clients, previewMsg)
              console.log('[PTY] Vite ready detected — preview URL broadcast:', sess.previewUrl)
            }
          }
        },
        cols: 80,
        rows: 24,
        timeoutMs: 0,
      })

      sess.ptyPid = pty.pid

      return NextResponse.json({
        sessionId,
        wsUrl: `/api/terminal-ws?sessionId=${sessionId}`,
        previewUrl,
      })
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 })
    }
  }

  // Send input to running session
  if (body.action === 'input' && body.sessionId && body.data) {
    const sess = sessions.get(body.sessionId)
    if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (sess.ptyPid === null) return NextResponse.json({ error: 'Terminal not ready' }, { status: 503 })
    try {
      await sess.sbx.pty.sendInput(sess.ptyPid, Buffer.from(body.data, 'utf-8'))
    } catch (_) { /* ignore */ }
    return NextResponse.json({ ok: true })
  }

  // Resize terminal
  if (body.action === 'resize' && body.sessionId && body.cols && body.rows) {
    const sess = sessions.get(body.sessionId)
    if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (sess.ptyPid === null) return NextResponse.json({ ok: true })
    try {
      await sess.sbx.pty.resize(sess.ptyPid, { cols: body.cols, rows: body.rows })
    } catch (_) { /* ignore */ }
    return NextResponse.json({ ok: true })
  }

  // Sync files into existing session sandbox
  if (body.action === 'sync-files' && body.sessionId) {
    const sess = sessions.get(body.sessionId)
    if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    const files = (body as typeof body & { files?: { name: string; content: string }[] }).files ?? []
    if (files.length > 0) {
      const firstNested = files.find(f => f.name.includes('/'))
      const projectRoot = firstNested ? firstNested.name.split('/')[0] : 'project'
      // mkdir -p all parent dirs before writing — E2B requires dirs to exist
      const syncDirs = new Set<string>()
      files.forEach(f => {
        const fullPath = f.name.startsWith(projectRoot + '/')
          ? `/home/user/${f.name}`
          : `/home/user/${projectRoot}/${f.name}`
        const dir = fullPath.substring(0, fullPath.lastIndexOf('/'))
        syncDirs.add(dir)
      })
      await sess.sbx.commands.run(`mkdir -p ${[...syncDirs].join(' ')}`)
      await Promise.all(
        files.map(f => {
          const filePath = f.name.startsWith(projectRoot + '/')
            ? `/home/user/${f.name}`
            : `/home/user/${projectRoot}/${f.name}`
          return sess.sbx.files.write(filePath, f.content)
        })
      )
      const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    strictPort: true,
  },
})
`
      await sess.sbx.files.write(`/home/user/${projectRoot}/vite.config.ts`, viteConfig)
    }
    return NextResponse.json({ ok: true, synced: files.length })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
