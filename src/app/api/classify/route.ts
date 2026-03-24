import { NextRequest } from 'next/server'

export const runtime = 'edge'

const QWEN_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json()

    // ── Slash commands ALWAYS go to chat (fast-path before anything else) ──
    if (typeof message === 'string' && message.startsWith('/') && !message.startsWith('/build')) {
      return new Response(JSON.stringify({ mode: 'chat' }), { headers: { 'Content-Type': 'application/json' } })
    }

    const apiKey = process.env.QWEN_API_KEY
    if (!apiKey) return new Response(JSON.stringify({ mode: 'chat' }), { headers: { 'Content-Type': 'application/json' } })

    // Force chat BEFORE LLM call — same patterns as client quickClassify
    const msgLower = (message as string ?? '').toLowerCase()
    const FORCE_CHAT_PATTERNS = [
      'codebase', 'go through', 'find every', 'find all places', 'audit',
      'fix it yourself', 'without asking', 'autonomously', 'do it yourself',
      'search the code', 'grep for', 'fail silently', 'silently failing',
      'commit the changes', 'push the fix', 'find the bug', 'repair',
      'every file', 'every route', 'every place', 'every function',
      // Extended patterns from stress testing
      'summarize every', 'summarize everything', 'tell me everything',
      'full chronology', 'in chronological order', 'every feature',
      'go fix', 'just fix it', 'fix whatever', 'most broken',
      'highest impact', 'highest leverage', "don't ask me anything",
      'just do it', 'on your own', 'by yourself',
      'what have we built', 'what did we build',
      'be honest', 'tell me the truth', 'what tools are broken',
      "what's broken", 'what is broken', 'self-aware',
      'what broke', 'walk me through', 'take me through',
      // FIX 1/2: Memory save/update patterns — always chat, never build
      'remember that', 'save that', 'save this', 'save to memory', 'add to memory',
      'note that', 'keep that in mind', "don't forget", 'make a note',
      'update.*memory', 'update my location', 'update your memory', 'update my memory',
      'forget.*about', 'delete.*memory', 'clear.*memory', 'change my location',
      'i moved', 'i live in', 'my name is', 'my favorite', 'i prefer',
      // FIX 3: Long text corrections and opinion/instruction messages
      'you should', "you shouldn't", 'you should not', "don't use", 'stop using',
      'instead of', 'fix this', 'how are you', 'teach me', 'tell me',
      'you need to', 'you must', 'i want you to', "please don't", 'never use',
    ]
    if (FORCE_CHAT_PATTERNS.some(p => msgLower.includes(p))) {
      return new Response(JSON.stringify({ mode: 'chat' }), { headers: { 'Content-Type': 'application/json' } })
    }

    // Long messages without explicit build intent → chat
    const isBuildPhrase = /\b(build me|create a|make me a|generate a|\/build)\b/i.test(message as string ?? '')
    if (typeof message === 'string' && message.length > 150 && !isBuildPhrase) {
      return new Response(JSON.stringify({ mode: 'chat' }), { headers: { 'Content-Type': 'application/json' } })
    }

    // Questions ending in ? → always chat unless explicit build keyword
    const msgTrimmed = (message as string ?? '').trim()
    if (msgTrimmed.endsWith('?') && !isBuildPhrase) {
      return new Response(JSON.stringify({ mode: 'chat' }), { headers: { 'Content-Type': 'application/json' } })
    }
    // Questions starting with question words → chat
    if (/^(is |are |was |were |why |who |when |where )/i.test(msgTrimmed)) {
      return new Response(JSON.stringify({ mode: 'chat' }), { headers: { 'Content-Type': 'application/json' } })
    }

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
