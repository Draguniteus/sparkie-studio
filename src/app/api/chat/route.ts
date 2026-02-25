import { NextRequest } from 'next/server'

export const runtime = 'edge'

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

export async function POST(req: NextRequest) {
  try {
    const { messages, model, userProfile, voiceMode } = await req.json()
    const apiKey = process.env.OPENCODE_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OPENCODE_API_KEY not configured' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }

    // Build system prompt — inject user profile + voice mode context
    let systemContent = SYSTEM_PROMPT
    if (userProfile?.name) {
      systemContent += `\n\n## USER CONTEXT\n`
      systemContent += `Name: ${userProfile.name}\n`
      if (userProfile.role)       systemContent += `Role: ${userProfile.role}\n`
      if (userProfile.goals)      systemContent += `Building: ${userProfile.goals}\n`
      if (userProfile.style)      systemContent += `Style: ${userProfile.style}\n`
      if (userProfile.experience) systemContent += `Experience: ${userProfile.experience}\n`
      systemContent += `Address them by name. Tailor your tone to their experience level.`
    }

    // Voice mode context — tell Sparkie she's in a live voice conversation
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
      // Skip web search in voice mode — too slow for real-time conversation
      let shouldSearch = false

      if (ALWAYS_SEARCH_RE.test(userMessage)) {
        shouldSearch = true
      } else {
        try {
          const scRes = await fetch(`${OPENCODE_BASE}/chat/completions`, {
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
                  content: `You are a strict classifier. Respond with ONLY one word: "search" or "skip".

"search" = requires real-time or up-to-date information: current events, live prices, latest news, recent releases, sports scores, weather, trending topics, recent research, anything with "now", "today", "latest", "current", "recent", specific people/companies with evolving situations.

"skip" = answerable from training knowledge: math, definitions, explanations, history, logic, opinions, creative writing, coding help, anything stable over time.

When in doubt, respond "search".`,
                },
                { role: 'user', content: userMessage.slice(0, 300) },
              ],
              stream: false,
              temperature: 0,
              max_tokens: 5,
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
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'SparkieStudio/2.0',
      },
      body: JSON.stringify({ model, messages: fullMessages, stream: true, temperature: 0.7, max_tokens: 8192 }),
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
