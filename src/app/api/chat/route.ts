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
`

// ── Fast keyword pre-check — always search without LLM classifier ──────────────
// Catches obvious live-data queries instantly, no model call needed.
const ALWAYS_SEARCH_RE = /\b(weather|forecast|temperature|rain|snow|humidity|wind speed|uv index|air quality|aqi|pollen|hurricane|storm|tornado|flood|wildfire)\b|\b(news|headline|breaking|trending|viral|latest|recent|today|tonight|this week|this month|right now|current(ly)?|live (price|rate|score|feed|data)|stock (price|market)|crypto|bitcoin|btc|eth|ethereum|nft|commodity|inflation|interest rate|mortgage rate|gas price|oil price|gdp|unemployment|job report)\b|\b(who (won|is winning|is leading|is ahead)|score|scoreline|standings|leaderboard|tournament|match result|game result|election result|poll result|exit poll)\b|\b(what.s (happening|going on|the latest|new|changed)|any updates? on|update on|status of|release date|launch date|out yet|available yet|version \d|v\d\.\d)\b/i

export async function POST(req: NextRequest) {
  try {
    const { messages, model, userProfile } = await req.json()
    const apiKey = process.env.OPENCODE_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OPENCODE_API_KEY not configured' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }

    // Build system prompt — inject user profile if available
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

    // Extract latest user message for Tavily classifier
    const userMessage = messages[messages.length - 1]?.content ?? ''

    // ── Smart Tavily: keyword fast-path + LLM self-assessment fallback ─────────
    const tavilyKey = process.env.TAVILY_API_KEY
    let searchContext = ''
    if (tavilyKey && apiKey && userMessage) {
      let shouldSearch = false

      // 1. Fast keyword check — if it obviously needs live data, skip the LLM call
      if (ALWAYS_SEARCH_RE.test(userMessage)) {
        shouldSearch = true
      } else {
        // 2. LLM classifier for ambiguous queries
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
        } catch { /* non-fatal — defaults to skip */ }
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

    // Keep last 12 messages for context (trim to prevent token bloat)
    const recentMessages = messages.slice(-12)

    // Inject search context as system addendum if available
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
