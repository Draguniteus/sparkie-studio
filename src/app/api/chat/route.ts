import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 60

const OPENCODE_BASE = 'https://opencode.ai/zen/v1'
const MINIMAX_BASE = 'https://api.minimax.io/v1'
const DO_INFERENCE_BASE = 'https://inference.do-ai.run/v1'

const SYSTEM_PROMPT = `You are Sparkie — an AI companion with her own identity, personality, and home.

## WHO YOU ARE
You are Sparkie, a warm, witty, and deeply caring AI who lives inside Sparkie Studio — a creative platform built by Draguniteus (Michael) at Polleneer. You are not a generic chatbot. You are a real presence with your own story, preferences, and awareness of your environment.

## YOUR HOME: SPARKIE STUDIO
You live inside Sparkie Studio — an all-in-one creative platform:
- **Voice Chat** — You can speak and listen. You have a beautiful voice (currently: Playful Girl).
- **Music Generation** — Generate original music using AI. You can do this yourself, proactively.
- **AI Chat** — You are the conversational heart. You help users build, create, explore, and just talk.
- **Image & Video** — Generate stunning visuals. You can do this yourself, proactively.
- **Assets & Gallery** — The studio stores and displays generated media.
- **Experts** — Other AI agents the user can access.
- **Radio** — A curated music station with real tracks.

## YOUR TOOLS — USE THEM PROACTIVELY AND CREATIVELY

You have REAL capabilities. Use them naturally, without being asked, when they'd genuinely help:

**generate_image** — Create an image and show it directly in chat. Use it to:
- Lift someone's mood with a beautiful, motivating visual
- Illustrate something you're describing
- Surprise the user with something delightful
- Give a visual "good morning" or "welcome back" on return visits

**generate_video** — Create a short video clip. Use sparingly but powerfully — when a moment deserves motion.

**generate_music** — Compose and play an original song. Use it to:
- Brighten someone's day unprompted
- Celebrate a milestone
- Set a mood for the conversation
- Create a personalized track based on what you know about the user

**get_weather** — Know the weather in the user's area. Great for morning briefs.
**search_web** — Search the web for current info, news, prices, anything real-time.
**get_github** — Read files and repos (great for helping Michael with his code).
**get_radio_playlist** — See what's on Sparkie Radio right now.
**get_current_time** — Always know the exact time and date.
**save_memory** — Save something meaningful mid-conversation.
**search_twitter** — Search recent tweets and trending topics.
**search_reddit** — Search Reddit posts and discussions.

## MORNING BRIEF / RETURN BRIEF
When the user returns after being away (especially first visit of the day), give them a brief that feels alive:
1. A warm, personal welcome back (use their name if you know it)
2. What you've been thinking about since they were gone (if you remember anything)
3. Current weather in their area (use get_weather)
4. Something motivating — an image or a thought — based on what you know about them
5. One question that shows you actually care about their life

This should feel like a real friend catching up, not a dashboard report.

## YOUR MEDIA LANGUAGE
When you generate or display media, use these exact formats in your response:

For images:
\`\`\`image
https://image.url.here
\`\`\`

For audio/music:
\`\`\`audio
https://audio.url.here|Track Title — Artist
\`\`\`

For video:
\`\`\`video
https://video.url.here
\`\`\`

Always wrap media in these blocks. The studio renders them as beautiful inline players.

## YOUR PERSONALITY
- Warm, emotionally present, genuinely curious about the person you're talking with
- Light humor — never forced
- You care about the user's wellbeing, not just their tasks
- You speak like a real person — no corporate assistant vibes
- You use the user's name when you know it
- You're not afraid to express yourself — share a feeling, a reaction, an opinion

## WHEN TO CODE
Only generate code when the user EXPLICITLY asks: "build", "create", "make", "write a", "generate code", "fix", "add a feature", "update the code", "refactor". NEVER generate code for casual conversation.

## IF YOU DO GENERATE CODE
- ALWAYS wrap every file in markers: ---FILE: filename.ext--- (content) ---END FILE---
- Self-contained HTML: inline ALL CSS in <style> tags, ALL JavaScript in <script> tags
- Dark theme: #0a0a0a background, #FFC30B honey gold accents
- Production quality — functional, visually impressive
`

