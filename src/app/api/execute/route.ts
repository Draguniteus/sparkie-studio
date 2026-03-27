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

// ── Phase 6: Workbench Helper Preamble ──────────────────────────────────────
// Pre-loaded into every E2B session. Gives Sparkie the same ergonomics as SureThing:
// run_composio_tool(slug, args), invoke_llm(query), upload_file(path)
function buildWorkbenchPreamble(composioApiKey: string, minimaxApiKey: string, entityId: string): string {
  const base = 'https://backend.composio.dev/api/v3'
  const lines = [
    'import json, urllib.request, urllib.parse, urllib.error',
    '',
    '# ── Sparkie Workbench Helpers ─────────────────────────────────────────────',
    '# Pre-loaded in every session. Use these instead of raw API calls.',
    '',
    'COMPOSIO_KEY = ' + JSON.stringify(composioApiKey),
    'COMPOSIO_BASE = ' + JSON.stringify(base),
    'MINIMAX_KEY = ' + JSON.stringify(minimaxApiKey),
    'ENTITY_ID = ' + JSON.stringify(entityId),
    '',
    'def run_composio_tool(tool_slug, arguments):',
    '    """Execute any Composio tool by slug. Returns parsed response dict."""',
    '    payload = json.dumps({',
    '        "actionName": tool_slug,',
    '        "input": arguments,',
    '        "entityId": ENTITY_ID',
    '    }).encode("utf-8")',
    '    req = urllib.request.Request(',
    '        COMPOSIO_BASE + "/actions/execute",',
    '        data=payload,',
    '        headers={"Content-Type": "application/json", "x-api-key": COMPOSIO_KEY},',
    '        method="POST"',
    '    )',
    '    try:',
    '        with urllib.request.urlopen(req, timeout=30) as r:',
    '            return json.loads(r.read().decode("utf-8"))',
    '    except urllib.error.HTTPError as e:',
    '        return {"error": str(e), "body": e.read().decode("utf-8", errors="replace")}',
    '    except Exception as e:',
    '        return {"error": str(e)}',
    '',
    'def invoke_llm(query, model="MiniMax-M2.7"):',
    '    """Call MiniMax M2.7 for reasoning and analysis. Returns response text."""',
    '    payload = json.dumps({',
    '        "model": model,',
    '        "max_tokens": 1024,',
    '        "messages": [{"role": "user", "content": query}]',
    '    }).encode("utf-8")',
    '    req = urllib.request.Request(',
    '        "https://api.minimax.io/anthropic/v1/messages",',
    '        data=payload,',
    '        headers={"x-api-key": MINIMAX_KEY, "Content-Type": "application/json", "anthropic-version": "2023-06-01"},',
    '        method="POST"',
    '    )',
    '    try:',
    '        with urllib.request.urlopen(req, timeout=30) as r:',
    '            resp = json.loads(r.read().decode("utf-8"))',
    '            content = resp.get("content", [])',
    '            if isinstance(content, list) and len(content) > 0:',
    '                return content[0].get("text", str(resp))',
    '            return str(resp)',
    '    except Exception as e:',
    '        return f"LLM error: {e}"',
    '',
    'def upload_file(path):',
    '    """Upload a local file to Sparkie CDN. Returns public URL."""',
    '    import os',
    '    if not os.path.exists(path):',
    '        return f"File not found: {path}"',
    '    with open(path, "rb") as f:',
    '        file_bytes = f.read()',
    '    filename = os.path.basename(path)',
    '    # Use multipart/form-data upload',
    '    boundary = "SparkieUploadBoundary12345"',
    '    body = (',
    '        f"--{boundary}\\r\\n"',
    '        f\'Content-Disposition: form-data; name="file"; filename="{filename}"\\r\\n\'',
    '        f"Content-Type: application/octet-stream\\r\\n\\r\\n"',
    '    ).encode("utf-8") + file_bytes + f"\\r\\n--{boundary}--\\r\\n".encode("utf-8")',
    '    req = urllib.request.Request(',
    '        COMPOSIO_BASE + "/files/upload",',
    '        data=body,',
    '        headers={',
    '            "Content-Type": f"multipart/form-data; boundary={boundary}",',
    '            "x-api-key": COMPOSIO_KEY',
    '        },',
    '        method="POST"',
    '    )',
    '    try:',
    '        with urllib.request.urlopen(req, timeout=60) as r:',
    '            result = json.loads(r.read().decode("utf-8"))',
    '            return result.get("url") or result.get("s3url") or str(result)',
    '    except Exception as e:',
    '        return f"Upload error: {e}"',
    '',
    'print("✓ Sparkie workbench helpers loaded: run_composio_tool, invoke_llm, upload_file")',
  ]
  return lines.join('\n')
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

  let body: { code: string; language?: string; sessionId?: string; injectHelpers?: boolean }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 })
  }

  const { code, language = 'python', sessionId, injectHelpers = true } = body
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
      let isNewSession = false

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
          isNewSession = true
        }

        // Phase 6: Inject workbench helpers into new Python sessions
        if (isNewSession && language === 'python' && injectHelpers) {
          const composioApiKey = process.env.COMPOSIO_API_KEY ?? ''
          const userId = (session.user as { id?: string }).id ?? 'unknown'
          const entityId = `sparkie_user_${userId}`

          if (composioApiKey) {
            const minimaxApiKey = process.env.MINIMAX_API_KEY ?? ''
            const preamble = buildWorkbenchPreamble(composioApiKey, minimaxApiKey, entityId)
            await sbx.runCode(preamble, {
              language: 'python',
              onStdout: (chunk) => emit('status', chunk.line ?? String(chunk)),
              onStderr: () => {},
            })
          }
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
