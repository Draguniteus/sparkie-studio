export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type ProactiveClient = { ws: WebSocket | null; userId: string; sseSend?: (data: string) => void }

export async function GET(req: Request) {
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId) return new Response('Missing userId', { status: 400 })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      const client = {
        userId,
        sseSend: (data: string) => {
          try {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
          } catch {
            // Client disconnected
          }
        },
      }

      // Register in global clients (SSE clients have ws: null)
      const clients: ProactiveClient[] = ((global.__proactiveClients as unknown) as ProactiveClient[]) ?? []
      clients.push({ ws: null, userId, sseSend: client.sseSend })
      global.__proactiveClients = clients as unknown as typeof global.__proactiveClients

      // Heartbeat every 30s to keep connection alive through DO proxy
      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          clearInterval(interval)
        }
      }, 30_000)

      // Cleanup on close
      req.signal.addEventListener('abort', () => {
        clearInterval(interval)
        const idx = clients.findIndex(c => c.sseSend === client.sseSend)
        if (idx !== -1) clients.splice(idx, 1)
        try { controller.close() } catch {}
      })

      // Send initial ack
      client.sseSend(JSON.stringify({ type: 'connected', data: 'Proactive SSE stream ready' }))
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
