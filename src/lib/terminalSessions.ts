/**
 * terminalSessions.ts
 * Shared session store — imported by both the POST route handler
 * (api/terminal/route.ts) and the custom WS server (server.js).
 *
 * Keeping sessions in a dedicated module avoids duplication and ensures
 * both code paths operate on the same in-process Map.
 */

import type { Sandbox } from '@e2b/code-interpreter'

export type WsClient = import('ws').WebSocket

export interface TerminalSession {
  sbx: Sandbox
  ptyPid: number | null
  clients: Set<WsClient>
  createdAt: number
}

export const sessions = new Map<string, TerminalSession>()

/** Encode a typed message for the wire protocol (JSON string). */
export function encodeMessage(type: string, data: string): string {
  return JSON.stringify({ type, data })
}

// Reap sessions older than 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000
  for (const [id, sess] of sessions.entries()) {
    if (sess.createdAt < cutoff) {
      sess.sbx.kill().catch(() => {})
      sessions.delete(id)
    }
  }
}, 5 * 60 * 1000)
