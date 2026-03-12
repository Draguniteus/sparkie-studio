/**
 * terminalSessions.ts
 * Shared session store — imported by both the POST route handler
 * (api/terminal/route.ts) and the custom WS server (server.js).
 *
 * NOTE: We intentionally avoid importing from 'ws' here.
 * The ws package is a CommonJS dependency used only in server.js (runtime).
 * Importing ws types in TypeScript causes tsc to try to resolve ws's
 * type declarations, which can fail in the Next.js build context.
 * We use `unknown` + a runtime duck-type cast instead.
 */

import type { Sandbox } from '@e2b/code-interpreter'

// Intentionally typed as unknown — at runtime this will be a ws.WebSocket instance.
// server.js (CommonJS) adds/removes clients directly; route.ts casts appropriately.
export type WsClient = {
  readyState: number
  send(data: string): void
}

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

// Reap sessions older than 30 minutes (only register once)
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
