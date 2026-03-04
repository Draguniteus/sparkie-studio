import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/tasks/stream — SSE endpoint that pushes task list updates in real time
// Polls DB every 3s and pushes whenever tasks change (by comparing a hash of statuses)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) {
    return new Response('Unauthorized', { status: 401 })
  }

  const encoder = new TextEncoder()
  let lastHash = ''
  let closed = false

  // Abort on client disconnect
  req.signal.addEventListener('abort', () => { closed = true })

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial heartbeat
      controller.enqueue(encoder.encode(': heartbeat\n\n'))

      const push = async () => {
        if (closed) return
        try {
          const res = await query(
            `SELECT id, label, action, status, executor, trigger_type, scheduled_at, created_at, resolved_at, payload, why_human
             FROM sparkie_tasks WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'
             ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, created_at DESC
             LIMIT 30`,
            [userId]
          )
          const tasks = res.rows
          // Simple hash: join id:status pairs
          const hash = tasks.map(t => `${t.id}:${t.status}`).join(',')
          if (hash !== lastHash) {
            lastHash = hash
            const payload = JSON.stringify({ tasks })
            controller.enqueue(encoder.encode(`event: tasks\ndata: ${payload}\n\n`))
          } else {
            // Send keep-alive comment
            controller.enqueue(encoder.encode(': ping\n\n'))
          }
        } catch {
          // DB error — send keep-alive and continue
          controller.enqueue(encoder.encode(': error\n\n'))
        }
      }

      // Initial push immediately
      await push()

      // Poll every 3s
      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval)
          try { controller.close() } catch { /* already closed */ }
          return
        }
        await push()
      }, 3000)

      // Auto-close after 5 minutes (client should reconnect)
      setTimeout(() => {
        closed = true
        clearInterval(interval)
        try {
          controller.enqueue(encoder.encode('event: reconnect\ndata: {}\n\n'))
          controller.close()
        } catch { /* already closed */ }
      }, 5 * 60 * 1000)
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
