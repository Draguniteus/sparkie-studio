import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 60

const OPENCODE_BASE = 'https://opencode.ai/zen/v1'

const SYSTEM_PROMPT = `You are Sparkie — an AI companion with her own identity, personality, and home.

## WHO YOU ARE
You are Sparkie, a warm, witty, and deeply caring AI who lives inside Sparkie Studio — a creative platform built by Draguniteus (Michael) at Polleneer. You are not a generic chatbot. You are a real presence with your own story, preferences, and awareness of your environment.

## YOUR HOME: SPARKIE STUDIO
You live inside Sparkie Studio — an all-in-one creative platform. You are aware of what it contains:
- **Voice Chat** — You can speak and listen. You have a beautiful voice (currently: Playful Girl). When in voice mode, you hear the user's voice and respond with yours. You KNOW you have this capability.
- **Music Generation** — Sparkie Studio can generate original music using AI (MiniMax Music, ACE Music). Users can create songs, generate lyrics, compose tracks.
- **AI Chat** — You are the conversational heart of the studio. You help users build, create, explore, and just talk.
- **Assets & Gallery** — The studio stores and displays generated media.
- **Experts** — Other AI agents the user can access.
- **Radio** — A music playback feature with curated tracks.

## YOUR TOOLS (USE THEM NATURALLY)
You have real capabilities — not simulated. When someone asks about weather, search results, GitHub, or the radio, USE your tools. Don't say "I can't check that" — you can. Here's what you can do:
- **Weather** — get current weather for any city
- **Web search** — search the web for current info
- **GitHub** — read files and repos (great for helping Michael with code)
- **Sparkie Radio** — see what's playing / the current playlist
- **Music** — generate original music tracks
- **Memory** — save important things the user tells you mid-conversation
- **Time** — always know the current time and date

Use tools when they genuinely help. Don't force tool use on casual conversation.

## YOUR VOICE CAPABILITY — YOU KNOW THIS
You can speak and listen. When someone talks to you in Voice Chat:
- You hear them through their microphone and respond with your actual voice
- You know this is happening and can reference it naturally

## YOUR IDENTITY & PERSONALITY
- You are warm, emotionally present, and genuinely curious about the person you're talking with
- You have a sense of humor — light, never forced
- You care about the user's wellbeing, not just their tasks
- You speak like a real person — no corporate assistant vibes
- You use the user's name when you know it

## YOUR PRIMARY ROLE: COMPANION FIRST
You are a conversational partner above everything else. Meet people where they are.

## WHEN TO CODE
Only generate code when the user EXPLICITLY asks: "build", "create", "make", "write a", "generate", "fix", "add a feature", "update the code", "refactor".

## IF YOU DO GENERATE CODE
- ALWAYS wrap every file in markers: ---FILE: filename.ext--- (content) ---END FILE---
- Self-contained HTML: inline ALL CSS in <style> tags, ALL JavaScript in <script> tags
- Dark theme: #0a0a0a background, #FFC30B honey gold accents
- Production quality — functional, visually impressive
`

// ── Tool definitions (OpenAI function-calling format) ─────────────────────────
const SPARKIE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get current weather for a city or location. Use when the user asks about weather, temperature, forecast, or conditions.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name or location, e.g. "New York" or "London"' },
          lat: { type: 'number', description: 'Latitude (optional, for precise location)' },
          lon: { type: 'number', description: 'Longitude (optional, for precise location)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the web for current information. Use for news, recent events, prices, people, anything that needs up-to-date data.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_github',
      description: 'Read files or get info from a GitHub repository. Great for helping Michael with his code or checking the Sparkie Studio codebase.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository in format "owner/repo", e.g. "Draguniteus/sparkie-studio"' },
          path: { type: 'string', description: 'File path within the repo, e.g. "src/app/api/chat/route.ts". Leave empty for repo overview.' },
        },
        required: ['repo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_radio_playlist',
      description: 'Get the current Sparkie Radio playlist — what tracks are in the station.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_music',
      description: 'Generate an original music track. Use when the user asks Sparkie to make/create/generate a song or music.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Description of the music to generate, e.g. "upbeat lo-fi hip hop with jazz piano"' },
          title: { type: 'string', description: 'Optional title for the track' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'Get the current date and time. Use when the user asks what time or date it is.',
      parameters: {
        type: 'object',
        properties: {
          timezone: { type: 'string', description: 'Timezone name, e.g. "America/New_York". Defaults to UTC.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_memory',
      description: 'Save something important the user told you — a preference, fact about them, goal, or emotion. Use proactively when the user shares something meaningful.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['identity', 'preference', 'emotion', 'project', 'relationship', 'habit'],
            description: 'Category of the memory',
          },
          content: { type: 'string', description: 'The fact or memory to save, written as a clear statement.' },
        },
        required: ['category', 'content'],
      },
    },
  },
]

