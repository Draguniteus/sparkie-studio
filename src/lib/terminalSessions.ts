/**
 * terminalSessions.ts
 * Shared session store — imported by both the POST route handler
 * (api/terminal/route.ts) and the custom WS server (server.js).
 *
 * IMPORTANT: We use a global variable as the backing store so that both
 * server.js (the custom HTTP/WS server) and the Next.js route handler
 * (compiled into .next/server) operate on the exact same Map, even though
 * they are loaded as separate modules in the same Node.js process.
 */

import type { Sandbox } from '@e2b/code-interpreter'
import type { WebSocket as WsClient } from 'ws'

export type { WsClient }

export interface TerminalSession {
  sbx: Sandbox
  ptyPid: number | null
  clients: Set<WsClient>
  createdAt: number
}

// Shared via global so server.js and route.ts use the same Map instance.
declare global {
  // eslint-disable-next-line no-var
  var __terminalSessions: Map<string, TerminalSession> | undefined
  // eslint-disable-next-line no-var
  var __terminalEncodeMessage: ((type: string, data: string) => string) | undefined
}

if (!global.__terminalSessions) {
  global.__terminalSessions = new Map<string, TerminalSession>()
}
if (!global.__terminalEncodeMessage) {
  global.__terminalEncodeMessage = (type: string, data: string) =>
    JSON.stringify({ type, data })
}

export const sessions: Map<string, TerminalSession> = global.__terminalSessions

/** Encode a typed message for the wire protocol (JSON string). */
export const encodeMessage: (type: string, data: string) => string =
  global.__terminalEncodeMessage

// Reap sessions older than 30 minutes (only register the interval once)
if (!(global as Record<string, unknown>).__terminalReaperStarted) {
  (global as Record<string, unknown>).__terminalReaperStarted = true
  setInterval(() => {
    const cutoff = Date.now() - 30 * 60 * 1000
    for (const [id, sess] of sessions.entries()) {
      if (sess.createdAt < cutoff) {
        sess.sbx.kill().catch(() => {})
        sessions.delete(id)
      }
    }
  }, 5 * 60 * 1000)
}
