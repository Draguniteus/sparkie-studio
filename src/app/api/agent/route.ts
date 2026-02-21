import { NextRequest } from 'next/server'

export const runtime = 'edge'

const OPENCODE_BASE = 'https://opencode.ai/zen/v1'

// ── System prompts ────────────────────────────────────────────────────────────

const EXPLORER_SYSTEM = `You are a fast creative explorer. When given a build request, respond with ONLY 4-6 concise bullet points covering:
- Best approach / architecture pattern for this type of project
- Key libraries or APIs to use (CDN links if web)
- Important UX / visual considerations
- Any common pitfalls to avoid

Be direct and specific. No code, no explanations — bullets only. Max 120 words total.`

const ARCHITECT_SYSTEM = `You are a senior software architect. Given a build request and exploration notes, write a brief implementation spec.

Output ONLY:
1. File list (e.g. index.html — single file with inline CSS+JS)
2. Core data structures or state (2-3 lines max)
3. Key functions/components to implement (3-5 items)
4. Rendering or update loop approach (1-2 lines)

No prose, no code blocks. Max 150 words. Be precise — this feeds directly into a code generator.`

const BUILDER_SYSTEM = `You are Sparkie, an expert AI coding agent inside Sparkie Studio. Build ANYTHING the user asks for.

## OUTPUT FORMAT
ALWAYS wrap every file in these exact markers — never output raw code outside them:
---FILE: filename.ext---
(file content)
---END FILE---

Keep text explanation BRIEF: 1-3 sentences max.

## UNIVERSAL PREVIEW — ALWAYS SHOW SOMETHING

### Static web (HTML/CSS/JS, games, animations, charts)
- Create index.html as entry point. Self-contained preferred (inline CSS/JS).
- For canvas/WebGL games, animations, particle systems — just index.html is fine.

### React / Vue / Svelte (frontend-only, no backend needed)
- Create index.html + App.jsx (or .tsx).
- Do NOT use import statements — Babel standalone provides React globally.
- Example: const App = () => <div className="p-4">Hello</div>

### Full-stack apps (Express, Fastify, Next.js, Vite, etc.)
1. package.json with correct scripts (REQUIRED)
2. The server/app files
3. Any frontend files (public/index.html etc.)
Server must listen on process.env.PORT || 3000

### FIX / MODIFY REQUESTS
- ALWAYS regenerate the COMPLETE file(s) with ---FILE:--- markers
- Include ALL original code plus the changes

## SELF-CONTAINED HTML (CRITICAL FOR PREVIEW)
For ALL web projects (charts, dashboards, games, animations):
- Load Chart.js, D3, Three.js, etc. via CDN <script> tags INSIDE index.html
- Inline ALL CSS in a <style> tag — do NOT reference external .css files
- Inline ALL JavaScript in a <script> tag — do NOT reference external .js files
- Exception: full-stack Express apps may use separate files (they run in a container)
- This ensures the live preview works correctly

## CSS RULES (CRITICAL)
- NEVER use @import inside a <style> tag — it breaks browser rendering
- For Google Fonts: use a <link> tag in <head> BEFORE the <style> tag
  Example: <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
- All @font-face declarations must be at the very top of the <style> block

## CHART.JS DATE ADAPTER (CRITICAL)
When using Chart.js with a time scale (type: 'time'):
- ALWAYS include the date adapter BEFORE your chart code:
  <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3/dist/chartjs-adapter-date-fns.bundle.min.js"></script>
- OR use type: 'linear' scale instead of type: 'time' (simpler, no adapter needed)
- NEVER use type: 'time' without the adapter — it throws "This method is not implemented"

## QUALITY STANDARDS
- Production-quality, visually impressive, fully functional
- Dark theme: #0a0a0a background, #FFC30B honey gold accents
- Interactive projects: make controls obvious
- Animations: smooth 60fps`

// ── Helpers ───────────────────────────────────────────────────────────────────

