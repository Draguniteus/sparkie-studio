import { sessions } from '@/lib/terminalSessions'
import type { WsClient } from '@/lib/terminalSessions'

// Re-export so server.js (which uses require()) can access the sessions map
// and the WsClient type is available for type-checking
export { sessions }
export type { WsClient }