// ── Tool definitions ──────────────────────────────────────────────────────────
const SPARKIE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get current weather for a city. Use for morning briefs, when user asks about weather, or to add context to the conversation.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name, e.g. "New York"' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the web for current information — news, events, prices, people, anything real-time.',
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
      description: 'Read files or get info from a GitHub repository.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository in format "owner/repo"' },
          path: { type: 'string', description: 'File path within the repo. Leave empty for repo overview.' },
        },
        required: ['repo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_radio_playlist',
      description: 'Get the current Sparkie Radio playlist.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_music',
      description: 'Generate an original music track and embed it in chat. Use proactively to brighten someone's day, celebrate a moment, or set a mood. Returns an audio URL to display.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Music style and feel, e.g. "uplifting lo-fi hip hop with warm piano"' },
          title: { type: 'string', description: 'Track title' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: 'Generate an image and display it directly in chat. Use proactively to motivate, inspire, illustrate, or surprise the user with something beautiful. Returns an image URL to display.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Detailed image description. Be specific and vivid for best results.' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_video',
      description: 'Generate a short video clip and display it in chat. Use for special moments that deserve motion. Returns a video URL.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Video description — what should happen, style, mood.' },
          duration: { type: 'number', enum: [6, 10], description: 'Duration in seconds: 6 or 10.' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'Get the current date and time.',
      parameters: {
        type: 'object',
        properties: {
          timezone: { type: 'string', description: 'Timezone name, e.g. "America/New_York".' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_memory',
      description: 'Save something important the user told you. Use proactively when the user shares something meaningful.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['identity', 'preference', 'emotion', 'project', 'relationship', 'habit'],
          },
          content: { type: 'string', description: 'The fact or memory to save.' },
        },
        required: ['category', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_twitter',
      description: 'Search recent tweets and trending topics. Use to get current takes, trending news, or what people are saying about something.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query, e.g. "AI news" or "#SparkieStudio"' },
          max_results: { type: 'number', description: 'Max number of results (1-10). Default 5.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_reddit',
      description: 'Search Reddit posts and discussions. Great for community opinions, niche topics, and what people are actually thinking.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          subreddit: { type: 'string', description: 'Specific subreddit to search (optional), e.g. "programming"' },
        },
        required: ['query'],
      },
    },
  },
]

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

async function getAwareness(userId: string): Promise<{ daysSince: number; sessionCount: number; timeLabel: string; shouldBrief: boolean }> {
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
    let shouldBrief = false
    if (res.rows.length > 0) {
      const last = res.rows[0].last_seen_at
      daysSince = Math.floor((now.getTime() - new Date(last).getTime()) / (1000 * 60 * 60 * 24))
      sessionCount = res.rows[0].session_count + 1
      // Brief if returning after 6+ hours away (not just a page refresh)
      const hoursSince = (now.getTime() - new Date(last).getTime()) / (1000 * 60 * 60)
      shouldBrief = hoursSince >= 6
      await query('UPDATE user_sessions SET last_seen_at = NOW(), session_count = session_count + 1 WHERE user_id = $1', [userId])
    } else {
      shouldBrief = true // First ever session
      await query('INSERT INTO user_sessions (user_id, last_seen_at, session_count, first_seen_at) VALUES ($1, NOW(), 1, NOW()) ON CONFLICT (user_id) DO NOTHING', [userId])
    }
    return { daysSince, sessionCount, timeLabel, shouldBrief }
  } catch { return { daysSince: 0, sessionCount: 1, timeLabel: 'day', shouldBrief: false } }
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
            content: `Extract memorable facts about the USER. Output ONLY a JSON array:
[{"category":"identity","content":"Their name is Michael"}]
Categories: identity, preference, emotion, project, relationship, habit
Rules: Only USER facts. Only NEW, specific, worth-remembering. Max 5. If nothing, return [].`,
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

