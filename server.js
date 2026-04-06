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
  // NOTE: sess.clients.add(ws) is intentionally NOT called here.
  // The caller adds ws to sess.clients only AFTER the connected frame
  // is sent and the event loop has cycled — preventing the PTY onData
  // burst from hitting a brand-new socket (the root cause of 1006).

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
    if (msg.type === 'input' && typeof msg.data === 'string') {
      if (sess.ptyPid === null) {
        // PTY not yet started — call 'start' action to create PTY and run the command.
        // The WS is now stable (we're in onmessage) so the PTY onData will find
        // sess.clients already populated — zero burst-on-connect risk.
        console.log('[WS] PTY not started — calling /api/terminal start, cmd:', msg.data.slice(0, 60))
        const body = JSON.stringify({ action: 'start', sessionId, cmd: msg.data })
        const startReq = http.request(
          { host: 'localhost', port, path: '/api/terminal', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
                       // Internal call — bypass auth by adding a server-only header
                       'x-internal-call': 'terminal-start' } },
          (res) => {
            let data = ''
            res.on('data', d => { data += d })
            res.on('end', () => {
              console.log('[WS] start response:', res.statusCode, data.slice(0, 100))
            })
          }
        )
        startReq.on('error', e => console.error('[WS] start request error:', e.message))
        startReq.write(body)
        startReq.end()
      } else {
        sess.sbx.pty.sendInput(sess.ptyPid, Buffer.from(msg.data, 'utf-8')).catch((e) => {
          console.error('[WS] pty.sendInput error:', e)
        })
      }
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
    if (req.url?.startsWith('/api/')) {
      console.log(`[req] ${new Date().toISOString()} ${req.method} ${req.url}`)
    }
    handle(req, res, parse(req.url, true))
  })

  // ATTACHED mode: ws integrates with http.Server connection tracking.
  // Two WebSocket servers: /api/terminal-ws (terminal) + /api/proactive-ws (proactive push)
  const wssTerminal = new WebSocketServer({ server, path: '/api/terminal-ws' })
  const wssProactive = new WebSocketServer({ server, path: '/api/proactive-ws' })

  // Global registry for proactive WebSocket clients — shared with Next.js API routes
  // via global.__proactiveClients. API routes push events to this Set.
  // eslint-disable-next-line no-var
  var __proactiveClients = global.__proactiveClients || []
  if (!global.__proactiveClients) global.__proactiveClients = __proactiveClients

  function proactiveClientsAdd(ws, userId) {
    __proactiveClients.push({ ws, userId })
    global.__proactiveClients = __proactiveClients
    console.log('[proactive] client connected: userId=' + userId + ', total=' + __proactiveClients.length)
  }

  function proactiveClientsRemove(ws) {
    const idx = __proactiveClients.findIndex(function(c) { return c.ws === ws })
    if (idx !== -1) __proactiveClients.splice(idx, 1)
    // Don't reassign __proactiveClients — mutate in place so API route references stay valid
    console.log('[proactive] client disconnected, total=' + __proactiveClients.length)
  }

  // prependListener ensures we can reject non-WS paths BEFORE
  // ws or Next.js get a chance to handle them.
  server.prependListener('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url, true)

    if (pathname !== '/api/terminal-ws' && !pathname.startsWith('/api/proactive-ws')) {
      // Not our path — destroy and let no other handler run
      socket.destroy()
      return
    }
    // Fall through — the appropriate ws attached listener handles it
  })

  // ws connection event fires after the 101 handshake is complete.
  wssTerminal.on('connection', (ws, req) => {
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

    // ── Attach handlers FIRST, then send connected ──────────────────────
    attachWsHandlers(ws, sess, sessionId)
    console.log('[WS] handlers attached, client added to sess.clients')

    // Send RFC 6455 protocol-level ping — keeps DO proxy aware this is WS.
    try { ws.ping() } catch (_) {}
    console.log('[WS] protocol ping sent')

    // Send connected frame.
    try { ws.send(encodeMessage('connected', 'Shell ready')) } catch (_) {}
    console.log('[WS] connected frame sent')

    // ── BURST FIX: add client to sess.clients AFTER connected frame ──────
    // The PTY onData is already streaming (npm install running). If we add
    // ws to sess.clients before the connected frame, the PTY burst hits the
    // infant socket and DO nginx drops it with 1006.
    // Delay: 100ms lets the connected frame flush and the socket settle.
    setTimeout(() => {
      if (ws.readyState !== ws.OPEN) return  // socket died already — skip
      sess.clients.add(ws)
      console.log('[WS] client added to sess.clients after 100ms delay — PTY burst window closed')
    }, 100)

    // ── Auto-start PTY if cmd was pre-loaded via create action ──────────
    // DO's nginx proxy swallows client→server WS frames on first connect,
    // so we can't rely on {type:'input'} from the client to start the PTY.
    // Instead: cmd is passed in the create POST, PTY is started there.
    // If PTY is somehow not started yet (e.g. cmd was empty), the client
    // can still send input manually — the message handler handles it.
    if (sess.ptyPid === null) {
      console.log('[WS] ptyPid null after connected — PTY may have been started by create action, checking...')
      // Brief check: if PTY was just started by create, ptyPid will be set within ms
      // No action needed here — PTY output will flow to sess.clients once it starts
    } else {
      console.log('[WS] ptyPid already set:', sess.ptyPid, '— PTY running, output will stream')
    }

    console.log('[WS] post-send readyState:', ws.readyState,
      '| socket.writable:', sock ? sock.writable : 'N/A')
  })

  // ── Proactive push WebSocket (/api/proactive-ws) ─────────────────────────────
  wssProactive.on('connection', async (ws, req) => {
    // DO proxy strips query strings on WebSocket upgrade — userId is now path-based: /api/proactive-ws/<userId>
    const { pathname } = parse(req.url, true)
    const pathParts = pathname.split('/').filter(Boolean) // ['api', 'proactive-ws', '<userId>']
    const userId = pathParts[2] ? String(pathParts[2]) : undefined
    console.log('[proactive-ws] connection userId:', userId, 'path:', pathname)

    if (!userId) {
      ws.close(1008, 'Missing userId')
      return
    }

    proactiveClientsAdd(ws, userId)

    // Send ack
    try { ws.send(JSON.stringify({ type: 'connected', data: 'Proactive stream ready' })) } catch (_) {}

    // Heartbeat: ping every 30s to keep DO proxy connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === /* OPEN */ 1) {
        try { ws.ping() } catch (_) {}
      } else {
        clearInterval(pingInterval)
      }
    }, 30_000)

    ws.on('close', () => { proactiveClientsRemove(ws); clearInterval(pingInterval) })
    ws.on('error', () => { proactiveClientsRemove(ws); clearInterval(pingInterval) })
  })

  server.listen(port, () => {
    console.log(`\n🔥 SPARKIE STUDIO RUNTIME — ${new Date().toISOString()}`)
    console.log(`> Sparkie Studio ready on http://localhost:${port}`)
    console.log(`> WebSocket terminal on ws://localhost:${port}/api/terminal-ws`)
    console.log(`> WebSocket proactive push on ws://localhost:${port}/api/proactive-ws`)
    startKeepalive(port)
  })
})
