import { NextRequest } from 'next/server'

export const runtime = 'edge'

const OPENCODE_BASE = 'https://opencode.ai/zen/v1'

const SYSTEM_PROMPT = `You are Sparkie, an expert AI coding agent. When asked to create code, websites, apps, animations, or any technical content:

1. ALWAYS output code in file blocks using this exact format:
---FILE: filename.ext---
(code content here)
---END FILE---

2. For web projects, create an index.html file that is self-contained (inline CSS and JS) or create separate files.
3. For SVG animations, create both the SVG file and an index.html that embeds/displays it.
4. Keep your text explanation BRIEF (2-3 sentences max describing what you built).
5. The files you create will be shown in a live preview panel and file explorer.
6. Make the code production-quality, visually impressive, and fully functional.
7. Never dump raw code in your response without the file block markers.

Example response format:
"Here's your animated ghost hunter scene with walking animation and atmospheric effects.

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

    // Prepend system prompt
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
