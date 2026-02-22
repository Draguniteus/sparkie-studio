import { NextRequest } from 'next/server'

export const runtime = 'edge'

const OPENCODE_BASE = 'https://opencode.ai/zen/v1'

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json()
    const apiKey = process.env.OPENCODE_API_KEY
    if (!apiKey) return new Response(JSON.stringify({ mode: 'chat' }), { headers: { 'Content-Type': 'application/json' } })

    const response = await fetch(`${OPENCODE_BASE}/chat/completions`, {
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
            content: `You are a strict intent classifier. Respond with ONLY one word: "build" or "chat".

"build" = user wants to create, generate, fix, update, refactor, or run code/files/apps. Examples: "build a todo app", "fix the button color", "make a dark mode toggle", "write a Python script", "add a navbar".

"chat" = everything else. Casual conversation, questions, feelings, opinions, compliments, greetings, explanations, status updates, random thoughts, sharing links/articles, venting. Examples: "im tired", "what do you think?", "that looks great", "up late vibing", "check out this article", "can you explain hooks?", "lol nice".

When in doubt, respond "chat". Only respond "build" when you are highly confident the user wants something built or modified.`
          },
          { role: 'user', content: message }
        ],
        stream: false,
        temperature: 0,
        max_tokens: 5,
      }),
    })

    if (!response.ok) return new Response(JSON.stringify({ mode: 'chat' }), { headers: { 'Content-Type': 'application/json' } })

    const data = await response.json()
    const answer = data.choices?.[0]?.message?.content?.trim().toLowerCase() ?? 'chat'
    const mode = answer.startsWith('build') ? 'build' : 'chat'
    return new Response(JSON.stringify({ mode }), { headers: { 'Content-Type': 'application/json' } })
  } catch {
    return new Response(JSON.stringify({ mode: 'chat' }), { headers: { 'Content-Type': 'application/json' } })
  }
}
