/**
 * server.js — Custom Node HTTP server for Sparkie Studio
 *
 * Why this file exists:
 *   Next.js App Router Route Handlers cannot perform WebSocket upgrades.
 *   We wrap Next.js in a plain http.Server so we can intercept the WS
 *   upgrade request on /api/terminal-ws before Next.js ever sees it.
 *
 * Upgrade path:   /api/terminal-ws?sessionId=<id>
 * All other paths: delegated to Next.js as normal.
 *
 * Protocol (JSON frames):
 *   Server → Client  { type: 'connected', data: 'Shell ready' }
 *   Server → Client  { type: 'output',    data: '<pty bytes>'  }
 *   Server → Client  { type: 'ping',      data: ''             }
 *   Client → Server  { type: 'input',     data: '<keystrokes>' }
 *   Client → Server  { type: 'resize',    cols: N, rows: N     }
 */

'use strict'

const http    = require('http')
const { WebSocketServer } = require('ws')
const { parse } = require('url')
const next    = require('next')

const dev  = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT || '3000', 10)

const app    = next({ dev })
const handle = app.getRequestHandler()

// Lazy-load sessions from the compiled Next.js output.
// In production (next build), the module lives at .next/server/chunks/…
// We import it via the TypeScript path alias resolution that Next.js sets up.
// However, because server.js runs outside Next.js, we need to load the
// sessions map via a small CommonJS shim that Next.js writes during build,
// OR we just maintain a parallel sessions Map here and let route.ts import it.
//
// APPROACH: Use a shared in-process module. Both this file and route.ts
// require/import the same compiled module path. We load it lazily after
// app.prepare() so the .next/server bundle is available.
let sessions
let encodeMessage

app.prepare().then(() => {
  // After prepare(), the compiled module is available.
  // Next.js compiles src/lib/terminalSessions.ts into the server bundle.
  // We access the shared sessions Map via require of the compiled output.
  // Fallback: if the require path fails (dev mode HMR quirk), we use a
  // local Map — acceptable because in dev the WS server and route.ts run
  // in the same Node process sharing module cache.
  try {
    const sessModule = require('./.next/server/chunks/terminalSessions.js')
    sessions       = sessModule.sessions
    encodeMessage  = sessModule.encodeMessage
  } catch (_) {
    // Dev mode: modules aren't pre-compiled to .next/server/chunks.
    // Use a local store — both this file and the Next.js dev server run
    // in the same process, so we monkey-patch via global.
    if (!global.__terminalSessions) {
      global.__terminalSessions  = new Map()
      global.__encodeMessage = (type, data) => JSON.stringify({ type, data })
    }
    sessions      = global.__terminalSessions
    encodeMessage = global.__encodeMessage
  }

  const server = http.createServer((req, res) => {
    handle(req, res, parse(req.url, true))
  })

  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const { pathname, query } = parse(req.url, true)

    if (pathname !== '/api/terminal-ws') {
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, query)
    })
  })

  wss.on('connection', (ws, _req, query) => {
    const sessionId = query && query.sessionId
    if (!sessionId) {
      ws.send(encodeMessage('error', 'sessionId required'))
      ws.close(1008, 'sessionId required')
      return
    }

    const sess = sessions.get(sessionId)
    if (!sess) {
      ws.send(encodeMessage('error', 'Session not found'))
      ws.close(1008, 'Session not found')
      return
    }

    // Register client
    sess.clients.add(ws)

    // Send connected event immediately
    ws.send(encodeMessage('connected', 'Shell ready'))

    // Keep-alive ping every 15s
    const pingInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.send(encodeMessage('ping', ''))
      }
    }, 15000)

    ws.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch (_) { return }

      if (msg.type === 'input' && typeof msg.data === 'string' && sess.ptyPid !== null) {
        sess.sbx.pty.sendInput(sess.ptyPid, Buffer.from(msg.data, 'utf-8')).catch(() => {})
      } else if (msg.type === 'resize' && sess.ptyPid !== null) {
        const cols = Math.max(1, parseInt(msg.cols, 10) || 80)
        const rows = Math.max(1, parseInt(msg.rows, 10) || 24)
        sess.sbx.pty.resize(sess.ptyPid, { cols, rows }).catch(() => {})
      }
    })

    ws.on('close', () => {
      clearInterval(pingInterval)
      sess.clients.delete(ws)
    })

    ws.on('error', () => {
      clearInterval(pingInterval)
      sess.clients.delete(ws)
    })
  })

  server.listen(port, () => {
    console.log(`> Sparkie Studio ready on http://localhost:${port}`)
    console.log(`> WebSocket terminal on ws://localhost:${port}/api/terminal-ws`)
  })
})
