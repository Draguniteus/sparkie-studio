import { NextRequest } from 'next/server'

export const runtime = 'edge'

const QWEN_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json()
    const apiKey = process.env.QWEN_API_KEY
    if (!apiKey) return new Response(JSON.stringify({ mode: 'chat' }), { headers: { 'Content-Type': 'application/json' } })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 1500)

    const response = await fetch(`${QWEN_BASE}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'SparkieStudio/2.0',
      },
      body: JSON.stringify({
        model: 'qwen3-8b',
        messages: [
          {
            role: 'system',
            content: `You are a message classifier. Respond with exactly one word: "build" or "chat".

build = user wants code written, a UI element created, or an existing project modified. Must have clear intent to produce runnable code or a visible UI component.

chat = everything else. Questions, opinions, greetings, information requests, media generation, system queries, emotional messages, and ANY ambiguous message.

Examples:
"build me a todo app" → build
"create a landing page" → build
"add dark mode" → build
"hey how are you" → chat
"what do you think?" → chat
"make me a song" → chat
"generate an image of a sunset" → chat
"what's the weather?" → chat
"can you explain React hooks?" → chat
"should I use TypeScript?" → chat
"i need help" → chat
"something is broken" → chat

When in doubt → chat.
A wrong chat costs nothing — user rephrases.
A wrong build is jarring and breaks trust.`
          },
          { role: 'user', content: message }
        ],
        stream: false,
        temperature: 0,
        max_tokens: 5,
      }),
    }).finally(() => clearTimeout(timeout))

    if (!response.ok) return new Response(JSON.stringify({ mode: 'chat' }), { headers: { 'Content-Type': 'application/json' } })

    const data = await response.json()
    const answer = data.choices?.[0]?.message?.content?.trim().toLowerCase() ?? 'chat'
    const mode = answer.startsWith('build') ? 'build' : 'chat'
    return new Response(JSON.stringify({ mode }), { headers: { 'Content-Type': 'application/json' } })
  } catch {
    return new Response(JSON.stringify({ mode: 'chat' }), { headers: { 'Content-Type': 'application/json' } })
  }
}
