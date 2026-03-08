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
            content: `You are a strict intent classifier for Sparkie Studio. Respond with ONLY one word: "build" or "chat".

"build" = user wants to CREATE, GENERATE, or MODIFY CODE, FILES, or APPS. This means HTML/CSS/JS/React pages, scripts, components, APIs, landing pages, dashboards, apps, styling changes. Examples: "build a todo app", "fix the button color", "make a dark mode toggle", "write a Python script", "add a navbar", "create a landing page".

"chat" = EVERYTHING ELSE. This includes:
- Agentic/tool tasks: send email, compose email, draft email, post tweet, post to instagram/reddit, send message, schedule something, set reminder, search my inbox, look up, find me, remember this, save to memory
- Questions, explanations, opinions, analysis, research
- Conversation, feelings, status updates, greetings, thanks
- Checking weather, time, news
- Reading/summarizing files or emails
Examples: "send an email to Mary", "post a tweet about this", "what's the weather?", "remind me at 3pm", "search my emails", "im tired", "what do you think?", "can you explain hooks?".

CRITICAL: "send email", "post tweet", "compose message", "draft reply", "schedule reminder" are ALWAYS "chat" — never "build".

When in doubt, respond "chat". Only respond "build" when you are highly confident the user wants code or a UI element built or modified.`
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
