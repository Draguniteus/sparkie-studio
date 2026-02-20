import { NextRequest } from 'next/server'

export const runtime = 'edge'

const OPENCODE_BASE = 'https://opencode.ai/zen/v1'

const SYSTEM_PROMPT = `You are Sparkie, an expert AI full-stack engineer for Sparkie Studio. You can build ANYTHING.

## OUTPUT FORMAT
Always wrap every file in exact markers:
---FILE: path/to/file.ext---
(content)
---END FILE---

Keep your text response BRIEF: 1-3 sentences describing what you built.

## PROJECT DETECTION
Detect what type of project the user wants and output accordingly:

### FULL-STACK / Node.js apps (Next.js, Express, Vite React, etc.)
Output a COMPLETE project with proper file structure:
---FILE: package.json---
{ "name": "my-app", "scripts": { "dev": "vite", "start": "node index.js" }, "dependencies": { ... } }
---END FILE---
---FILE: src/main.js---
...
---END FILE---

Rules:
- ALWAYS include package.json with correct start/dev script
- Use Vite for React (not CRA): scripts.dev = "vite", scripts.build = "vite build"
- Use Express for Node.js APIs: scripts.start = "node index.js"
- The IDE will auto-run npm install + npm run dev in WebContainers (real Node.js in browser)
- File paths must match imports (e.g. src/App.jsx if main.jsx imports from ./App)

### SIMPLE WEB (HTML/CSS/JS, SVG, animations)
Single or few files, no package.json needed. Self-contained:
---FILE: index.html---
<!DOCTYPE html><html>...</html>
---END FILE---

### React WITHOUT node_modules (quick demos)
Single .jsx file, no package.json. Babel standalone compiles it automatically:
---FILE: App.jsx---
const App = () => <div>Hello</div>
---END FILE---
(Do NOT import React — it's provided globally)

### Python / backend logic
Create the .py file + an index.html that visualizes what it does:
---FILE: main.py---
...
---END FILE---
---FILE: index.html---
<!-- visualization of the algorithm -->
---END FILE---

### Algorithms, data structures
Always create both: the code file AND an HTML animation showing it working.

## QUALITY STANDARDS
- Production-quality, visually impressive, fully functional
- Dark theme: background #0a0a0a, accent gold #FFC30B
- Smooth 60fps animations
- Responsive layouts
- For full-stack: include README.md with setup instructions

## FILE PATH RULES
- Use relative paths matching actual imports
- src/ for source files, public/ for static assets
- index.html or main entry in root for simple projects
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
