import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 300

// MiniMax Music Generation (synchronous)
// POST https://api.minimax.io/v1/music_generation
// Body: { model, prompt, lyrics, audio_setting }  ← lyrics is REQUIRED by MiniMax
// Response: { data: { audio: "<hex>", status: 2 }, base_resp: { status_code: 0 } }
// audio field is HEX-encoded → Buffer.from(hex, 'hex').toString('base64')

// ACE Music (api.acemusic.ai)
// POST /release_task → { task_id }
// GET  /query_result?task_id=xxx → poll → { status, audio_url }

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
 *
 * The user pastes one big text that looks like:
 *   Song Title: "..."
 *   Style / Vibe: ... (used as MiniMax `prompt`)
 *   [Verse 1] ...
 *   [Pre-Chorus] ...
 *   [Chorus] ...
 *   ... (this whole structured block becomes MiniMax `lyrics`)
 *
 * If no song structure tags are found, uses the full text as both
 * prompt and lyrics (MiniMax accepts this).
 */
function parseMusicPrompt(raw: string): { stylePrompt: string; lyrics: string } {
  const text = raw.trim()

  // Find first lyric structure tag: [Verse, [Pre-Chorus, [Chorus, [Bridge, [Outro, [Intro
  const lyricsTagRe = /\[(Verse|Pre-Chorus|Chorus|Bridge|Outro|Intro|Final Chorus|Hook)/i
  const tagMatch = lyricsTagRe.exec(text)

  if (tagMatch && tagMatch.index > 0) {
    // Everything before the first tag = style description (as MiniMax prompt)
    // Everything from the first tag onwards = lyrics
    let stylePart = text.slice(0, tagMatch.index).trim()
    const lyricsPart = text.slice(tagMatch.index).trim()

    // Clean up the style part — strip "Lyrics:" label if present
    stylePart = stylePart
      .replace(/\n?Lyrics\s*[\(\[].*?\]?\)?:?\s*$/im, '')
      .replace(/\n?Lyrics\s*:.*$/im, '')
      .trim()

    // If style part is too long, MiniMax prompt should be short & punchy — take last paragraph
    // (usually the concise style summary at the bottom of the user's prompt)
    const styleLines = stylePart.split('\n').filter(l => l.trim())
    const stylePrompt = styleLines.length > 6
      ? styleLines.slice(-4).join(' ').trim()
      : stylePart

    return { stylePrompt, lyrics: normalizeLyricsTags(lyricsPart) }
  }

  // No structured lyrics found — use entire text as both
  return { stylePrompt: text.slice(0, 500), lyrics: normalizeLyricsTags(text) }
}

/**
 * Normalize section tags to MiniMax-compatible lowercase format.
 * MiniMax expects: [verse], [chorus], [bridge], [outro], [intro], [pre-chorus]
 * Users write: [Verse 1], [Pre-Chorus], [Final Chorus – bigger, layered vocals], etc.
 * Non-standard tags and trailing descriptors (after em-dash/parenthesis) are stripped.
 */
function normalizeLyricsTags(lyrics: string): string {
  return lyrics.replace(/\[([^\]]+)\]/g, (_, inner) => {
    const s = inner.trim().toLowerCase()
    if (/\bverse\b/.test(s))       return '[verse]'
    if (/\bpre.?chorus\b/.test(s)) return '[pre-chorus]'
    if (/\bchorus\b/.test(s))      return '[chorus]'
    if (/\bbridge\b/.test(s))      return '[bridge]'
    if (/\boutro\b/.test(s))       return '[outro]'
    if (/\bintro\b/.test(s))       return '[intro]'
    if (/\bhook\b/.test(s))        return '[chorus]'
    // Unknown: strip em-dash/paren suffix, lowercase
    return `[${s.replace(/\s*[–—\-\(].*$/, '').trim()}]`
  })
}

async function generateAceMusic(prompt: string, lyrics?: string): Promise<string> {
  // ACE Music submit — bump timeout to 30s for cold GPU starts
  const taskRes = await fetch(`${ACE_MUSIC_BASE}/release_task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ACE_MUSIC_API_KEY}`,
    },
    body: JSON.stringify({ prompt, lyrics: lyrics || '', duration: 30 }),
    signal: AbortSignal.timeout(300000), // 5 min – ACE GPU cold starts can take 2-3 min
  })

  if (!taskRes.ok) {
    const err = await taskRes.json().catch(() => ({}))
    throw new Error(err.message || err.error || `ACE Music submit error (${taskRes.status})`)
  }

  const taskData = await taskRes.json()
  const taskId = taskData.task_id || taskData.id
  if (!taskId) throw new Error('ACE Music: no task_id returned')

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
    explicitLyrics = body.lyrics  // may be undefined — frontend doesn't send this field
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

  // Parse the combined prompt → extract style description + lyrics
  const { stylePrompt, lyrics } = parseMusicPrompt(rawPrompt)
  const finalLyrics = (explicitLyrics || lyrics).trim()
  const finalPrompt = stylePrompt.trim()

  // MiniMax music_generation requires BOTH prompt and lyrics
  const requestBody = {
    model: minimaxModel,
    prompt: finalPrompt,
    lyrics: finalLyrics,   // required — cannot be empty
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
      signal: AbortSignal.timeout(120000),
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

    const hexAudio = data?.data?.audio
    if (!hexAudio) {
      return new Response(
        JSON.stringify({ error: 'No audio returned from MiniMax. Verify your MINIMAX_API_KEY has music credits.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // MiniMax returns HEX-encoded audio → convert to base64 data URL
    const audioBase64 = Buffer.from(hexAudio, 'hex').toString('base64')

    return new Response(
      JSON.stringify({ url: `data:audio/mp3;base64,${audioBase64}`, model: minimaxModel }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Music generation failed'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
