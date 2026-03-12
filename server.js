/**
 * server.js — Custom Node HTTP server for Sparkie Studio
 *
 * Why this file exists:
 *   Next.js App Router Route Handlers cannot perform WebSocket upgrades.
 *   We wrap Next.js in a plain http.Server so we can intercept the WS
 *   upgrade request on /api/terminal-ws before Next.js ever sees it.
 *
 * Upgrade handling:
 *   We register server.on('upgrade') BEFORE app.prepare() so our handler
 *   wins over any upgrade listener Next.js registers internally. We call
 *   wss.handleUpgrade() directly for /api/terminal-ws, then emit 'connection'.
 *   All other upgrade paths are destroyed cleanly.
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
 * Handle a confirmed WS connection — session lookup, ping loop, message routing.
 * Called from both the upgrade handler and wss.on('connection') (belt-and-suspenders).
 */
function handleWsConnection(ws, req) {
  const { pathname, query } = parse(req.url, true)

  if (pathname !== '/api/terminal-ws') {
    console.log('[WS] unexpected path, closing:', pathname)
    ws.close(1008, 'Not found')
    return
  }

  const sessionId = query && query.sessionId
  console.log('[WS] connection sessionId:', sessionId)
  if (!sessionId) {
    console.log('[WS] close: no sessionId')
    try { ws.send(encodeMessage('error', 'sessionId required')) } catch (_) {}
    ws.close(1008, 'sessionId required')
    return
  }

  const sessions = getSessions()
  if (!sessions) {
    console.log('[WS] close: sessions global not ready')
    try { ws.send(encodeMessage('error', 'Server not ready')) } catch (_) {}
    ws.close(1011, 'Server not ready')
    return
  }

  const sess = sessions.get(sessionId)
  if (!sess) {
    console.log('[WS] close: session not found. map size:', sessions.size)
    try { ws.send(encodeMessage('error', 'Session not found')) } catch (_) {}
    ws.close(1008, 'Session not found')
    return
  }

  console.log('[WS] session ok, ptyPid:', sess.ptyPid)

  // Register client
  sess.clients.add(ws)

  // Send 'connected' after one tick
  setImmediate(() => {
    try { ws.send(encodeMessage('connected', 'Shell ready')) } catch (_) {}
  })

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

  // Use noServer mode so we control handleUpgrade ourselves.
  // This is critical: with { server } attached mode, Next.js may register
  // its own 'upgrade' listener first and consume the event before ws sees it.
  // With noServer + explicit server.on('upgrade'), we always win.
  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', handleWsConnection)

  // Register upgrade handler BEFORE server.listen so it's first in the
  // listener queue. Any upgrade for /api/terminal-ws is handled here;
  // everything else is destroyed with a 400.
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url, true)
    console.log('[upgrade] path:', pathname)

    if (pathname === '/api/terminal-ws') {
      console.log('[upgrade] routing to wss.handleUpgrade')
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    } else {
      console.log('[upgrade] unknown path, destroying socket')
      socket.destroy()
    }
  })

  server.listen(port, () => {
    console.log(`> Sparkie Studio ready on http://localhost:${port}`)
    console.log(`> WebSocket terminal on ws://localhost:${port}/api/terminal-ws`)
    startKeepalive(port)
  })
})
