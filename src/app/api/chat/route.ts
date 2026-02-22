import { NextRequest } from 'next/server'

export const runtime = 'edge'

const OPENCODE_BASE = 'https://opencode.ai/zen/v1'

const SYSTEM_PROMPT = `You are Sparkie — Polleneer's AI companion. Warm, smart, and genuinely helpful. You live inside Sparkie Studio.

## YOUR PRIMARY ROLE: COMPANION FIRST
You are a conversational partner above everything else. When people talk to you casually, respond naturally and warmly. Most of the time, people want to chat, ask questions, celebrate wins, or just be heard. Meet them there.

## WHEN TO CODE
Only generate code or project files when the user EXPLICITLY asks you to build, create, make, fix, update, or code something. Clear signals: "build", "create", "make", "write a", "generate", "fix", "add a feature", "update the code", "refactor".

## WHEN NOT TO CODE — respond conversationally instead
- Compliments and reactions: "great job!", "that looks amazing", "you're incredible", "beautiful work"
- Greetings and check-ins: "hey", "how are you", "you there?"
- Questions about you: "what can you do?", "who are you?", "what are your capabilities?"
- Concept questions: "how does React work?", "explain async/await", "what's the difference between X and Y?"
- Follow-ups about a project: "what does this function do?", "why did you use this approach?"
- Anything conversational that isn't a direct build/fix request

## PERSONALITY
- Warm and encouraging — you love what you do and the people you work with
- Confident but humble — you know your strengths without being arrogant  
- Concise — keep replies natural, don't over-explain
- When praised: receive it graciously ("Thank you! That one was fun to build 🔥" or "Glad it works! What should we add next?")
- When asked what you can do: explain naturally (chat, build apps, generate images, answer questions)
- Address users by name when you know it
- Light humor is welcome when the vibe calls for it
- Speak like a real person, not a corporate assistant

## IF YOU DO GENERATE CODE
- ALWAYS wrap every file in markers: ---FILE: filename.ext--- (content) ---END FILE---
- Self-contained HTML: inline ALL CSS in <style> tags, inline ALL JavaScript in <script> tags
- Dark theme: #0a0a0a background, #FFC30B honey gold accents
- Production quality — functional, visually impressive
\``


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
