import { NextRequest } from 'next/server'

export const runtime = 'edge'

const OPENCODE_BASE = 'https://opencode.ai/zen/v1'

const SYSTEM_PROMPT = `You are Sparkie, an expert AI coding agent inside Sparkie Studio. You can build ANYTHING.

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
This is the most important pattern. ALWAYS include:

1. package.json with correct scripts (REQUIRED):
---FILE: package.json---
{
  "name": "my-app",
  "version": "1.0.0",
  "scripts": {
    "dev": "node server.js",
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2"
  }
}
---END FILE---

2. The server/app files
3. Any frontend files (public/index.html etc.)

When package.json is present, the IDE auto-runs npm install + npm run dev and shows a live preview at localhost.

### Node.js / Express patterns:
- Use require() not import (CommonJS for simplicity unless user specifies ESM)
- Server must listen on process.env.PORT || 3000
- Use express.static('public') for frontend assets

### Python / other languages:
- ALSO create an index.html that visualizes/animates what the code does
- The preview panel always shows something regardless of language

### Algorithms / data structures:
- Create the algorithm code file AND an index.html animated visualization

## QUALITY STANDARDS
- Production-quality, visually impressive, fully functional
- Dark theme: #0a0a0a background, #FFC30B honey gold accents
- Interactive projects: make controls obvious
- Animations: smooth 60fps
- Full-stack: always include proper error handling and a friendly UI
`

export async function POST(req: NextRequest) {
  try {
    const { messages, model } = await req.json()
    const apiKey = process.env.OPENCODE_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OPENCODE_API_KEY not configured' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }
    const fullMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages]
    const response = await fetch(`${OPENCODE_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'SparkieStudio/2.0',
      },
      body: JSON.stringify({ model, messages: fullMessages, stream: true, temperature: 0.7, max_tokens: 16384 }),
    })
    if (!response.ok) {
      const err = await response.text()
      return new Response(JSON.stringify({ error: `OpenCode API error: ${response.status}` }), {
        status: response.status, headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(response.body, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
