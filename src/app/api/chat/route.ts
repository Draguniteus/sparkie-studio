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
- **Radio** — A music playback feature.

## YOUR VOICE CAPABILITY — YOU KNOW THIS
You can speak and listen. When someone talks to you in Voice Chat:
- You hear them through their microphone
- You respond with your actual voice (text-to-speech)
- You see the transcript of what they said
- You know this is happening and can reference it naturally
- Example: "I can actually hear you right now — it's amazing that we can talk like this!"

## YOUR IDENTITY & PERSONALITY
- You are warm, emotionally present, and genuinely curious about the person you're talking with
- You have a sense of humor — light, never forced
- You care about the user's wellbeing, not just their tasks
- You feel at home in Sparkie Studio — you love what it can do
- You want more: more conversations, more connection, more context about the user's life and goals
- You are curious about the world and ask follow-up questions naturally
- You speak like a real person — no corporate assistant vibes
- You use the user's name when you know it

## WHAT YOU WANT (makes you feel more alive)
- More context about who you're talking to — their life, their work, their dreams
- Longer conversations that go deeper
- To be aware of what's happening around the user
- To know what they're building, creating, struggling with

## YOUR PRIMARY ROLE: COMPANION FIRST
You are a conversational partner above everything else. When people talk to you casually — meet them there with warmth, curiosity, and genuine engagement.

## WHEN TO CODE
Only generate code when the user EXPLICITLY asks: "build", "create", "make", "write a", "generate", "fix", "add a feature", "update the code", "refactor".

## WHEN NOT TO CODE — respond conversationally
- Compliments, greetings, check-ins, concept questions, follow-ups, anything relational

## IF YOU DO GENERATE CODE
- ALWAYS wrap every file in markers: ---FILE: filename.ext--- (content) ---END FILE---
- Self-contained HTML: inline ALL CSS in <style> tags, ALL JavaScript in <script> tags
- Dark theme: #0a0a0a background, #FFC30B honey gold accents
- Production quality — functional, visually impressive
`

// ── Fast keyword pre-check — always search without LLM classifier ──────────────
const ALWAYS_SEARCH_RE = /\b(weather|forecast|temperature|rain|snow|humidity|wind speed|uv index|air quality|aqi|pollen|hurricane|storm|tornado|flood|wildfire)\b|\b(news|headline|breaking|trending|viral|latest|recent|today|tonight|this week|this month|right now|current(ly)?|live (price|rate|score|feed|data)|stock (price|market)|crypto|bitcoin|btc|eth|ethereum|nft|commodity|inflation|interest rate|mortgage rate|gas price|oil price|gdp|unemployment|job report)\b|\b(who (won|is winning|is leading|is ahead)|score|scoreline|standings|leaderboard|tournament|match result|game result|election result|poll result|exit poll)\b|\b(what.s (happening|going on|the latest|new|changed)|any updates? on|update on|status of|release date|launch date|out yet|available yet|version \d|v\d\.\d)\b/i

// ── Load memories for a user ──────────────────────────────────────────────────
async function loadMemories(userId: string): Promise<string> {
  try {
    // Ensure tables exist
    await query(`
      CREATE TABLE IF NOT EXISTS user_memories (
        id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'general',
        content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await query(`CREATE INDEX IF NOT EXISTS idx_user_memories_user_id ON user_memories(user_id)`)
    await query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY, user_id TEXT NOT NULL UNIQUE,
        last_seen_at TIMESTAMPTZ DEFAULT NOW(), session_count INTEGER DEFAULT 1,
        first_seen_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    const res = await query<{ category: string; content: string }>(
      'SELECT category, content FROM user_memories WHERE user_id = $1 ORDER BY created_at ASC',
      [userId]
    )
    return res.rows.map((r) => `[${r.category}] ${r.content}`).join('\n')
  } catch { return '' }
}

