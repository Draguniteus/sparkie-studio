/**
 * server.js — Custom Node HTTP server for Sparkie Studio
 *
 * Why this file exists:
 *   Next.js App Router Route Handlers cannot perform WebSocket upgrades.
 *   We wrap Next.js in a plain http.Server so we can intercept the WS
 *   upgrade request on /api/terminal-ws before Next.js ever sees it.
 *
 * Sessions sharing:
 *   Both this file and src/app/api/terminal/route.ts use the same
 *   global.__terminalSessions Map (initialized by terminalSessions.ts).
 *   We access it via global after app.prepare() — by then, Next.js has
 *   loaded route.ts which initialises the global. We use a poll/wait
 *   loop to handle the rare case where the first request arrives before
 *   the global is populated.
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

/** Encode a typed message for the wire protocol. */
function encodeMessage(type, data) {
  return JSON.stringify({ type, data })
}

/** Get sessions from the global store (set by terminalSessions.ts at module load). */
function getSessions() {
  return global.__terminalSessions || null
}

app.prepare().then(() => {
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

    // Sessions global is populated by terminalSessions.ts when Next.js loads route.ts.
    // In practice it's always ready by the time a WS connection arrives (after POST /api/terminal create),
    // but we guard defensively.
    const sessions = getSessions()
    if (!sessions) {
      ws.send(encodeMessage('error', 'Server not ready'))
      ws.close(1011, 'Server not ready')
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