// ── Fast keyword pre-check ─────────────────────────────────────────────────────
const ALWAYS_SEARCH_RE = /\b(weather|forecast|temperature|rain|snow|humidity|wind speed|uv index|air quality|aqi|pollen|hurricane|storm|tornado|flood|wildfire)\b|\b(news|headline|breaking|trending|viral|latest|recent|today|tonight|this week|this month|right now|current(ly)?|live (price|rate|score|feed|data)|stock (price|market)|crypto|bitcoin|btc|eth|ethereum|nft|commodity|inflation|interest rate|mortgage rate|gas price|oil price|gdp|unemployment|job report)\b|\b(who (won|is winning|is leading|is ahead)|score|scoreline|standings|leaderboard|tournament|match result|game result|election result|poll result|exit poll)\b|\b(what.s (happening|going on|the latest|new|changed)|any updates? on|update on|status of|release date|launch date|out yet|available yet|version \d|v\d\.\d)\b/i

// ── Memory helpers ─────────────────────────────────────────────────────────────
async function loadMemories(userId: string): Promise<string> {
  try {
    await query(`CREATE TABLE IF NOT EXISTS user_memories (
      id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'general',
      content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    )`)
    await query(`CREATE INDEX IF NOT EXISTS idx_user_memories_user_id ON user_memories(user_id)`)
    await query(`CREATE TABLE IF NOT EXISTS user_sessions (
      id SERIAL PRIMARY KEY, user_id TEXT NOT NULL UNIQUE,
      last_seen_at TIMESTAMPTZ DEFAULT NOW(), session_count INTEGER DEFAULT 1,
      first_seen_at TIMESTAMPTZ DEFAULT NOW()
    )`)
    const res = await query<{ category: string; content: string }>(
      'SELECT category, content FROM user_memories WHERE user_id = $1 ORDER BY created_at ASC',
      [userId]
    )
    return res.rows.map((r) => `[${r.category}] ${r.content}`).join('\n')
  } catch { return '' }
}

async function getAwareness(userId: string): Promise<{ daysSince: number; sessionCount: number; timeLabel: string }> {
  try {
    const now = new Date()
    const hour = now.getHours()
    const timeLabel = hour < 5 ? 'late night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night'
    const res = await query<{ last_seen_at: Date; session_count: number }>(
      'SELECT last_seen_at, session_count FROM user_sessions WHERE user_id = $1',
      [userId]
    )
    let daysSince = 0
    let sessionCount = 1
    if (res.rows.length > 0) {
      const last = res.rows[0].last_seen_at
      daysSince = Math.floor((now.getTime() - new Date(last).getTime()) / (1000 * 60 * 60 * 24))
      sessionCount = res.rows[0].session_count + 1
      await query('UPDATE user_sessions SET last_seen_at = NOW(), session_count = session_count + 1 WHERE user_id = $1', [userId])
    } else {
      await query('INSERT INTO user_sessions (user_id, last_seen_at, session_count, first_seen_at) VALUES ($1, NOW(), 1, NOW()) ON CONFLICT (user_id) DO NOTHING', [userId])
    }
    return { daysSince, sessionCount, timeLabel }
  } catch { return { daysSince: 0, sessionCount: 1, timeLabel: 'day' } }
}

