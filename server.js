/**
 * server.js — Custom Node HTTP server for Sparkie Studio
 *
 * Architecture: ATTACHED mode
 *   WebSocketServer({ server, path: '/api/terminal-ws' }) integrates ws
 *   with Node's http.Server connection tracking so DO's nginx proxy keeps
 *   the socket alive through the full WS lifecycle.
 *
 * Sessions:
 *   Both this file and src/app/api/terminal/route.ts share the same
 *   global.__terminalSessions Map (initialised by terminalSessions.ts).
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

function encodeMessage(type, data) {
  return JSON.stringify({ type, data })
}

function getSessions() {
  return global.__terminalSessions || null
}

function startKeepalive(serverPort) {
  const INTERVAL_MS = 4 * 60 * 1000
  setInterval(() => {
    const req = http.get(`http://localhost:${serverPort}/api/health`, (res) => {
      res.resume()
    })
    req.on('error', () => {})
    req.end()
  }, INTERVAL_MS)
  console.log(`> Keepalive ping active (every ${INTERVAL_MS / 60000}m → /api/health)`)
}

function attachWsHandlers(ws, sess, sessionId) {
  sess.clients.add(ws)

  // Adaptive ping: fast (1s) during npm install window, then backs off to 5s.
  // Prevents DO proxy from closing an idle socket mid-install.
  let pingCount = 0
  let pingTimer
  function schedulePing() {
    const delay = pingCount < 60 ? 1000 : 5000  // fast for first 60s
    pingTimer = setTimeout(() => {
      if (ws.readyState === ws.OPEN) {
        // RFC 6455 protocol-level ping — keeps DO nginx proxy alive
        try { ws.ping() } catch (_) {}
        // Application-layer ping for client heartbeat
        try { ws.send(encodeMessage('ping', '')) } catch (_) {}
        pingCount++
        schedulePing()
      }
    }, delay)
  }
  schedulePing()

  ws.on('pong', () => {
    console.log('[WS] pong received — proxy round-trip confirmed')
  })

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
    clearTimeout(pingTimer)
    sess.clients.delete(ws)
  })

  ws.on('error', (err) => {
    console.error('[WS] error event:', err.message)
    clearTimeout(pingTimer)
    sess.clients.delete(ws)
  })
}

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    handle(req, res, parse(req.url, true))
  })

  // ATTACHED mode: ws integrates with http.Server connection tracking.
  // The path option means ws only handles /api/terminal-ws upgrades.
  const wss = new WebSocketServer({ server, path: '/api/terminal-ws' })

  // prependListener ensures we can reject non-terminal paths BEFORE
  // ws or Next.js get a chance to handle them.
  server.prependListener('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url, true)
    console.log('[upgrade] path:', pathname)

    if (pathname !== '/api/terminal-ws') {
      // Not our path — destroy and let no other handler run
      socket.destroy()
      return
    }
    // Fall through — ws's attached listener handles /api/terminal-ws
  })

  // ws connection event fires after the 101 handshake is complete.
  wss.on('connection', (ws, req) => {
    const { query } = parse(req.url, true)
    const sessionId = query && query.sessionId
    console.log('[WS] connection sessionId:', sessionId)

    // Diagnostic: log socket state at moment of connection
    const sock = ws._socket
    console.log('[WS] socket.readyState:', ws.readyState,
      '| socket.writable:', sock ? sock.writable : 'N/A',
      '| socket.destroyed:', sock ? sock.destroyed : 'N/A')

    if (!sessionId) {
      ws.close(1008, 'Missing sessionId')
      return
    }

    const sessions = getSessions()
    const sess = sessions && sessions.get(sessionId)
    if (!sess) {
      console.log('[WS] session not found for:', sessionId, '| map size:', sessions ? sessions.size : 'N/A')
      ws.close(1008, 'Session not found')
      return
    }

    console.log('[WS] session ok, ptyPid:', sess.ptyPid)

    // ── CRITICAL FIX: clear stale clients before adding new one ──────────
    // When client reconnects (e.g. after 1006), the old WS reference is
    // still in sess.clients. The PTY onData fires immediately (npm install
    // output is already streaming) and broadcasts to ALL clients including
    // the new one — before the browser WS has finished setup. This causes
    // a burst-on-connect that silently drops the socket (1006).
    //
    // Solution: close + remove all existing clients first. Each session
    // supports exactly one active client at a time (single-user IDE).
    if (sess.clients.size > 0) {
      console.log('[WS] clearing', sess.clients.size, 'stale client(s) before new connection')
      for (const oldWs of sess.clients) {
        try { oldWs.close(1000, 'Replaced by new connection') } catch (_) {}
      }
      sess.clients.clear()
    }

    // Disable Nagle's algorithm — ensures small frames (ping, connected)
    // are sent immediately without buffering.
    if (sock) {
      try { sock.setNoDelay(true) } catch (_) {}
    }

    // Send RFC 6455 protocol-level ping FIRST — signals to DO proxy that
    // this is an active WS connection before we send any application data.
    try { ws.ping() } catch (_) {}
    console.log('[WS] protocol ping sent')

    // Send connected frame — first application message to client.
    try { ws.send(encodeMessage('connected', 'Shell ready')) } catch (_) {}
    console.log('[WS] connected frame sent')

    // Log socket state again after sends
    console.log('[WS] post-send readyState:', ws.readyState,
      '| socket.writable:', sock ? sock.writable : 'N/A')

    // ── Defer handler attachment by one tick ─────────────────────────────
    // Gives the browser WS implementation time to finish its own setup
    // after receiving the 'connected' frame before we start streaming
    // PTY output to it. Without this, a PTY burst (e.g. npm install
    // stdout already buffered) arrives in the same event loop tick as
    // the connected frame and can race with browser WS state machine.
    setImmediate(() => {
      if (ws.readyState !== ws.OPEN) {
        console.log('[WS] socket closed before handler attach, skipping')
        return
      }
      attachWsHandlers(ws, sess, sessionId)
      console.log('[WS] handlers attached, client added to sess.clients')
    })
  })

  server.listen(port, () => {
    console.log(`> Sparkie Studio ready on http://localhost:${port}`)
    console.log(`> WebSocket terminal on ws://localhost:${port}/api/terminal-ws`)
    startKeepalive(port)
  })
})
