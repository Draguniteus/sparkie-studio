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
        emit('status', 'Starting E2B sandbox…')
        sbx = await Sandbox.create({ apiKey, timeoutMs: 5 * 60 * 1000 })
        emit('status', 'Sandbox ready. Writing project files…')

        // Write all files to /project directory
        const pkgFile = files.find(f => f.name === 'package.json' || f.name.endsWith('/package.json'))
        for (const file of files) {
          const filePath = `/project/${file.name}`
          // Create parent directories implicitly (E2B does this automatically)
          await sbx.files.write(filePath, file.content)
        }
        emit('status', `Wrote ${files.length} file(s). Installing packages…`)

        // npm install — blocking
        const installProc = await sbx.process.start({
          cmd: 'cd /project && npm install --prefer-offline 2>&1',
          onStdout: (data) => emit('stdout', data.line ?? String(data)),
          onStderr: (data) => emit('stderr', data.line ?? String(data)),
        })
        await installProc.wait()

        // Detect start command from package.json
        const startCmd = pkgFile ? resolveStartCmd(pkgFile.content) : 'npm start'
        emit('status', `Running: ${startCmd}`)

        // Start the server — non-blocking, stream first 20s of output
        const serverStarted = { value: false }
        const serverProc = await sbx.process.start({
          cmd: `cd /project && ${startCmd} 2>&1`,
          onStdout: (data) => {
            const line = data.line ?? String(data)
            emit('stdout', line)
            // Detect server-ready signals
            if (/listening|started|running|ready|server.*port|port.*\d{4}/i.test(line)) {
              serverStarted.value = true
            }
          },
          onStderr: (data) => emit('stderr', data.line ?? String(data)),
        })

        // Wait up to 25s for server to start, then close stream (server keeps running in bg)
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => resolve(), 25000)
          const check = setInterval(() => {
            if (serverStarted.value) { clearInterval(check); clearTimeout(timeout); resolve() }
          }, 500)
        })

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
        // Keep sandbox alive — don't kill (server is running)
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
