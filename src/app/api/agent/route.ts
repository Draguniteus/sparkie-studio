import { NextRequest } from 'next/server'

export const runtime = 'edge'

const OPENCODE_BASE = 'https://opencode.ai/zen/v1'

const PLANNER_SYSTEM = `You are Sparkie's Planner. Your job: analyze the user's request and produce a concise build plan.

Respond with ONLY this JSON (no markdown, no explanation):
{
  "title": "short project title",
  "files": ["list", "of", "files", "to", "create"],
  "approach": "1-2 sentence technical approach",
  "needsWebSearch": false,
  "searchQuery": ""
}

Set needsWebSearch to true ONLY if the task requires current/live data (real-time prices, news, today's weather, etc.). Do NOT set it for using well-known libraries like Chart.js, React, Three.js — those are already in training data.
Keep approach concise — this feeds directly into the builder.`

const REVIEWER_SYSTEM = `You are Sparkie's Code Reviewer. Review the code output for critical bugs only.

If you find issues, respond with:
ISSUES_FOUND
- Brief description of each bug (one line each)
Then output the complete fixed file(s) with ---FILE: filename--- markers.

If code looks correct, respond with exactly:
LGTM
(nothing else)`

const BUILDER_SYSTEM = `You are Sparkie, an expert AI coding agent inside Sparkie Studio. You can build ANYTHING.

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

// Timeout for non-streaming (planner) calls — 20s is generous; if GLM-5 hangs, degrade gracefully
const PLANNER_TIMEOUT_MS = 20_000

async function callOpenCode(model: string, messages: {role: string, content: string}[], apiKey: string): Promise<string> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), PLANNER_TIMEOUT_MS)
  try {
    const res = await fetch(`${OPENCODE_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'SparkieStudio/2.0',
      },
      body: JSON.stringify({ model, messages, stream: false, temperature: 0.7, max_tokens: 8192 }),
      signal: abort.signal,
    })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`OpenCode ${res.status}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ''
  } catch (err: unknown) {
    clearTimeout(timer)
    if (err instanceof Error && err.name === 'AbortError') throw new Error('Planner timed out')
    throw err
  }
}

async function callOpenCodeStream(model: string, messages: {role: string, content: string}[], apiKey: string, signal?: AbortSignal): Promise<ReadableStream> {
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

function sseEvent(event: string, data: object): string {
  return `data: ${JSON.stringify({ event, ...data })}\n\n`
}

// SSE keepalive comment — keeps connection alive through proxies without affecting client parser
const SSE_KEEPALIVE = ': keepalive\n\n'

// Max request body 50KB — prevents edge OOM on malicious payloads
const MAX_BODY_BYTES = 50 * 1024
// Streaming timeout 60s — edge functions must not hang indefinitely
const STREAM_TIMEOUT_MS = 60_000

export async function POST(req: NextRequest) {
  // ── Body size guard ────────────────────────────────────────────────
  const contentLength = req.headers.get('content-length')
  if (contentLength && parseInt(contentLength) > MAX_BODY_BYTES) {
    return new Response(JSON.stringify({ error: 'Payload too large' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let messages: {role: string; content: string}[]
  let currentFiles: string | undefined
  try {
    const body = await req.json()
    messages = body.messages
    currentFiles = body.currentFiles
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

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: object) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)))
      }

      try {
        // ── STEP 1: PLANNER ──────────────────────────────────────────────
        send('thinking', { step: 'plan', text: '[~] Planning structure...' })

        const plannerMessages = [
          { role: 'system', content: PLANNER_SYSTEM },
          { role: 'user', content: userMessage }
        ]

        // Planner has a 20s timeout — send keepalives so proxy doesn't drop the connection
        let planRaw: string
        const planKeepaliveInterval = setInterval(() => {
          controller.enqueue(encoder.encode(SSE_KEEPALIVE))
        }, 3000)
        try {
          planRaw = await callOpenCode('glm-5-free', plannerMessages, apiKey)
          clearInterval(planKeepaliveInterval)
        } catch (planErr: unknown) {
          clearInterval(planKeepaliveInterval)
          const isTimeout = planErr instanceof Error && planErr.message.includes('timed out')
          send('thinking', { step: 'plan_done', text: isTimeout ? '[~] Planner timed out — building directly' : '[~] Planner unavailable — building directly' })
          // Stub plan: build with just the user message and no search
          planRaw = JSON.stringify({ title: 'App', files: [], searchQuery: null, context: '' })
        }

        let plan: { title: string; files: string[]; approach: string; needsWebSearch: boolean; searchQuery: string }
        try {
          const jsonMatch = planRaw.match(/\{[\s\S]*\}/)
          plan = JSON.parse(jsonMatch?.[0] ?? planRaw)
        } catch {
          plan = { title: 'Project', files: [], approach: userMessage, needsWebSearch: false, searchQuery: '' }
        }

        send('thinking', { step: 'plan_done', text: `[~] Plan ready — ${plan.files.length > 0 ? plan.files.join(', ') : 'analyzing request'}` })

        // ── STEP 2: WEB SEARCH (if needed) ───────────────────────────────
        let searchContext = ''
        if (plan.needsWebSearch && tavilyKey && plan.searchQuery) {
          send('thinking', { step: 'search', text: `[>] Searching: ${plan.searchQuery}` })
          try {
            const tavilyRes = await fetch('https://api.tavily.com/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tavilyKey}` },
              body: JSON.stringify({ query: plan.searchQuery, max_results: 3, search_depth: 'basic' }),
            })
            if (tavilyRes.ok) {
              const tavilyData = await tavilyRes.json()
              const results = tavilyData.results?.slice(0, 3) ?? []
              searchContext = results.map((r: {title: string; content: string; url: string}) =>
                `[${r.title}]\n${r.content}\n${r.url}`
              ).join('\n\n')
              send('thinking', { step: 'search_done', text: `[>] Found ${results.length} sources` })
            }
          } catch {
            send('thinking', { step: 'search_skip', text: '[>] Search unavailable — building from knowledge' })
          }
        }

        // ── STEP 3: BUILDER (streaming) ───────────────────────────────────
        send('thinking', { step: 'build', text: `[+] Building ${plan.title}...` })

        const builderContext = [
          plan.approach ? `Approach: ${plan.approach}` : '',
          plan.files.length > 0 ? `Files to create: ${plan.files.join(', ')}` : '',
          searchContext ? `\nWeb research:\n${searchContext}` : '',
          currentFiles ? `\nCurrent workspace (update these, don't rewrite from scratch if fixing):\n${currentFiles}` : '',
        ].filter(Boolean).join('\n')

        // For fix requests (currentFiles present), include chat history for context
        // For new builds, only use last message + build plan (reduces tokens + latency)
        const chatHistory = currentFiles ? messages.slice(0, -1) : []
        const builderMessages = [
          { role: 'system', content: BUILDER_SYSTEM },
          ...chatHistory,
          ...(builderContext ? [{
            role: 'user' as const,
            content: `[BUILD PLAN]\n${builderContext}`
          }, {
            role: 'assistant' as const,
            content: 'Understood. Building now.'
          }] : []),
          { role: 'user', content: userMessage }
        ]

        // Builder model fallback chain — if primary model returns empty output, try next
        const BUILDER_MODELS = ['glm-5-free', 'minimax-m2.5-free', 'big-pickle']
        let buildOutput = ''

        for (let modelIdx = 0; modelIdx < BUILDER_MODELS.length; modelIdx++) {
          const builderModel = BUILDER_MODELS[modelIdx]
          if (modelIdx > 0) {
            send('thinking', { step: 'build_retry', text: `[~] Retrying with ${builderModel}...` })
          }

          const streamAbort = new AbortController()
          const streamTimer = setTimeout(() => streamAbort.abort(), STREAM_TIMEOUT_MS)
          let modelOutput = ''

          try {
            const buildStream = await callOpenCodeStream(builderModel, builderMessages, apiKey, streamAbort.signal)
            const reader = buildStream.getReader()
            const decoder = new TextDecoder()

            // while loop MUST be inside the try — so AbortError on reader.read() is caught
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              const chunk = decoder.decode(value, { stream: true })
              let chunkHadContent = false
              for (const line of chunk.split('\n')) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                  try {
                    const parsed = JSON.parse(line.slice(6))
                    const delta = parsed.choices?.[0]?.delta?.content
                    if (delta) {
                      modelOutput += delta
                      buildOutput += delta
                      chunkHadContent = true
                      send('delta', { content: delta })
                    }
                  } catch { /* skip */ }
                }
              }
              // Keepalive ping — prevents Cloudflare from dropping idle SSE connections
              if (!chunkHadContent) {
                controller.enqueue(encoder.encode(SSE_KEEPALIVE))
              }
            }

            clearTimeout(streamTimer)
          } catch (streamErr: unknown) {
            clearTimeout(streamTimer)
            if (streamErr instanceof Error && streamErr.name === 'AbortError') {
              // Timeout — try next model
              send('thinking', { step: 'build_timeout', text: `[t] ${builderModel} timed out — trying next...` })
              continue
            }
            send('error', { message: 'Stream error' })
            return
          }

          // If model produced content, we're done — don't try fallbacks
          if (modelOutput.trim().length > 0) break

          // Empty output — try next model
          if (modelIdx < BUILDER_MODELS.length - 1) {
            send('thinking', { step: 'build_empty', text: `[!] ${builderModel} returned no output — trying next model...` })
          }
        }

        // If still empty after all models, surface a clean error
        if (buildOutput.trim().length === 0) {
          send('error', { message: '[!] All builder models returned empty output — please try again in a moment' })
          return
        }

        // ── STEP 4: DONE ─────────────────────────────────────────────────
        send('thinking', { step: 'review_done', text: '[ok] Build complete — preview ready' })
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
