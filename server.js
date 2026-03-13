/**
 * server.js — Custom Node HTTP server for Sparkie Studio
 *
 * Why this file exists:
 *   Next.js App Router Route Handlers cannot perform WebSocket upgrades.
 *   We wrap Next.js in a plain http.Server so we can intercept the WS
 *   upgrade request on /api/terminal-ws before Next.js ever sees it.
 *
 * Upgrade handling:
 *   We use server.prependListener('upgrade') so our handler is ALWAYS
 *   first in the listener queue, before any listeners Next.js registers.
 *   We call wss.handleUpgrade() directly and send the 'connected' frame
 *   synchronously inside the callback — before emitting 'connection' —
 *   so the DO proxy sees a data frame immediately after the handshake
 *   and does not close the idle socket.
 *
 * Sessions sharing:
 *   Both this file and src/app/api/terminal/route.ts use the same
 *   global.__terminalSessions Map (initialized by terminalSessions.ts).
 *   We access it via global after app.prepare() — by then, Next.js has
 *   loaded route.ts which initialises the global.
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

/**
 * Self-ping keepalive — prevents DO App Platform from hibernating the
 * instance after idle periods. Fires every 4 minutes.
 */
function startKeepalive(serverPort) {
  const INTERVAL_MS = 4 * 60 * 1000 // 4 minutes
  setInterval(() => {
    try {
      const req = http.get(`http://localhost:${serverPort}/api/health`, (res) => {
        res.resume() // drain the response
      })
      req.on('error', () => {}) // ignore errors silently
      req.end()
    } catch (_) {}
  }, INTERVAL_MS)
  console.log(`> Keepalive ping active (every ${INTERVAL_MS / 60000}m → /api/health)`)
}

/**
 * Wire up all WS event handlers for a live socket.
 * Called after the 'connected' frame has already been sent synchronously.
 */
function attachWsHandlers(ws, sess, sessionId) {
  // Register client
  sess.clients.add(ws)

  // Keep-alive ping — start at 1s to survive DO proxy idle detection during npm install
  let pingCount = 0
  let pingInterval
  function schedulePing() {
    const delay = pingCount < 30 ? 1000 : 5000
    pingInterval = setTimeout(() => {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(encodeMessage('ping', '')) } catch (_) {}
        pingCount++
        schedulePing()
      }
    }, delay)
  }
  schedulePing()

  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw.toString()) } catch (_) { return }
    console.log('[WS] message type:', msg && msg.type)

    if (msg.type === 'input' && typeof msg.data === 'string' && sess.ptyPid !== null) {
      sess.sbx.pty.sendInput(sess.ptyPid, Buffer.from(msg.data, 'utf-8')).catch((e) => {
        console.error('[WS] pty.sendInput error:', e)
      })
    } else if (msg.type === 'resize' && sess.ptyPid !== null) {
      const cols = Math.max(1, parseInt(msg.cols, 10) || 80)
      const rows = Math.max(1, parseInt(msg.rows, 10) || 24)
      sess.sbx.pty.resize(sess.ptyPid, { cols, rows }).catch(() => {})
    }
  })

  ws.on('close', (code, reason) => {
    console.log('[WS] close event code:', code, 'reason:', reason?.toString())
    clearTimeout(pingInterval)
    sess.clients.delete(ws)
  })

  ws.on('error', (err) => {
    console.error('[WS] error event:', err.message)
    clearTimeout(pingInterval)
    sess.clients.delete(ws)
  })
}

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    handle(req, res, parse(req.url, true))
  })

  // noServer mode — we drive handleUpgrade ourselves so we can send the
  // 'connected' frame synchronously before the proxy can idle-close.
  const wss = new WebSocketServer({ noServer: true })

  // prependListener guarantees this runs BEFORE any listener Next.js adds.
  server.prependListener('upgrade', (req, socket, head) => {
    const { pathname, query } = parse(req.url, true)
    console.log('[upgrade] path:', pathname)

    if (pathname !== '/api/terminal-ws') {
      console.log('[upgrade] unknown path, destroying socket')
      socket.destroy()
      return
    }

    const sessionId = query && query.sessionId
    console.log('[upgrade] sessionId:', sessionId)

    if (!sessionId) {
      socket.destroy()
      return
    }

    const sessions = getSessions()
    if (!sessions) {
      console.log('[upgrade] sessions global not ready')
      socket.destroy()
      return
    }

    const sess = sessions.get(sessionId)
    if (!sess) {
      console.log('[upgrade] session not found, map size:', sessions ? sessions.size : 'N/A')
      socket.destroy()
      return
    }

    console.log('[upgrade] session ok, ptyPid:', sess.ptyPid, '- calling handleUpgrade')

    wss.handleUpgrade(req, socket, head, (ws) => {
      console.log('[WS] handleUpgrade complete, sending connected frame synchronously')

      // Send 'connected' SYNCHRONOUSLY — before any await or setImmediate.
      // This is the critical fix: the DO proxy sees a data frame immediately
      // after the upgrade handshake and does not idle-close the socket.
      try { ws.send(encodeMessage('connected', 'Shell ready')) } catch (_) {}

      console.log('[WS] connected frame sent, attaching handlers for sessionId:', sessionId)
      attachWsHandlers(ws, sess, sessionId)
    })
  })

  server.listen(port, () => {
    console.log(`> Sparkie Studio ready on http://localhost:${port}`)
    console.log(`> WebSocket terminal on ws://localhost:${port}/api/terminal-ws`)
    startKeepalive(port)
  })
})
