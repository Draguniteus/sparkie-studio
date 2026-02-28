import { NextRequest, NextResponse } from 'next/server'
import { Sandbox } from '@e2b/code-interpreter'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

// Sandbox pool — survives across requests in same server process
const sandboxPool = new Map<string, Sandbox>()
const SANDBOX_TTL_MS = 10 * 60 * 1000  // 10 minutes

function sseEvent(type: string, data: string): string {
  return `data: ${JSON.stringify({ type, data })}\n\n`
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.E2B_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'E2B_API_KEY not set' }), { status: 500 })
  }

  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { code: string; language?: string; sessionId?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 })
  }

  const { code, language = 'python', sessionId } = body
  if (!code?.trim()) {
    return new Response(JSON.stringify({ error: 'No code provided' }), { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (type: string, data: string) => {
        try { controller.enqueue(encoder.encode(sseEvent(type, data))) } catch {}
      }

      let sbx: Sandbox | undefined

      try {
        // Reuse or create sandbox
        if (sessionId && sandboxPool.has(sessionId)) {
          sbx = sandboxPool.get(sessionId)!
          emit('status', 'Reusing sandbox\u2026')
        } else {
          emit('status', 'Starting E2B sandbox\u2026')
          sbx = await Sandbox.create({ apiKey, timeoutMs: SANDBOX_TTL_MS })
          if (sessionId) sandboxPool.set(sessionId, sbx)
          emit('status', 'Sandbox ready.')
        }

        // Execute code with streaming
        const execution = await sbx.runCode(code, {
          language: language as 'python' | 'javascript' | 'typescript' | 'r',
          onStdout: (chunk) => emit('stdout', chunk.line ?? String(chunk)),
          onStderr: (chunk) => emit('stderr', chunk.line ?? String(chunk)),
        })

        // Emit any rich results (charts, dataframes, etc.)
        for (const result of execution.results ?? []) {
          if (result.text) emit('result', result.text)
          if (result.png)  emit('image', result.png)  // base64 PNG
        }

        emit('done', 'Execution complete.')
      } catch (err) {
        emit('error', err instanceof Error ? err.message : String(err))
      } finally {
        // Kill sandbox if no session reuse
        if (!sessionId && sbx) {
          sbx.kill().catch(() => {})
        }
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}

// Cleanup stale sandboxes on module unload (best-effort)
export async function DELETE(req: NextRequest) {
  const { sessionId } = await req.json().catch(() => ({}))
  if (sessionId && sandboxPool.has(sessionId)) {
    const sbx = sandboxPool.get(sessionId)!
    sandboxPool.delete(sessionId)
    await sbx.kill().catch(() => {})
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ ok: false })
}
