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

Set needsWebSearch to true ONLY if the task requires current/live data (API docs, real prices, news, etc.).
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

## QUALITY STANDARDS
- Production-quality, visually impressive, fully functional
- Dark theme: #0a0a0a background, #FFC30B honey gold accents
- Interactive projects: make controls obvious
- Animations: smooth 60fps`

async function callOpenCode(model: string, messages: {role: string, content: string}[], apiKey: string): Promise<string> {
  const res = await fetch(\`\${OPENCODE_BASE}/chat/completions\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': \`Bearer \${apiKey}\`,
      'User-Agent': 'SparkieStudio/2.0',
    },
    body: JSON.stringify({ model, messages, stream: false, temperature: 0.7, max_tokens: 8192 }),
  })
  if (!res.ok) throw new Error(\`OpenCode \${res.status}\`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

async function callOpenCodeStream(model: string, messages: {role: string, content: string}[], apiKey: string): Promise<ReadableStream> {
  const res = await fetch(\`\${OPENCODE_BASE}/chat/completions\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': \`Bearer \${apiKey}\`,
      'User-Agent': 'SparkieStudio/2.0',
    },
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.7, max_tokens: 16384 }),
  })
  if (!res.ok) throw new Error(\`OpenCode \${res.status}\`)
  return res.body!
}

function sseEvent(event: string, data: object): string {
  return \`data: \${JSON.stringify({ event, ...data })}\n\n\`
}

export async function POST(req: NextRequest) {
  const { messages, currentFiles } = await req.json()
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
        send('thinking', { step: 'plan', text: '⚡ Planning structure...' })

        const plannerMessages = [
          { role: 'system', content: PLANNER_SYSTEM },
          ...messages.slice(0, -1),
          { role: 'user', content: userMessage }
        ]

        const planRaw = await callOpenCode('glm-5-free', plannerMessages, apiKey)

        let plan: { title: string; files: string[]; approach: string; needsWebSearch: boolean; searchQuery: string }
        try {
          const jsonMatch = planRaw.match(/\{[\s\S]*\}/)
          plan = JSON.parse(jsonMatch?.[0] ?? planRaw)
        } catch {
          plan = { title: 'Project', files: [], approach: userMessage, needsWebSearch: false, searchQuery: '' }
        }

        send('thinking', { step: 'plan_done', text: \`⚡ Plan ready — \${plan.files.length > 0 ? plan.files.join(', ') : 'analyzing request'}\` })

        // ── STEP 2: WEB SEARCH (if needed) ───────────────────────────────
        let searchContext = ''
        if (plan.needsWebSearch && tavilyKey && plan.searchQuery) {
          send('thinking', { step: 'search', text: \`🔍 Searching: \${plan.searchQuery}\` })
          try {
            const tavilyRes = await fetch('https://api.tavily.com/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${tavilyKey}\` },
              body: JSON.stringify({ query: plan.searchQuery, max_results: 3, search_depth: 'basic' }),
            })
            if (tavilyRes.ok) {
              const tavilyData = await tavilyRes.json()
              const results = tavilyData.results?.slice(0, 3) ?? []
              searchContext = results.map((r: {title: string; content: string; url: string}) =>
                \`[\${r.title}]\n\${r.content}\n\${r.url}\`
              ).join('\n\n')
              send('thinking', { step: 'search_done', text: \`🔍 Found \${results.length} sources\` })
            }
          } catch {
            send('thinking', { step: 'search_skip', text: '🔍 Search unavailable — building from knowledge' })
          }
        }

        // ── STEP 3: BUILDER (streaming) ───────────────────────────────────
        send('thinking', { step: 'build', text: \`🔨 Building \${plan.title}...\` })

        const builderContext = [
          plan.approach ? \`Approach: \${plan.approach}\` : '',
          plan.files.length > 0 ? \`Files to create: \${plan.files.join(', ')}\` : '',
          searchContext ? \`\nWeb research:\n\${searchContext}\` : '',
          currentFiles ? \`\nCurrent workspace (update these, don't rewrite from scratch if fixing):\n\${currentFiles}\` : '',
        ].filter(Boolean).join('\n')

        const builderMessages = [
          { role: 'system', content: BUILDER_SYSTEM },
          ...messages.slice(0, -1),
          ...(builderContext ? [{
            role: 'user' as const,
            content: \`[BUILD PLAN]\n\${builderContext}\`
          }, {
            role: 'assistant' as const,
            content: 'Understood. Building now.'
          }] : []),
          { role: 'user', content: userMessage }
        ]

        const buildStream = await callOpenCodeStream('minimax-m2.5-free', builderMessages, apiKey)
        const reader = buildStream.getReader()
        const decoder = new TextDecoder()
        let buildOutput = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          // Forward raw SSE chunks as build deltas
          for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const parsed = JSON.parse(line.slice(6))
                const delta = parsed.choices?.[0]?.delta?.content
                if (delta) {
                  buildOutput += delta
                  send('delta', { content: delta })
                }
              } catch { /* skip */ }
            }
          }
        }

        // ── STEP 4: REVIEWER ─────────────────────────────────────────────
        send('thinking', { step: 'review', text: '✅ Reviewing for bugs...' })

        const reviewerMessages = [
          { role: 'system', content: REVIEWER_SYSTEM },
          { role: 'user', content: \`Review this code output:\n\n\${buildOutput}\` }
        ]

        const review = await callOpenCode('big-pickle', reviewerMessages, apiKey)

        if (review.startsWith('LGTM')) {
          send('thinking', { step: 'review_done', text: '✅ Review passed — no critical bugs found' })
        } else if (review.startsWith('ISSUES_FOUND')) {
          send('thinking', { step: 'review_fixing', text: '🔧 Reviewer found issues — patching...' })
          // Stream the fixed version from reviewer
          const fixLines = review.split('\n').slice(1) // skip ISSUES_FOUND line
          const fixedContent = fixLines.join('\n').trim()
          if (fixedContent.includes('---FILE:')) {
            send('delta', { content: '\n' + fixedContent })
          }
          send('thinking', { step: 'review_done', text: '✅ Issues fixed — ready' })
        }

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
