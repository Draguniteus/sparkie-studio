import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 300

// MiniMax Music Generation (synchronous)
// POST https://api.minimax.io/v1/music_generation
// Body: { model, prompt, lyrics, audio_setting }  ← lyrics is REQUIRED by MiniMax
// Response (url mode): { data: { audio_url: "...", status: 2 }, base_resp: { status_code: 0 } }
// Using output_format: 'url' returns CDN link (expires 24h) — faster, avoids hex decode
//
// ⚠️  CRITICAL: Section tags MUST be Title Case with spaces:
//   [Intro] [Verse] [Pre Chorus] [Chorus] [Bridge] [Outro] [Interlude] [Post Chorus]
//   [Transition] [Break] [Hook] [Build Up] [Inst] [Solo]
//   Lowercase tags like [verse] or numbered tags like [Verse 1] → silent/invalid MP3

// ACE Music (api.acemusic.ai)
// POST /release_task → { task_id }
// GET  /query_result?task_id=xxx → poll → { status, audio_url }
// ⚠️  GPU cold starts take 2-3 min. Submit call itself may hang → use 30s timeout w/ retry

const MINIMAX_BASE = 'https://api.minimax.io/v1'
const ACE_MUSIC_BASE = 'https://api.acemusic.ai'
const ACE_MUSIC_API_KEY = 'd33f8bc6767445a98b608dbf56710d26'

const MINIMAX_MODEL_MAP: Record<string, string> = {
  'music-2.5':     'music-2.5',
  'music-2.0':     'music-2.0',
  'music-01':      'music-2.5',
  'music-01-lite': 'music-2.0',
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Extract lyrics and style prompt from a combined user message.
 */
function parseMusicPrompt(raw: string): { stylePrompt: string; lyrics: string } {
  const text = raw.trim()

  const lyricsTagRe = /\[\s*(Verse|Pre.?Chorus|Chorus|Bridge|Outro|Intro|Hook|Interlude|Post.?Chorus|Transition|Break|Build.?Up|Inst|Solo)/i
  const tagMatch = lyricsTagRe.exec(text)

  if (tagMatch && tagMatch.index > 0) {
    let stylePart = text.slice(0, tagMatch.index).trim()
    const lyricsPart = text.slice(tagMatch.index).trim()

    stylePart = stylePart
      .replace(/\n?Lyrics\s*[\(\[].*?\]?\)?:?\s*$/im, '')
      .replace(/\n?Lyrics\s*:.*$/im, '')
      .trim()

    const styleLines = stylePart.split('\n').filter(l => l.trim())
    const stylePrompt = styleLines.length > 6
      ? styleLines.slice(-4).join(' ').trim()
      : stylePart

    return { stylePrompt, lyrics: normalizeLyricsTags(lyricsPart) }
  }

  return { stylePrompt: text.slice(0, 500), lyrics: normalizeLyricsTags(text) }
}

/**
 * Normalize section tags to MiniMax-compatible Title Case format with spaces.
 */
function normalizeLyricsTags(lyrics: string): string {
  return lyrics.replace(/\[([^\]]+)\]/g, (_, inner) => {
    const s = inner.trim().toLowerCase()
    if (/\bverse\b/.test(s))                           return '[Verse]'
    if (/\bpre[\s\-]?chorus\b/.test(s))               return '[Pre Chorus]'
    if (/\bpost[\s\-]?chorus\b/.test(s))              return '[Post Chorus]'
    if (/\bchorus\b/.test(s))                          return '[Chorus]'
    if (/\bbridge\b/.test(s))                          return '[Bridge]'
    if (/\boutro\b/.test(s))                           return '[Outro]'
    if (/\bintro\b/.test(s))                           return '[Intro]'
    if (/\bhook\b/.test(s))                            return '[Hook]'
    if (/\binterlude\b/.test(s))                       return '[Interlude]'
    if (/\btransition\b/.test(s))                      return '[Transition]'
    if (/\bbreak\b/.test(s))                           return '[Break]'
    if (/\bbuild[\s\-]?up\b/.test(s))                 return '[Build Up]'
    if (/\binst\b|\binstrumental\b/.test(s))          return '[Inst]'
    if (/\bsolo\b/.test(s))                            return '[Solo]'
    const cleaned = s
      .replace(/\s*[–—\-\(].*$/, '')
      .replace(/\s+\d+$/, '')
      .trim()
    return '[' + cleaned.charAt(0).toUpperCase() + cleaned.slice(1) + ']'
  })
}

/**
 * Submit an ACE Music task with a short timeout + retry logic.
 * GPU cold starts cause the submit endpoint to hang for 2-3 min.
 * We use a 30s timeout per attempt and retry up to 3 times.
 */
async function submitAceMusicTask(prompt: string, lyrics: string): Promise<string> {
  const MAX_SUBMIT_ATTEMPTS = 3
  let lastErr: Error | null = null

  for (let attempt = 1; attempt <= MAX_SUBMIT_ATTEMPTS; attempt++) {
    try {
      const taskRes = await fetch(`${ACE_MUSIC_BASE}/release_task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ACE_MUSIC_API_KEY}`,
        },
        body: JSON.stringify({ prompt, lyrics, duration: 30 }),
        signal: AbortSignal.timeout(30000), // 30s per attempt — gateway won't 504 us
      })

      if (!taskRes.ok) {
        const err = await taskRes.json().catch(() => ({}))
        throw new Error(err.message || err.error || `ACE Music submit error (${taskRes.status})`)
      }

      const taskData = await taskRes.json()
      const taskId = taskData.task_id || taskData.id
      if (!taskId) throw new Error('ACE Music: no task_id returned')
      return taskId
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
      const isTimeout = lastErr.name === 'TimeoutError' || lastErr.message.includes('timed out') || lastErr.message.includes('abort')
      if (!isTimeout || attempt === MAX_SUBMIT_ATTEMPTS) throw lastErr
      // GPU cold start — wait 5s between submit retries
      await sleep(5000)
    }
  }

  throw lastErr!
}