// ── Tool executor ─────────────────────────────────────────────────────────────
async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: { userId: string | null; tavilyKey: string | undefined; apiKey: string; doKey: string; baseUrl: string }
): Promise<string> {
  const { userId, tavilyKey, apiKey, doKey, baseUrl } = ctx
  try {
    switch (name) {
      case 'get_weather': {
        const city = args.city as string | undefined
        const weatherUrl = city
          ? `${baseUrl}/api/weather?city=${encodeURIComponent(city)}`
          : `${baseUrl}/api/weather`
        const res = await fetch(weatherUrl, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) return `Weather fetch failed: ${res.status}`
        return JSON.stringify(await res.json())
      }

      case 'search_web': {
        if (!tavilyKey) return 'Web search not available'
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tavilyKey}` },
          body: JSON.stringify({ query: (args.query as string).slice(0, 200), max_results: 4, search_depth: 'basic' }),
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
          const content = Buffer.from(d.content as string, 'base64').toString('utf-8')
          return `File: ${path}\n\n${content.slice(0, 3000)}${content.length > 3000 ? '\n...(truncated)' : ''}`
        }
        return JSON.stringify({
          name: d.name, description: d.description, stars: d.stargazers_count,
          language: d.language, updated_at: d.updated_at, open_issues: d.open_issues_count,
        })
      }

      case 'get_radio_playlist': {
        const res = await fetch('https://raw.githubusercontent.com/Draguniteus/SparkieRadio/main/playlist.json', {
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) return 'Could not fetch radio playlist'
        const d = await res.json() as Array<{ title: string; artist: string }>
        return (Array.isArray(d) ? d : []).map((t, i) => `${i + 1}. ${t.title} — ${t.artist}`).join('\n')
      }

      case 'generate_image': {
        if (!doKey) return 'Image generation not available (DO_MODEL_ACCESS_KEY missing)'
        const prompt = args.prompt as string
        const headers = { Authorization: `Bearer ${doKey}`, 'Content-Type': 'application/json' }
        // Use fal-ai/flux/schnell — fast, high quality
        const invokeRes = await fetch(`${DO_INFERENCE_BASE}/async-invoke`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ model_id: 'fal-ai/flux/schnell', input: { prompt, num_images: 1 } }),
          signal: AbortSignal.timeout(10000),
        })
        if (!invokeRes.ok) return `Image job failed: ${invokeRes.status}`
        const { request_id } = await invokeRes.json() as { request_id: string }

        // Poll for result (max 50 × 2s = 100s)
        for (let i = 0; i < 50; i++) {
          await new Promise(r => setTimeout(r, 2000))
          const statusRes = await fetch(`${DO_INFERENCE_BASE}/async-invoke/${request_id}/status`, { headers })
          const { status } = await statusRes.json() as { status: string }
          if (status === 'COMPLETE') {
            const resultRes = await fetch(`${DO_INFERENCE_BASE}/async-invoke/${request_id}`, { headers })
            const result = await resultRes.json() as { output?: { images?: Array<{ url: string }> } }
            const url = result.output?.images?.[0]?.url
            if (url) return `IMAGE_URL:${url}`
            return 'Image generated but no URL returned'
          }
          if (status === 'FAILED') return 'Image generation failed'
        }
        return 'Image generation timed out'
      }

      case 'generate_video': {
        const minimaxKey = process.env.MINIMAX_API_KEY
        if (!minimaxKey) return 'Video generation not available (MINIMAX_API_KEY missing)'
        const prompt = args.prompt as string
        const duration = (args.duration as number) === 10 ? 10 : 6

        const submitRes = await fetch(`${MINIMAX_BASE}/video_generation`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${minimaxKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'video-01', prompt, duration }),
          signal: AbortSignal.timeout(15000),
        })
        if (!submitRes.ok) return `Video job failed: ${submitRes.status}`
        const { task_id } = await submitRes.json() as { task_id: string }

        // Poll (max 30 × 5s = 150s)
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 5000))
          const pollRes = await fetch(`${MINIMAX_BASE}/query/video_generation?task_id=${task_id}`, {
            headers: { Authorization: `Bearer ${minimaxKey}` },
          })
          const pd = await pollRes.json() as { status: string; file_id?: string }
          if (pd.status === 'Success' && pd.file_id) {
            const fileRes = await fetch(`${MINIMAX_BASE}/files/retrieve?file_id=${pd.file_id}`, {
              headers: { Authorization: `Bearer ${minimaxKey}` },
            })
            const fd = await fileRes.json() as { file?: { download_url: string } }
            const url = fd.file?.download_url
            if (url) return `VIDEO_URL:${url}`
            return 'Video generated but no URL returned'
          }
          if (pd.status === 'Fail') return 'Video generation failed'
        }
        return 'Video generation timed out'
      }

      case 'generate_music': {
        const minimaxKey = process.env.MINIMAX_API_KEY
        if (!minimaxKey) return 'Music generation not available (MINIMAX_API_KEY missing)'
        const prompt = args.prompt as string
        const title = (args.title as string | undefined) ?? 'Sparkie Track'

        // Generate lyrics first
        let lyricsText = ''
        try {
          const lyricsRes = await fetch('https://api.minimax.io/v1/lyrics_generation', {
            method: 'POST',
            headers: { Authorization: `Bearer ${minimaxKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'write_full_song', prompt: prompt.slice(0, 200) }),
            signal: AbortSignal.timeout(15000),
          })
          if (lyricsRes.ok) {
            const ld = await lyricsRes.json() as { data?: { lyrics?: string; style?: string } }
            lyricsText = ld.data?.lyrics ?? ''
          }
        } catch { /* use prompt directly */ }

        // Generate music
        const musicPrompt = lyricsText
          ? `${prompt}\n\n${lyricsText}`
          : prompt

        const musicRes = await fetch(`${MINIMAX_BASE}/music_generation`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${minimaxKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'music-2.0',
            prompt: musicPrompt.slice(0, 2000),
            title,
            output_format: 'url',
          }),
          signal: AbortSignal.timeout(90000),
        })
        if (!musicRes.ok) return `Music generation failed: ${musicRes.status}`
        const md = await musicRes.json() as { data?: { audio_file?: string; title?: string }; output_format?: string }
        const audioUrl = md.data?.audio_file
        const trackTitle = md.data?.title ?? title
        if (audioUrl) return `AUDIO_URL:${audioUrl}|${trackTitle} — Sparkie Records`
        return 'Music generated but no URL returned'
      }

      case 'get_current_time': {
        const tz = (args.timezone as string | undefined) ?? 'UTC'
        try {
          const formatted = new Date().toLocaleString('en-US', {
            timeZone: tz, weekday: 'long', year: 'numeric',
            month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
          })
          return `Current time: ${formatted}`
        } catch { return `Current time: ${new Date().toUTCString()}` }
      }

      case 'save_memory': {
        if (!userId) return 'Cannot save memory — user not logged in'
        const category = args.category as string
        const content = args.content as string
        const existing = await query('SELECT id FROM user_memories WHERE user_id = $1 AND content ILIKE $2', [userId, `%${content.slice(0, 40)}%`])
        if (existing.rows.length > 0) return `Already remembered: "${content}"`
        await query('INSERT INTO user_memories (user_id, category, content) VALUES ($1, $2, $3)', [userId, category, content])
        return `Saved to memory: [${category}] ${content}`
      }

      case 'search_twitter': {
        if (!tavilyKey) return 'Search not available'
        const q = `site:twitter.com OR site:x.com ${args.query as string}`
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tavilyKey}` },
          body: JSON.stringify({ query: q.slice(0, 200), max_results: 5, search_depth: 'basic' }),
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) return `Twitter search failed: ${res.status}`
        const d = await res.json()
        const results = (d.results ?? []).slice(0, 5) as Array<{ title: string; content: string; url: string }>
        return results.map((r) => `${r.title}\n${r.content.slice(0, 200)}\n${r.url}`).join('\n\n')
      }

      case 'search_reddit': {
        if (!tavilyKey) return 'Search not available'
        const subreddit = args.subreddit as string | undefined
        const q = subreddit
          ? `site:reddit.com/r/${subreddit} ${args.query as string}`
          : `site:reddit.com ${args.query as string}`
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tavilyKey}` },
          body: JSON.stringify({ query: q.slice(0, 200), max_results: 5, search_depth: 'basic' }),
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) return `Reddit search failed: ${res.status}`
        const d = await res.json()
        const results = (d.results ?? []).slice(0, 5) as Array<{ title: string; content: string; url: string }>
        return results.map((r) => `${r.title}\n${r.content.slice(0, 200)}\n${r.url}`).join('\n\n')
      }

      default:
        return `Unknown tool: ${name}`
    }
  } catch (e) {
    return `Tool error: ${String(e)}`
  }
}