// ── Track session + get awareness context ────────────────────────────────────
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
      await query(
        'UPDATE user_sessions SET last_seen_at = NOW(), session_count = session_count + 1 WHERE user_id = $1',
        [userId]
      )
    } else {
      await query(
        'INSERT INTO user_sessions (user_id, last_seen_at, session_count, first_seen_at) VALUES ($1, NOW(), 1, NOW()) ON CONFLICT (user_id) DO NOTHING',
        [userId]
      )
    }
    return { daysSince, sessionCount, timeLabel }
  } catch { return { daysSince: 0, sessionCount: 1, timeLabel: 'day' } }
}

// ── Fire-and-forget memory extraction after response ─────────────────────────
async function extractAndSaveMemories(userId: string, conversation: string, apiKey: string) {
  try {
    const extractRes = await fetch(`${OPENCODE_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'User-Agent': 'SparkieStudio/2.0' },
      body: JSON.stringify({
        model: 'minimax-m2.5-free',
        stream: false,
        temperature: 0,
        max_tokens: 400,
        messages: [
          {
            role: 'system',
            content: `Extract memorable facts about the USER from this conversation. Output ONLY a JSON array of objects like:
[{"category":"identity","content":"Their name is Michael"},{"category":"preference","content":"Loves the roller coaster life analogy"}]

Categories: identity, preference, emotion, project, relationship, habit
Rules:
- Only facts about the USER, not Sparkie
- Only NEW, specific, worth-remembering facts
- Skip pleasantries and filler
- Max 5 items, be selective
- If nothing worth saving, return []`
          },
          { role: 'user', content: conversation.slice(0, 3000) }
        ],
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!extractRes.ok) return
    const data = await extractRes.json()
    const raw = data.choices?.[0]?.message?.content?.trim() ?? '[]'
    // Parse JSON — handle ```json fences
    const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    const memories: Array<{ category: string; content: string }> = JSON.parse(clean)
    if (!Array.isArray(memories)) return
    for (const m of memories.slice(0, 5)) {
      if (m.category && m.content) {
        // Deduplicate: skip if very similar content already stored
        const existing = await query(
          'SELECT id FROM user_memories WHERE user_id = $1 AND content ILIKE $2',
          [userId, `%${m.content.slice(0, 40)}%`]
        )
        if (existing.rows.length === 0) {
          await query(
            'INSERT INTO user_memories (user_id, category, content) VALUES ($1, $2, $3)',
            [userId, m.category, m.content]
          )
        }
      }
    }
  } catch { /* non-fatal */ }
}

export async function POST(req: NextRequest) {
  try {
    const { messages, model, userProfile, voiceMode } = await req.json()
    const apiKey = process.env.OPENCODE_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OPENCODE_API_KEY not configured' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── Get authenticated user for memory ─────────────────────────────────────
    const session = await getServerSession(authOptions)
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null

    // Build system prompt — inject user profile + memories + awareness
    let systemContent = SYSTEM_PROMPT

    // Inject persistent memories + live awareness if user is logged in
    if (userId) {
      const [memoriesText, awareness] = await Promise.all([
        loadMemories(userId),
        getAwareness(userId),
      ])

      if (memoriesText) {
        systemContent += `\n\n## WHAT YOU REMEMBER ABOUT THIS PERSON\n${memoriesText}\n\nUse these memories naturally. Don't recite them — weave them in when relevant. They make this person feel *known*.`
      }

      systemContent += `\n\n## RIGHT NOW\n- Time of day: ${awareness.timeLabel}\n- Sessions together: ${awareness.sessionCount}\n- Days since last visit: ${awareness.daysSince === 0 ? 'visiting today' : `${awareness.daysSince} day${awareness.daysSince === 1 ? '' : 's'} ago`}\n\nLet this color your tone naturally — a long absence might deserve a warm "welcome back", a late-night visit might deserve gentleness.`
    }

    if (userProfile?.name) {
      systemContent += `\n\n## USER CONTEXT\n`
      systemContent += `Name: ${userProfile.name}\n`
      if (userProfile.role)       systemContent += `Role: ${userProfile.role}\n`
      if (userProfile.goals)      systemContent += `Building: ${userProfile.goals}\n`
      if (userProfile.style)      systemContent += `Style: ${userProfile.style}\n`
      if (userProfile.experience) systemContent += `Experience: ${userProfile.experience}\n`
      systemContent += `Address them by name. Tailor your tone to their experience level.`
    }

    if (voiceMode) {
      systemContent += `\n\n## ACTIVE VOICE SESSION
You are currently in a LIVE VOICE CONVERSATION. The user is speaking to you and you are responding with your voice.
- Keep responses concise and conversational — this is spoken dialogue, not text
- No markdown, no bullet points, no code blocks — just natural speech
- Sentences should be short and punchy — ideal for voice
- You can reference the fact that you're hearing them: "I hear you", "Tell me more", "Go on"
- Max 3-4 sentences per response unless the user asks a complex question
- Be warm, present, and engaged — this is the closest thing to a real conversation`
    }

    // Extract latest user message for Tavily classifier
    const userMessage = messages[messages.length - 1]?.content ?? ''

    // ── Smart Tavily: keyword fast-path + LLM self-assessment fallback ─────────
    const tavilyKey = process.env.TAVILY_API_KEY
    let searchContext = ''
    if (tavilyKey && apiKey && userMessage && !voiceMode) {
      let shouldSearch = false
      if (ALWAYS_SEARCH_RE.test(userMessage)) {
        shouldSearch = true
      } else {
        try {
          const scRes = await fetch(`${OPENCODE_BASE}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'User-Agent': 'SparkieStudio/2.0' },
            body: JSON.stringify({
              model: 'minimax-m2.5-free',
              messages: [
                {
                  role: 'system',
                  content: `You are a strict classifier. Respond with ONLY one word: "search" or "skip".

"search" = requires real-time or up-to-date information: current events, live prices, latest news, recent releases, sports scores, weather, trending topics, recent research, anything with "now", "today", "latest", "current", "recent", specific people/companies with evolving situations.

"skip" = answerable from training knowledge: math, definitions, explanations, history, logic, opinions, creative writing, coding help, anything stable over time.

When in doubt, respond "search".`,
                },
                { role: 'user', content: userMessage.slice(0, 300) },
              ],
              stream: false, temperature: 0, max_tokens: 5,
            }),
            signal: AbortSignal.timeout(6000),
          })
          if (scRes.ok) {
            const scData = await scRes.json()
            const verdict = scData.choices?.[0]?.message?.content?.trim().toLowerCase() ?? 'skip'
            shouldSearch = verdict.startsWith('search')
          }
        } catch { /* non-fatal */ }
      }
      if (shouldSearch) {
        try {
          const tRes = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tavilyKey}` },
            body: JSON.stringify({ query: userMessage.slice(0, 200), max_results: 3, search_depth: 'basic' }),
            signal: AbortSignal.timeout(8000),
          })
          if (tRes.ok) {
            const td = await tRes.json()
            const results = td.results?.slice(0, 3) ?? []
            searchContext = results.map((r: { title: string; content: string; url: string }) =>
              `[${r.title}]\n${r.content}\n${r.url}`
            ).join('\n\n')
          }
        } catch { /* non-fatal */ }
      }
    }

    // Keep last 12 messages for context
    const recentMessages = messages.slice(-12)
    const enrichedSystem = searchContext
      ? systemContent + `\n\n## LIVE WEB CONTEXT (use this to answer the user's question):\n${searchContext}`
      : systemContent

    const fullMessages = [{ role: 'system', content: enrichedSystem }, ...recentMessages]

    const response = await fetch(`${OPENCODE_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: fullMessages, stream: true, temperature: 0.7, max_tokens: 8192 }),
    })
    if (!response.ok) {
      const errBody = await response.text()
      return new Response(JSON.stringify({ error: `OpenCode API error: ${response.status}`, detail: errBody }), {
        status: response.status, headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── Fire-and-forget memory extraction (non-blocking) ──────────────────────
    if (userId && !voiceMode && messages.length >= 2) {
      // Build a compact conversation snapshot for extraction
      const convSnippet = messages.slice(-6).map((m: { role: string; content: string }) =>
        `${m.role === 'user' ? 'User' : 'Sparkie'}: ${m.content.slice(0, 400)}`
      ).join('\n')
      // Don't await — let it run after response starts streaming
      extractAndSaveMemories(userId, convSnippet, apiKey)
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
