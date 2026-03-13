/**
 * server.js — Custom Node HTTP server for Sparkie Studio
 *
 * Why this file exists:
 *   Next.js App Router Route Handlers cannot perform WebSocket upgrades.
 *   We wrap Next.js in a plain http.Server so we can intercept the WS
 *   upgrade request on /api/terminal-ws before Next.js ever sees it.
 *
 * Architecture: ATTACHED mode
 *   We create WebSocketServer({ server, path: '/api/terminal-ws' }).
 *   This integrates ws with Node's http.Server connection tracking so
 *   the DO App Platform nginx proxy keeps the socket alive through the
 *   full WS lifecycle. noServer+handleUpgrade causes the proxy to GC
 *   the raw socket after the 101 response on DO.
 *
 *   We still use server.prependListener('upgrade') to reject non-WS
 *   paths early (before ws or Next.js handle them).
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
      // (ws's own listener won't fire because path won't match)
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

    // Send connected frame synchronously — first thing after handshake.
    // This keeps the DO proxy from treating the socket as idle.
    try { ws.send(encodeMessage('connected', 'Shell ready')) } catch (_) {}
    console.log('[WS] connected frame sent')

    attachWsHandlers(ws, sess, sessionId)
  })

  server.listen(port, () => {
    console.log(`> Sparkie Studio ready on http://localhost:${port}`)
    console.log(`> WebSocket terminal on ws://localhost:${port}/api/terminal-ws`)
    startKeepalive(port)
  })
})
