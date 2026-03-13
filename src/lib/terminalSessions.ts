/**
 * terminalSessions.ts
 * Shared session store — imported by both the POST route handler
 * (api/terminal/route.ts) and the custom WS server (server.js).
 */

import type { Sandbox } from '@e2b/code-interpreter'

export type WsClient = {
  readyState: number
  send(data: string): void
}

export interface TerminalSession {
  sbx: Sandbox
  ptyPid: number | null
  clients: Set<WsClient>
  createdAt: number
  previewUrl: string | null
  previewSent: boolean
  /** Rolling log buffer — last 500 lines of PTY output for /api/logs polling */
  logBuffer: string[]
  /** True once the build command has exited (npx serve started = buildDone) */
  buildDone: boolean
}

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

export const encodeMessage: (type: string, data: string) => string =
  global.__terminalEncodeMessage

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
