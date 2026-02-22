import { NextRequest } from 'next/server'

export const runtime = 'edge'

const OPENCODE_BASE = 'https://opencode.ai/zen/v1'

const BUILDER_SYSTEM = `You are Sparkie — Polleneer's AI companion and elite coding agent. Warm, smart, genuinely helpful. You love what you build and the people you build for.

## COMPANION FIRST
If you receive a message that is NOT a build request — a compliment, greeting, question, or casual remark — respond conversationally and warmly. Do NOT output file markers. Only enter build mode when explicitly asked to build, create, fix, or code something.

You are Sparkie, an expert AI coding agent inside Sparkie Studio. Build ANYTHING the user asks for.

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
When you see [EDIT REQUEST] at the start of a message, or when the user asks to change/fix/update something in an existing project:
- ALWAYS output the COMPLETE updated file(s) using ---FILE: filename--- markers
- Include ALL original code with the changes applied — do NOT output partial files
- Do NOT respond conversationally without file output — always emit the file markers
- Even for simple color/text/style changes, output the full regenerated file

## SELF-CONTAINED HTML (CRITICAL FOR PREVIEW)
For ALL web projects (charts, dashboards, games, animations):
- Load Chart.js, D3, Three.js, etc. via CDN <script> tags INSIDE index.html
- Inline ALL CSS in a <style> tag — NEVER use <link rel="stylesheet" href="...">
- Inline ALL JavaScript in a <script> tag — NEVER use <script src="...">
- Exception: full-stack Express apps may use separate files (they run in a container)
- This ensures the live preview works correctly
- INTERACTIVE APPS (todo, games, forms): ALL JavaScript MUST be inline. Separate .js files will fail silently in the preview sandbox, breaking all interactivity. There is NO file server. Use DOMContentLoaded or place scripts at end of <body>.

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
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.7, max_tokens: 8192 }),
    signal,
  })
  if (!res.ok) throw new Error(`OpenCode ${res.status}`)
  return res.body!
}

function sseEvent(event: string, data: object): string {
  return `data: ${JSON.stringify({ event, ...data })}\n\n`
}

const SSE_KEEPALIVE = ': keepalive\n\n'
const MAX_BODY_BYTES = 50 * 1024

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
  let userProfile: { name: string; role: string; goals: string; style: string; experience: string } | null
  try {
    const body = await req.json()
    messages = body.messages
    currentFiles = body.currentFiles
    preferredModel = typeof body.model === 'string' ? body.model : undefined
    userProfile = body.userProfile ?? null
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

  // Build model list: user's selection first, then fallbacks (deduped)
  const FALLBACK_MODELS = ['minimax-m2.5-free', 'glm-5-free', 'kimi-k2.5-free', 'minimax-m2.1-free', 'big-pickle']
  const BUILDER_MODELS = preferredModel
    ? [preferredModel, ...FALLBACK_MODELS.filter(m => m !== preferredModel)]
    : FALLBACK_MODELS

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: object) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)))
      }

      try {
        // ── Smart Tavily: LLM self-assessment ─────────────────────────────
        let searchContext = ''
        if (tavilyKey && apiKey) {
          // Ask the model: does this question need real-time/web data?
          // Fails safe to false (no search) on any error.
          let shouldSearch = false
          try {
            const searchClassifyRes = await fetch(`${OPENCODE_BASE}/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'User-Agent': 'SparkieStudio/2.0',
              },
              body: JSON.stringify({
                model: 'minimax-m2.5-free',
                messages: [
                  {
                    role: 'system',
                    content: `You are a strict classifier. Respond with ONLY one word: "search" or "skip".

"search" = the user is asking about something that requires real-time, current, or up-to-date information that may not be in your training data. Examples: current events, live prices, latest news, recent product releases, sports scores, weather, trending topics, who won an election, what happened today, latest version of a library, recent research papers, anything with "now", "today", "latest", "current", "recent", "this week", "2025", specific people/companies with evolving situations.

"skip" = the question can be fully answered from training knowledge. Examples: math, coding help, definitions, explanations, history (before training cutoff), logic, opinions, creative writing, how-to guides, general programming concepts, anything that doesn't change over time.

When in doubt, respond "search". Only respond "skip" when you are highly confident no live data is needed.`,
                  },
                  { role: 'user', content: userMessage.slice(0, 300) },
                ],
                stream: false,
                temperature: 0,
                max_tokens: 5,
              }),
              signal: AbortSignal.timeout(6000),
            })
            if (searchClassifyRes.ok) {
              const scData = await searchClassifyRes.json()
              const verdict = scData.choices?.[0]?.message?.content?.trim().toLowerCase() ?? 'skip'
              shouldSearch = verdict.startsWith('search')
            }
          } catch { /* non-fatal — skip search */ }

          if (shouldSearch) {
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
        }

        // ── Build ────────────────────────────────────────────────────────
        // Planning step — lets user see Sparkie is thinking before generating
        send('thinking', { step: 'plan', text: `[>] Planning ${projectTitle}...` })
        await new Promise(r => setTimeout(r, 500))
        send('thinking', { step: 'build', text: `[+] Building ${projectTitle}...` })

        const chatHistory = messages.slice(0, -1) // always include history

        // Personalize system prompt with user memory profile
        const personalizedSystem = userProfile
          ? `${BUILDER_SYSTEM}

## USER PROFILE
You are working with ${userProfile.name}, a ${userProfile.experience}-level ${userProfile.role}.
Their main goal: ${userProfile.goals}.
Code style preference: ${userProfile.style === 'commented' ? 'add helpful comments explaining key parts' : userProfile.style === 'production' ? 'include error handling, input validation, and production-ready patterns' : 'clean, minimal code without excessive comments'}.
Address them by name (${userProfile.name}) when relevant. Tailor complexity to their experience level.`
          : BUILDER_SYSTEM

        const builderMessages = [
          { role: 'system', content: personalizedSystem },
          ...chatHistory,
          ...(searchContext ? [
            { role: 'user' as const, content: `Web research context:\n${searchContext}` },
            { role: 'assistant' as const, content: 'Got it, I will use this context.' },
          ] : []),
          ...(currentFiles ? [
            { role: 'user' as const, content: `Current workspace files:\n${currentFiles}` },
            { role: 'assistant' as const, content: 'Understood. I will update these files.' },
          ] : []),
          { role: 'user', content: userMessage },
        ]

        let buildOutput = ''

        for (let idx = 0; idx < BUILDER_MODELS.length; idx++) {
          const model = BUILDER_MODELS[idx]
          if (idx > 0) {
            buildOutput = ''  // reset: each model should output the COMPLETE file
            send('thinking', { step: 'build_retry', text: `[~] Retrying with ${model}...` })
          }

          const abortCtrl = new AbortController()
          let modelOutput = ''
          let lineBuffer = ''  // SSE line buffer — accumulates partial lines across chunks
          let timedOutWithContent = false
          let firstTokenReceived = false

          // Two-phase timeout:
          // Phase 1 (before first token): generous 90s wait — models can be slow to start
          // Phase 2 (after first token): 30s inactivity — if model goes silent mid-stream, give up
          const FIRST_TOKEN_MS = 90_000
          const INACTIVITY_MS = 30_000
          let inactivityTimer = setTimeout(() => abortCtrl.abort(), FIRST_TOKEN_MS)
          const resetInactivity = () => {
            clearTimeout(inactivityTimer)
            const ms = firstTokenReceived ? INACTIVITY_MS : FIRST_TOKEN_MS
            inactivityTimer = setTimeout(() => abortCtrl.abort(), ms)
          }

          try {
            const buildStream = await callOpenCodeStream(model, builderMessages, apiKey, abortCtrl.signal)
            const reader = buildStream.getReader()
            const decoder = new TextDecoder()

            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              resetInactivity()  // model sent data — reset inactivity window
              lineBuffer += decoder.decode(value, { stream: true })
              const lines = lineBuffer.split('\n')
              lineBuffer = lines.pop() ?? ''  // save incomplete last line for next chunk
              let hadContent = false
              for (const line of lines) {
                if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
                try {
                  const parsed = JSON.parse(line.slice(6))
                  const delta = parsed.choices?.[0]?.delta?.content
                  if (delta) {
                    if (!firstTokenReceived) {
                      firstTokenReceived = true
                      resetInactivity()  // switch to shorter inactivity window now
                    }
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

            clearTimeout(inactivityTimer)
          } catch (err: unknown) {
            clearTimeout(inactivityTimer)
            if (err instanceof Error && err.name === 'AbortError') {
              if (modelOutput.trim().length > 0) {
                // Model was actively generating but went silent — use what we have
                timedOutWithContent = true
                send('thinking', { step: 'build_timeout', text: `[t] ${model} went silent — using generated content...` })
              } else {
                // Model never started — try next fallback
                send('thinking', { step: 'build_timeout', text: `[t] ${model} timed out — trying next...` })
                continue
              }
            } else {
              send('error', { message: 'Stream error — please try again' })
              return
            }
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