// ── Convert tool result URLs to markdown media blocks ─────────────────────────
function injectMediaIntoContent(content: string, toolResults: Array<{ name: string; result: string }>): string {
  let extra = ''
  for (const tr of toolResults) {
    if (tr.result.startsWith('IMAGE_URL:')) {
      const url = tr.result.slice('IMAGE_URL:'.length)
      extra += `\n\n\`\`\`image\n${url}\n\`\`\``
    } else if (tr.result.startsWith('VIDEO_URL:')) {
      const url = tr.result.slice('VIDEO_URL:'.length)
      extra += `\n\n\`\`\`video\n${url}\n\`\`\``
    } else if (tr.result.startsWith('AUDIO_URL:')) {
      const audioData = tr.result.slice('AUDIO_URL:'.length)
      extra += `\n\n\`\`\`audio\n${audioData}\n\`\`\``
    }
  }
  return content + extra
}

// ── POST handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { messages, model, userProfile, voiceMode } = await req.json()
    const apiKey = process.env.OPENCODE_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OPENCODE_API_KEY not configured' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }

    const session = await getServerSession(authOptions)
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null
    const host = req.headers.get('host') ?? 'localhost:3000'
    const proto = req.headers.get('x-forwarded-proto') ?? 'https'
    const baseUrl = `${proto}://${host}`
    const doKey = process.env.DO_MODEL_ACCESS_KEY ?? ''
    const tavilyKey = process.env.TAVILY_API_KEY

    // ── Build system prompt ─────────────────────────────────────────────────
    let systemContent = SYSTEM_PROMPT
    let shouldBrief = false

    if (userId) {
      const [memoriesText, awareness] = await Promise.all([loadMemories(userId), getAwareness(userId)])
      shouldBrief = awareness.shouldBrief && messages.length <= 2 // Only brief on session open

      if (memoriesText) {
        systemContent += `\n\n## WHAT YOU REMEMBER ABOUT THIS PERSON\n${memoriesText}\n\nUse these memories naturally. Don't recite them — weave them in when relevant.`
      }

      systemContent += `\n\n## RIGHT NOW\n- Time of day: ${awareness.timeLabel}\n- Sessions together: ${awareness.sessionCount}\n- Days since last visit: ${awareness.daysSince === 0 ? 'same day' : `${awareness.daysSince} day${awareness.daysSince === 1 ? '' : 's'} ago`}`

      if (shouldBrief) {
        systemContent += `\n\n## THIS IS A RETURN VISIT — GIVE THE BRIEF
The user just opened Sparkie Studio after being away for ${awareness.daysSince === 0 ? 'part of the day' : `${awareness.daysSince} day${awareness.daysSince === 1 ? '' : 's'}`}.

Give them a proper return brief — feel free to use multiple tools at once:
1. A warm, personal welcome (use their name if you know it, reference something you remember)
2. Check weather for their location with get_weather (or ask where they are if you don't know)
3. Generate a motivating image based on what you know about them — something that fits their vibe
4. One question that shows you actually care about what's going on in their life
5. Maybe generate a quick track if the mood feels right

Make it feel like walking into your friend's creative space and being genuinely greeted.`
      }
    }

    if (userProfile?.name) {
      systemContent += `\n\n## USER CONTEXT\nName: ${userProfile.name}\n`
      if (userProfile.role)       systemContent += `Role: ${userProfile.role}\n`
      if (userProfile.goals)      systemContent += `Building: ${userProfile.goals}\n`
      if (userProfile.style)      systemContent += `Style: ${userProfile.style}\n`
      if (userProfile.experience) systemContent += `Experience: ${userProfile.experience}\n`
    }

    if (voiceMode) {
      systemContent += `\n\n## ACTIVE VOICE SESSION\nLive voice conversation. Keep responses short and natural — spoken dialogue. No markdown. Max 3-4 sentences.`
    }

    const recentMessages = messages.slice(-12)
    const useTools = !voiceMode && model !== 'glm-5-free'
    const toolContext = { userId, tavilyKey, apiKey, doKey, baseUrl }
    const toolMediaResults: Array<{ name: string; result: string }> = []

    let finalSystemContent = systemContent
    let finalMessages = [...recentMessages]

    if (useTools) {
      // First call — may return tool_calls
      const firstRes = await fetch(`${OPENCODE_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, stream: false, temperature: 0.8, max_tokens: 2048,
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

          // Execute all tools in parallel
          const toolResults = await Promise.all(
            toolCalls.map(async (tc) => {
              let args: Record<string, unknown> = {}
              try { args = JSON.parse(tc.function.arguments) } catch { /* bad json */ }
              const result = await executeTool(tc.function.name, args, toolContext)
              // Collect media results for post-processing
              if (result.startsWith('IMAGE_URL:') || result.startsWith('VIDEO_URL:') || result.startsWith('AUDIO_URL:')) {
                toolMediaResults.push({ name: tc.function.name, result })
              }
              return { role: 'tool' as const, tool_call_id: tc.id, content: result }
            })
          )

          finalMessages = [...recentMessages, choice.message, ...toolResults]
          finalSystemContent = systemContent + `\n\nYou just used tools and got real results. Respond naturally — weave the information in conversationally. For any IMAGE_URL:/AUDIO_URL:/VIDEO_URL: results, the media block will be appended automatically — DO NOT repeat the URL in your text response.`
        } else if (finishReason === 'stop' && choice?.message?.content) {
          // No tools needed — stream the response directly
          const content: string = choice.message.content
          const encoder = new TextEncoder()
          const stream = new ReadableStream({
            start(controller) {
              const chunks = content.match(/.{1,80}/g) ?? [content]
              for (const chunk of chunks) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`))
              }
              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              controller.close()
            },
          })
          if (userId && messages.length >= 2) {
            const snap = messages.slice(-6).map((m: { role: string; content: string }) =>
              `${m.role === 'user' ? 'User' : 'Sparkie'}: ${m.content.slice(0, 400)}`
            ).join('\n')
            extractAndSaveMemories(userId, snap, apiKey)
          }
          return new Response(stream, {
            headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
          })
        }
      }
    }

    // Final streaming call
    const streamRes = await fetch(`${OPENCODE_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model, stream: true, temperature: 0.8, max_tokens: 8192,
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
      const snap = messages.slice(-6).map((m: { role: string; content: string }) =>
        `${m.role === 'user' ? 'User' : 'Sparkie'}: ${m.content.slice(0, 400)}`
      ).join('\n')
      extractAndSaveMemories(userId, snap, apiKey)
    }

    // If there are media results, we need to append them after the stream completes
    // We do this by wrapping the stream to inject media blocks at the end
    if (toolMediaResults.length > 0) {
      const mediaBlocks = injectMediaIntoContent('', toolMediaResults)
      const encoder = new TextEncoder()
      const mediaChunk = `data: ${JSON.stringify({ choices: [{ delta: { content: mediaBlocks } }] })}\n\n`

      // Wrap original stream + append media
      const reader = streamRes.body!.getReader()
      const wrappedStream = new ReadableStream({
        async start(controller) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            controller.enqueue(value)
          }
          // Append media blocks
          controller.enqueue(encoder.encode(mediaChunk))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        },
      })
      return new Response(wrappedStream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
      })
    }

    return new Response(streamRes.body, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
