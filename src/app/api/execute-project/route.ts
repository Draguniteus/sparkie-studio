import { NextRequest } from 'next/server'
import { Sandbox } from '@e2b/code-interpreter'

export const runtime = 'nodejs'
export const maxDuration = 120

function sseEvent(type: string, data: string): string {
  return `data: ${JSON.stringify({ type, data })}\n\n`
}

// Detect the start command from package.json content
function resolveStartCmd(pkgJson: string): string {
  try {
    const pkg = JSON.parse(pkgJson)
    if (pkg.scripts?.dev)   return 'npm run dev'
    if (pkg.scripts?.start) return 'npm start'
    if (pkg.scripts?.serve) return 'npm run serve'
    if (pkg.main)           return `node ${pkg.main}`
  } catch {}
  return 'npm start'
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.E2B_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'E2B_API_KEY not set' }), { status: 500 })
  }

  let files: { name: string; content: string }[]
  try {
    const body = await req.json()
    files = body.files ?? []
    if (!files.length) throw new Error('No files provided')
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (type: string, data: string) => {
        try { controller.enqueue(encoder.encode(sseEvent(type, data))) } catch {}
      }

      let sbx: Sandbox | undefined

      try {
        emit('status', 'Starting E2B sandbox\u2026')
        sbx = await Sandbox.create({ apiKey, timeoutMs: 5 * 60 * 1000 })
        emit('status', 'Sandbox ready. Writing project files\u2026')

        // Write all files to /project directory
        const pkgFile = files.find(f => f.name === 'package.json' || f.name.endsWith('/package.json'))
        for (const file of files) {
          const filePath = `/project/${file.name}`
          await sbx.files.write(filePath, file.content)
        }
        emit('status', `Wrote ${files.length} file(s). Installing packages\u2026`)

        // npm install — blocking (wait for exit)
        await sbx.commands.run('cd /project && npm install --prefer-offline 2>&1', {
          onStdout: (data) => emit('stdout', data),
          onStderr: (data) => emit('stderr', data),
        })

        // Detect start command from package.json
        const startCmd = pkgFile ? resolveStartCmd(pkgFile.content) : 'npm start'
        emit('status', `Running: ${startCmd}`)

        // Start the server — background (non-blocking), stream first 25s of output
        const serverStarted = { value: false }
        const serverHandle = await sbx.commands.run(`cd /project && ${startCmd} 2>&1`, {
          background: true,
          onStdout: (data) => {
            emit('stdout', data)
            // Detect server-ready signals
            if (/listening|started|running|ready|server.*port|port.*\d{4}/i.test(data)) {
              serverStarted.value = true
            }
          },
          onStderr: (data) => emit('stderr', data),
        })

        // Wait up to 25s for server to start, then close stream (server keeps running in bg)
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => resolve(), 25000)
          const check = setInterval(() => {
            if (serverStarted.value) { clearInterval(check); clearTimeout(timeout); resolve() }
          }, 500)
        })

        // Disconnect from the handle — server keeps running, we just stop watching
        await serverHandle.disconnect().catch(() => {})

        if (serverStarted.value) {
          emit('status', 'Server started. Check port 3000 for the live endpoint.')
        } else {
          emit('status', 'Server running (no port signal detected). Check terminal output.')
        }
        emit('done', 'Backend project running in E2B sandbox.')
      } catch (err) {
        emit('error', err instanceof Error ? err.message : String(err))
      } finally {
        controller.close()
        // Keep sandbox alive — server is still running in background
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