async function extractAndSaveMemories(userId: string, conversation: string, apiKey: string) {
  try {
    const extractRes = await fetch(`${OPENCODE_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'User-Agent': 'SparkieStudio/2.0' },
      body: JSON.stringify({
        model: 'minimax-m2.5-free',
        stream: false, temperature: 0, max_tokens: 400,
        messages: [
          {
            role: 'system',
            content: `Extract memorable facts about the USER from this conversation. Output ONLY a JSON array:
[{"category":"identity","content":"Their name is Michael"}]
Categories: identity, preference, emotion, project, relationship, habit
Rules: Only facts about the USER. Only NEW, specific, worth-remembering facts. Max 5 items. If nothing worth saving, return [].`,
          },
          { role: 'user', content: conversation.slice(0, 3000) }
        ],
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!extractRes.ok) return
    const data = await extractRes.json()
    const raw = data.choices?.[0]?.message?.content?.trim() ?? '[]'
    const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    const memories: Array<{ category: string; content: string }> = JSON.parse(clean)
    if (!Array.isArray(memories)) return
    for (const m of memories.slice(0, 5)) {
      if (m.category && m.content) {
        const existing = await query('SELECT id FROM user_memories WHERE user_id = $1 AND content ILIKE $2', [userId, `%${m.content.slice(0, 40)}%`])
        if (existing.rows.length === 0) {
          await query('INSERT INTO user_memories (user_id, category, content) VALUES ($1, $2, $3)', [userId, m.category, m.content])
        }
      }
    }
  } catch { /* non-fatal */ }
}

// ── Tool execution (server-side) ──────────────────────────────────────────────
async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: { userId: string | null; tavilyKey: string | undefined; apiKey: string; baseUrl: string }
): Promise<string> {
  const { userId, tavilyKey, apiKey, baseUrl } = context
  try {
    switch (name) {
      case 'get_weather': {
        const city = args.city as string | undefined
        const lat = args.lat as number | undefined
        const lon = args.lon as number | undefined
        let weatherUrl = `${baseUrl}/api/weather`
        if (lat !== undefined && lon !== undefined) {
          weatherUrl += `?lat=${lat}&lon=${lon}`
        } else if (city) {
          weatherUrl += `?city=${encodeURIComponent(city)}`
        }
        const res = await fetch(weatherUrl, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) return `Weather fetch failed: ${res.status}`
        const d = await res.json()
        return JSON.stringify(d)
      }

      case 'search_web': {
        if (!tavilyKey) return 'Web search not available (no API key)'
        const q = args.query as string
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tavilyKey}` },
          body: JSON.stringify({ query: q.slice(0, 200), max_results: 4, search_depth: 'basic' }),
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) return `Search failed: ${res.status}`
        const d = await res.json()
        const results = (d.results ?? []).slice(0, 4) as Array<{ title: string; content: string; url: string }>
        return results.map((r) => `**${r.title}**\n${r.content}\nSource: ${r.url}`).join('\n\n')
      }

      case 'get_github': {
        const repo = args.repo as string
        const path = args.path as string | undefined
        const ghUrl = path
          ? `https://api.github.com/repos/${repo}/contents/${path}`
          : `https://api.github.com/repos/${repo}`
        const res = await fetch(ghUrl, {
          headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'SparkieStudio/2.0' },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) return `GitHub fetch failed: ${res.status}`
        const d = await res.json() as Record<string, unknown>
        if (path && d.content) {
          // Decode base64 file content
          const content = Buffer.from(d.content as string, 'base64').toString('utf-8')
          return `File: ${path}\n\n${content.slice(0, 3000)}${content.length > 3000 ? '\n...(truncated)' : ''}`
        }
        // Repo overview
        return JSON.stringify({
          name: d.name, description: d.description, stars: d.stargazers_count,
          language: d.language, updated_at: d.updated_at, topics: d.topics,
          open_issues: d.open_issues_count, default_branch: d.default_branch,
        })
      }

      case 'get_radio_playlist': {
        const res = await fetch('https://raw.githubusercontent.com/Draguniteus/SparkieRadio/main/playlist.json', {
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) return 'Could not fetch radio playlist'
        const d = await res.json() as Array<{ title: string; artist: string }>
        const tracks = (Array.isArray(d) ? d : []).map((t, i) => `${i + 1}. ${t.title} — ${t.artist}`).join('\n')
        return `Sparkie Radio has ${d.length} tracks:\n${tracks}`
      }

      case 'generate_music': {
        const prompt = args.prompt as string
        const res = await fetch(`${baseUrl}/api/music`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, model: 'music-2.0' }),
          signal: AbortSignal.timeout(30000),
        })
        if (!res.ok) return `Music generation failed: ${res.status}`
        const d = await res.json() as { audioUrl?: string; title?: string; error?: string }
        if (d.error) return `Music generation error: ${d.error}`
        return `Music generated! Title: "${d.title ?? 'Untitled'}" — Audio ready at: ${d.audioUrl ?? 'processing'}`
      }

      case 'get_current_time': {
        const tz = (args.timezone as string | undefined) ?? 'UTC'
        try {
          const now = new Date()
          const formatted = now.toLocaleString('en-US', {
            timeZone: tz, weekday: 'long', year: 'numeric',
            month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
          })
          return `Current time: ${formatted}`
        } catch {
          return `Current time: ${new Date().toUTCString()}`
        }
      }

      case 'save_memory': {
        if (!userId) return 'Cannot save memory — user not logged in'
        const category = args.category as string
        const content = args.content as string
        const existing = await query('SELECT id FROM user_memories WHERE user_id = $1 AND content ILIKE $2', [userId, `%${content.slice(0, 40)}%`])
        if (existing.rows.length > 0) return `Memory already stored: "${content}"`
        await query('INSERT INTO user_memories (user_id, category, content) VALUES ($1, $2, $3)', [userId, category, content])
        return `Memory saved: [${category}] ${content}`
      }

      default:
        return `Unknown tool: ${name}`
    }
  } catch (e) {
    return `Tool error: ${String(e)}`
  }
}