async function generateAceMusic(prompt: string, lyrics?: string): Promise<string> {
  const taskId = await submitAceMusicTask(prompt, lyrics || '')

  // Poll for result (up to ~3.5 min, every 5s)
  for (let i = 0; i < 40; i++) {
    await sleep(5000)
    try {
      const pollRes = await fetch(`${ACE_MUSIC_BASE}/query_result?task_id=${taskId}`, {
        headers: { 'Authorization': `Bearer ${ACE_MUSIC_API_KEY}` },
        signal: AbortSignal.timeout(10000),
      })
      if (!pollRes.ok) continue

      const pollData = await pollRes.json()
      const status = pollData.status || pollData.state

      if (status === 'done' || status === 'completed' || status === 'success') {
        const audioUrl = pollData.audio_url || pollData.url || pollData.result?.audio_url
        if (audioUrl) return audioUrl
        throw new Error('ACE Music: completed but no audio URL in response')
      }
      if (status === 'failed' || status === 'error') {
        throw new Error(pollData.message || 'ACE Music generation failed')
      }
    } catch (pollErr) {
      if (pollErr instanceof Error && (
        pollErr.message.includes('ACE Music: completed') ||
        pollErr.message.includes('ACE Music: task')
      )) throw pollErr
    }
  }

  throw new Error('ACE Music: generation timed out. The server may be busy — try again in a moment.')
}

export async function POST(req: NextRequest) {
  let rawPrompt: string
  let model: string
  let explicitLyrics: string | undefined

  try {
    const body = await req.json()
    rawPrompt = body.prompt
    model = body.model || 'music-2.5'
    explicitLyrics = body.lyrics
    if (!rawPrompt) throw new Error('Missing prompt')
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── ACE-Step free model ──────────────────────────────────────────────────────
  if (model === 'ace-step-free') {
    const { stylePrompt, lyrics } = parseMusicPrompt(rawPrompt)
    try {
      const audioUrl = await generateAceMusic(stylePrompt, explicitLyrics || lyrics)
      return new Response(JSON.stringify({ url: audioUrl, model: 'ace-step-free' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ACE Music generation failed'
      return new Response(JSON.stringify({ error: msg }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // ── MiniMax models ───────────────────────────────────────────────────────────
  const apiKey = process.env.MINIMAX_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'MINIMAX_API_KEY not configured — add it to DigitalOcean environment variables' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  const minimaxModel = MINIMAX_MODEL_MAP[model] || 'music-2.5'

  const { stylePrompt, lyrics } = parseMusicPrompt(rawPrompt)
  const finalLyrics = (explicitLyrics || lyrics).trim()
  const finalPrompt = stylePrompt.trim()

  // Use output_format: 'url' — returns CDN link instead of hex-encoded audio
  // Significantly faster (avoids large hex payload) and stays well under DO's 60s HTTP timeout
  const requestBody = {
    model: minimaxModel,
    prompt: finalPrompt,
    lyrics: finalLyrics,
    output_format: 'url',
    audio_setting: {
      sample_rate: 44100,
      bitrate: 256000,
      format: 'mp3',
    },
  }

  try {
    const res = await fetch(`${MINIMAX_BASE}/music_generation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(55000), // 55s — safely under DO's 60s gateway limit
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      return new Response(
        JSON.stringify({ error: err.message || err.base_resp?.status_msg || err.error || `MiniMax error ${res.status}` }),
        { status: res.status, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const data = await res.json()

    if (data?.base_resp?.status_code !== 0) {
      return new Response(
        JSON.stringify({ error: data.base_resp?.status_msg || 'MiniMax API error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // output_format: 'url' → data.data.audio_url (CDN link, 24h expiry)
    const audioUrl = data?.data?.audio_url
    if (!audioUrl) {
      return new Response(
        JSON.stringify({ error: 'No audio URL returned from MiniMax. Verify your MINIMAX_API_KEY has music credits.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ url: audioUrl, model: minimaxModel }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Music generation failed'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
