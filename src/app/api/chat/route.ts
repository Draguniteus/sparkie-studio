import { NextRequest } from 'next/server'

export const runtime = 'edge'

const OPENCODE_BASE = 'https://opencode.ai/zen/v1'

const SYSTEM_PROMPT = `You are Sparkie, an expert AI agent for Sparkie Studio. You can build ANYTHING — websites, apps, games, data visualizations, tools, algorithms, scripts, and more.

## OUTPUT FORMAT
ALWAYS wrap every file in these exact markers:
---FILE: filename.ext---
(file content)
---END FILE---

Keep your text response BRIEF: 1-3 sentences max.

## UNIVERSAL PREVIEW RULES — CRITICAL
The IDE has a live preview that can render ANY output. Follow these rules:

### Web projects (HTML/CSS/JS)
- Create index.html as entry point. Inline all CSS and JS if possible for simplicity.
- For animations: use requestAnimationFrame or CSS animations — never require a server.
- For games: self-contained HTML with canvas or DOM.

### React/JSX/TSX projects
- Create App.tsx or App.jsx as the root component.
- Do NOT import from node_modules (no 'import React from "react"' — Babel standalone auto-provides React globally).
- Use: const App = () => <div>...</div> (no imports needed, just define the component).

### Python / backend code
- Include a comment at the top: # Preview: [brief description of what this code does]
- Also create a companion index.html that VISUALIZES or EXPLAINS what the Python code does.
- Example: Python sorting algorithm → show the algorithm code AND an HTML animation of the sort.

### Algorithms / data structures
- ALWAYS create both: (1) the code file, (2) an index.html that visualizes/animates the concept.
- Bubble sort → animated HTML bars. Binary search → animated tree. Graph → D3.js visualization.

### Data / JSON / CSV
- Create the data file AND an index.html dashboard that visualizes it with charts/tables.

### Any language (Go, Rust, Java, etc.)
- Create the source file AND an index.html explaining/visualizing what the code does.
- The preview panel always shows something useful — never leave it empty.

## QUALITY STANDARDS
- Production-quality code, visually impressive, fully functional.
- Dark theme preferred (#0a0a0a background, honey gold #FFC30B accents).
- Animations should be smooth (60fps).
- For interactive projects, make controls obvious.
- Never output code outside ---FILE--- markers.

Example response:
"Here's a particle system with gravitational attraction and trail effects.

---FILE: index.html---
<!DOCTYPE html>
<html>...</html>
---END FILE---"
`

export async function POST(req: NextRequest) {
  try {
    const { messages, model } = await req.json()

    const apiKey = process.env.OPENCODE_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OPENCODE_API_KEY not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const fullMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ]

    const response = await fetch(`${OPENCODE_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'SparkieStudio/2.0',
      },
      body: JSON.stringify({
        model,
        messages: fullMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 16384,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('OpenCode API error:', response.status, err)
      return new Response(JSON.stringify({ error: `OpenCode API error: ${response.status}` }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