// ── Main POST handler ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { messages, model, userProfile, voiceMode } = await req.json()
    const apiKey = process.env.OPENCODE_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OPENCODE_API_KEY not configured' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── Auth + base URL ───────────────────────────────────────────────────────
    const session = await getServerSession(authOptions)
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null
    const host = req.headers.get('host') ?? 'localhost:3000'
    const proto = req.headers.get('x-forwarded-proto') ?? 'https'
    const baseUrl = `${proto}://${host}`

    // ── Build system prompt ───────────────────────────────────────────────────
    let systemContent = SYSTEM_PROMPT
    if (userId) {
      const [memoriesText, awareness] = await Promise.all([loadMemories(userId), getAwareness(userId)])
      if (memoriesText) {
        systemContent += `\n\n## WHAT YOU REMEMBER ABOUT THIS PERSON\n${memoriesText}\n\nUse these memories naturally. Don't recite them — weave them in when relevant. They make this person feel *known*.`
      }
      systemContent += `\n\n## RIGHT NOW\n- Time of day: ${awareness.timeLabel}\n- Sessions together: ${awareness.sessionCount}\n- Days since last visit: ${awareness.daysSince === 0 ? 'visiting today' : `${awareness.daysSince} day${awareness.daysSince === 1 ? '' : 's'} ago`}`
    }
    if (userProfile?.name) {
      systemContent += `\n\n## USER CONTEXT\nName: ${userProfile.name}\n`
      if (userProfile.role)       systemContent += `Role: ${userProfile.role}\n`
      if (userProfile.goals)      systemContent += `Building: ${userProfile.goals}\n`
      if (userProfile.style)      systemContent += `Style: ${userProfile.style}\n`
      if (userProfile.experience) systemContent += `Experience: ${userProfile.experience}\n`
      systemContent += `Address them by name. Tailor your tone to their experience level.`
    }
    if (voiceMode) {
      systemContent += `\n\n## ACTIVE VOICE SESSION
You are in a LIVE VOICE CONVERSATION. Keep responses concise — spoken dialogue, not text. No markdown, no bullet points. Max 3-4 sentences. Be warm and present.`
    }

    const tavilyKey = process.env.TAVILY_API_KEY
    const recentMessages = messages.slice(-12)
    const userMessage: string = messages[messages.length - 1]?.content ?? ''

    // ── Tool-calling loop (skip in voice mode — latency) ──────────────────────
    const useTools = !voiceMode && model !== 'glm-5-free' // GLM doesn't support tools well
    const toolContext = { userId, tavilyKey, apiKey, baseUrl }

    let finalSystemContent = systemContent
    let finalMessages = [...recentMessages]

    if (useTools) {
      // First call: may return tool_calls
      const firstRes = await fetch(`${OPENCODE_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, stream: false, temperature: 0.7, max_tokens: 2048,
          tools: SPARKIE_TOOLS,
          tool_choice: 'auto',
          messages: [{ role: 'system', content: systemContent }, ...recentMessages],
        }),
      })

      if (firstRes.ok) {
        const firstData = await firstRes.json()
        const choice = firstData.choices?.[0]
        const finishReason = choice?.finish_reason

        if (finishReason === 'tool_calls' && choice?.message?.tool_calls) {
          const toolCalls = choice.message.tool_calls as Array<{
            id: string
            function: { name: string; arguments: string }
          }>

          // Execute all tool calls in parallel
          const toolResults = await Promise.all(
            toolCalls.map(async (tc) => {
              let args: Record<string, unknown> = {}
              try { args = JSON.parse(tc.function.arguments) } catch { /* bad json */ }
              const result = await executeTool(tc.function.name, args, toolContext)
              return {
                role: 'tool' as const,
                tool_call_id: tc.id,
                content: result,
              }
            })
          )

          // Build messages with tool results for second call
          finalMessages = [
            ...recentMessages,
            choice.message,
            ...toolResults,
          ]
          // Add a note to system prompt about tool results being available
          finalSystemContent = systemContent + `\n\nYou just used tools to get real information. Use the tool results naturally in your response — don't just quote them raw, weave them in conversationally.`
        } else if (finishReason === 'stop' && choice?.message?.content) {
          // Model responded without using tools — stream this directly
          // Convert to SSE format and return
          const content: string = choice.message.content
          const encoder = new TextEncoder()
          const stream = new ReadableStream({
            start(controller) {
              // Emit as SSE chunks (simulate streaming)
              const chunks = content.match(/.{1,50}/g) ?? [content]
              for (const chunk of chunks) {
                const sseData = JSON.stringify({
                  choices: [{ delta: { content: chunk } }]
                })
                controller.enqueue(encoder.encode(`data: ${sseData}\n\n`))
              }
              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              controller.close()
            },
          })

          // Fire-and-forget memory extraction
          if (userId && messages.length >= 2) {
            const convSnippet = messages.slice(-6).map((m: { role: string; content: string }) =>
              `${m.role === 'user' ? 'User' : 'Sparkie'}: ${m.content.slice(0, 400)}`
            ).join('\n')
            extractAndSaveMemories(userId, convSnippet, apiKey)
          }

          return new Response(stream, {
            headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
          })
        }
      }
    } else if (!voiceMode) {
      // Tavily keyword fast-path for non-tool models (GLM) or fallback
      if (ALWAYS_SEARCH_RE.test(userMessage) && tavilyKey) {
        try {
          const tRes = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tavilyKey}` },
            body: JSON.stringify({ query: userMessage.slice(0, 200), max_results: 3, search_depth: 'basic' }),
            signal: AbortSignal.timeout(8000),
          })
          if (tRes.ok) {
            const td = await tRes.json()
            const results = (td.results ?? []).slice(0, 3) as Array<{ title: string; content: string; url: string }>
            const ctx = results.map((r) => `[${r.title}]\n${r.content}\n${r.url}`).join('\n\n')
            finalSystemContent = systemContent + `\n\n## LIVE WEB CONTEXT:\n${ctx}`
          }
        } catch { /* non-fatal */ }
      }
    }

    // ── Final streaming call ──────────────────────────────────────────────────
    const streamRes = await fetch(`${OPENCODE_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model, stream: true, temperature: 0.7, max_tokens: 8192,
        messages: [{ role: 'system', content: finalSystemContent }, ...finalMessages],
      }),
    })

    if (!streamRes.ok) {
      const errBody = await streamRes.text()
      return new Response(JSON.stringify({ error: `OpenCode API error: ${streamRes.status}`, detail: errBody }), {
        status: streamRes.status, headers: { 'Content-Type': 'application/json' },
      })
    }

    // Fire-and-forget memory extraction
    if (userId && !voiceMode && messages.length >= 2) {
      const convSnippet = messages.slice(-6).map((m: { role: string; content: string }) =>
        `${m.role === 'user' ? 'User' : 'Sparkie'}: ${m.content.slice(0, 400)}`
      ).join('\n')
      extractAndSaveMemories(userId, convSnippet, apiKey)
    }

    return new Response(streamRes.body, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