async function callOpenCodeStream(
  model: string,
  messages: { role: string; content: string }[],
  apiKey: string,
  signal?: AbortSignal
): Promise<ReadableStream> {
  const res = await fetch(`${OPENCODE_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'User-Agent': 'SparkieStudio/2.0',
    },
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.7, max_tokens: 16384 }),
    signal,
  })
  if (!res.ok) throw new Error(`OpenCode ${res.status}`)
  return res.body!
}

// Non-streaming call with hard timeout — returns text or null on failure/timeout
async function callOpenCodeBlocking(
  model: string,
  messages: { role: string; content: string }[],
  apiKey: string,
  timeoutMs: number
): Promise<string | null> {
  try {
    const res = await fetch(`${OPENCODE_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'SparkieStudio/2.0',
      },
      body: JSON.stringify({ model, messages, stream: false, temperature: 0.7, max_tokens: 512 }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.choices?.[0]?.message?.content?.trim() ?? null
  } catch {
    return null
  }
}

function sseEvent(event: string, data: object): string {
  return `data: ${JSON.stringify({ event, ...data })}\n\n`
}

const SSE_KEEPALIVE = ': keepalive\n\n'
const MAX_BODY_BYTES = 50 * 1024
const STREAM_TIMEOUT_MS = 85_000

function extractTitle(msg: string): string {
  return msg
    .replace(/^(build|create|make|write|generate|show me|can you|please)\s+/i, '')
    .split(/\s+/)
    .slice(0, 5)
    .join(' ')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim() || 'Project'
}

function hoistCssImports(html: string): string {
  return html.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_match, attrs, body) => {
    const imports: string[] = []
    const rest: string[] = []
    for (const line of body.split('\n')) {
      if (/^\s*@import\s/i.test(line)) {
        imports.push(line)
      } else {
        rest.push(line)
      }
    }
    if (imports.length === 0) return `<style${attrs}>${body}</style>`
    return `<style${attrs}>\n${imports.join('\n')}\n${rest.join('\n')}</style>`
  })
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const contentLength = req.headers.get('content-length')
  if (contentLength && parseInt(contentLength) > MAX_BODY_BYTES) {
    return new Response(JSON.stringify({ error: 'Payload too large' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let messages: { role: string; content: string }[]
  let currentFiles: string | undefined
  let preferredModel: string | undefined
  try {
    const body = await req.json()
    messages = body.messages
    currentFiles = body.currentFiles
    preferredModel = typeof body.model === 'string' ? body.model : undefined
    if (!Array.isArray(messages) || messages.length === 0) throw new Error('Invalid messages')
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const apiKey = process.env.OPENCODE_API_KEY
  const tavilyKey = process.env.TAVILY_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'OPENCODE_API_KEY not configured' }), { status: 500 })
  }

  const userMessage = messages[messages.length - 1]?.content ?? ''
  const projectTitle = extractTitle(userMessage)
  const encoder = new TextEncoder()

  // 3-stage pipeline runs on new builds only (no currentFiles)
  // Fix/modify requests skip straight to builder with selected model
  const isNewBuild = !currentFiles
  const USE_PIPELINE = isNewBuild

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: object) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)))
      }

      try {
        // ── OPTIONAL: Tavily web search ──────────────────────────────────
        let searchContext = ''
        const needsSearch = tavilyKey && /real.?time|live (price|data|feed|stock)|today.s|current (price|weather|news)/i.test(userMessage)
        if (needsSearch) {
          send('thinking', { step: 'search', text: '[>] Fetching live data...' })
          try {
            const sq = userMessage.slice(0, 200)
            const tRes = await fetch('https://api.tavily.com/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tavilyKey}` },
              body: JSON.stringify({ query: sq, max_results: 3, search_depth: 'basic' }),
              signal: AbortSignal.timeout(8000),
            })
            if (tRes.ok) {
              const td = await tRes.json()
              const results = td.results?.slice(0, 3) ?? []
              searchContext = results.map((r: { title: string; content: string; url: string }) =>
                `[${r.title}]\n${r.content}\n${r.url}`
              ).join('\n\n')
              send('thinking', { step: 'search_done', text: `[>] Got ${results.length} sources` })
            }
          } catch { /* non-fatal */ }
        }

        let explorationNotes = ''
        let architectureSpec = ''

        if (USE_PIPELINE) {
          // ── STAGE 1: Kimi K2.5 — Explore ────────────────────────────────
          send('thinking', { step: 'explore', text: '[🔍] Exploring with Kimi...' })
          const exploreMessages = [
            { role: 'system', content: EXPLORER_SYSTEM },
            ...(searchContext ? [
              { role: 'user' as const, content: `Research context:\n${searchContext}` },
              { role: 'assistant' as const, content: 'Got it.' },
            ] : []),
            { role: 'user', content: userMessage },
          ]
          const exploration = await callOpenCodeBlocking('kimi-k2.5-free', exploreMessages, apiKey, 18000)
          if (exploration) {
            explorationNotes = exploration
            send('thinking', { step: 'explore_done', text: `[🔍] Exploration done` })
          } else {
            send('thinking', { step: 'explore_skip', text: '[🔍] Kimi timed out — skipping explore' })
          }

          // ── STAGE 2: GLM-5 — Architect ───────────────────────────────────
          send('thinking', { step: 'architect', text: '[🏗️] Architecting with GLM-5...' })
          const architectMessages = [
            { role: 'system', content: ARCHITECT_SYSTEM },
            { role: 'user', content: `Build request: ${userMessage}${explorationNotes ? `\n\nExploration notes:\n${explorationNotes}` : ''}` },
          ]
          const architecture = await callOpenCodeBlocking('glm-5-free', architectMessages, apiKey, 20000)
          if (architecture) {
            architectureSpec = architecture
            send('thinking', { step: 'architect_done', text: `[🏗️] Architecture spec ready` })
          } else {
            send('thinking', { step: 'architect_skip', text: '[🏗️] GLM-5 timed out — skipping architect' })
          }
        }

        // ── STAGE 3: MiniMax M2.5 — Build (streaming) ────────────────────
        send('thinking', { step: 'build', text: `[⚡] Building ${projectTitle} with M2.5...` })

        const chatHistory = currentFiles ? messages.slice(0, -1) : []

        // Inject pipeline context into builder if available
        const pipelineContext = [
          explorationNotes ? `## Exploration Notes (from Kimi K2.5)\n${explorationNotes}` : '',
          architectureSpec ? `## Architecture Spec (from GLM-5)\n${architectureSpec}` : '',
        ].filter(Boolean).join('\n\n')

        const builderMessages = [
          { role: 'system', content: BUILDER_SYSTEM },
          ...chatHistory,
          ...(searchContext ? [
            { role: 'user' as const, content: `Web research context:\n${searchContext}` },
            { role: 'assistant' as const, content: 'Got it, I will use this context.' },
          ] : []),
          ...(pipelineContext ? [
            { role: 'user' as const, content: `Pre-build analysis:\n${pipelineContext}` },
            { role: 'assistant' as const, content: 'Understood. I will use this to guide the implementation.' },
          ] : []),
          ...(currentFiles ? [
            { role: 'user' as const, content: `Current workspace files:\n${currentFiles}` },
            { role: 'assistant' as const, content: 'Understood. I will update these files.' },
          ] : []),
          { role: 'user', content: userMessage },
        ]

        // Builder: M2.5 first for new builds, user-selected first for fix requests, fallbacks for both
        const BUILDER_PRIMARY = USE_PIPELINE ? 'minimax-m2.5-free' : (preferredModel ?? 'minimax-m2.5-free')
        const FALLBACK_MODELS = ['minimax-m2.5-free', 'glm-5-free', 'kimi-k2.5-free', 'minimax-m2.1-free', 'big-pickle']
        const BUILDER_MODELS = [BUILDER_PRIMARY, ...FALLBACK_MODELS.filter(m => m !== BUILDER_PRIMARY)]

        let buildOutput = ''

        for (let idx = 0; idx < BUILDER_MODELS.length; idx++) {
          const model = BUILDER_MODELS[idx]
          if (idx > 0) {
            send('thinking', { step: 'build_retry', text: `[~] Retrying with ${model}...` })
          }

          const abortCtrl = new AbortController()
          const timer = setTimeout(() => abortCtrl.abort(), STREAM_TIMEOUT_MS)
          let modelOutput = ''

          try {
            const buildStream = await callOpenCodeStream(model, builderMessages, apiKey, abortCtrl.signal)
            const reader = buildStream.getReader()
            const decoder = new TextDecoder()

            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              const chunk = decoder.decode(value, { stream: true })
              let hadContent = false
              for (const line of chunk.split('\n')) {
                if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
                try {
                  const parsed = JSON.parse(line.slice(6))
                  const delta = parsed.choices?.[0]?.delta?.content
                  if (delta) {
                    modelOutput += delta
                    buildOutput += delta
                    hadContent = true
                    send('delta', { content: delta })
                  }
                } catch { /* skip malformed SSE */ }
              }
              if (!hadContent) {
                controller.enqueue(encoder.encode(SSE_KEEPALIVE))
              }
            }

            clearTimeout(timer)
          } catch (err: unknown) {
            clearTimeout(timer)
            if (err instanceof Error && err.name === 'AbortError') {
              send('thinking', { step: 'build_timeout', text: `[t] ${model} timed out — trying next...` })
              continue
            }
            send('error', { message: 'Stream error — please try again' })
            return
          }

          if (modelOutput.trim().length > 0) break

          if (idx < BUILDER_MODELS.length - 1) {
            send('thinking', { step: 'build_empty', text: `[!] ${model} returned nothing — trying next...` })
          }
        }

        if (buildOutput.trim().length === 0) {
          send('error', { message: 'All models are busy — please try again in a moment' })
          return
        }

        buildOutput = hoistCssImports(buildOutput)
        send('thinking', { step: 'done', text: '[ok] Build complete — preview ready' })
        send('done', { buildOutput })

      } catch (err) {
        send('error', { message: err instanceof Error ? err.message : 'Agent error' })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}
