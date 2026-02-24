import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 300

// MiniMax Music Generation (synchronous)
// POST https://api.minimax.io/v1/music_generation
// Body: { model, prompt, lyrics, audio_setting, output_format }
// output_format: 'url' → returns data.audio_url CDN link (24h expiry) instead of hex
//
// ⚠️  CRITICAL: Section tags MUST be Title Case with spaces:
//   [Intro] [Verse] [Pre Chorus] [Chorus] [Bridge] [Outro] [Interlude] [Post Chorus]
//   [Transition] [Break] [Hook] [Build Up] [Inst] [Solo]
//   Lowercase tags like [verse] or numbered tags like [Verse 1] → silent/invalid MP3
//
// ⚠️  LYRICS LENGTH: Keep lyrics under ~1200 chars. MiniMax generates a ~30-60s clip.
//   Sending 800+ words of lyrics causes slow generation → DO gateway timeout (60s limit).
//   Trim to Intro + Verse + Chorus only.

// ACE Music (api.acemusic.ai)
// POST /release_task → { task_id }
// GET  /query_result?task_id=xxx → poll → { status, audio_url }
// ⚠️  GPU cold starts 2-3 min; DO gateway 504s at ~30s → use 30s timeout + 3 retries

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
 * Normalize section tags to MiniMax Title Case format.
 * Strips inline descriptions like [Verse 1 – description text] → [Verse]
 */
function normalizeLyricsTags(lyrics: string): string {
  return lyrics.replace(/\[([^\]]+)\]/g, (_, inner) => {
    // Strip everything after – — - ( to remove inline production notes
    const cleaned = inner.replace(/\s*[–—\-\(].*$/, '').replace(/\s+\d+$/, '').trim()
    const s = cleaned.toLowerCase()
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
    if (/\bfinal\s+chorus\b/.test(s))                 return '[Chorus]'
    return '[' + cleaned.charAt(0).toUpperCase() + cleaned.slice(1) + ']'
  })
}

/**
 * Extract lyrics and style prompt from combined user paste.
 *
 * User format:
 *   [Intro – production note] lyric line
 *   [Verse 1 – production note] ...
 *   [Chorus – production note] ...
 *   ...
 *   Style description paragraph at end (no brackets)
 *
 * Strategy:
 * 1. Last untagged paragraph = style prompt (e.g. "Haunting dark country...")
 * 2. Everything with section tags = lyrics (strip inline descriptions from tags)
 * 3. Trim lyrics to keep only first ~1200 chars to avoid DO gateway timeout
 *    (MiniMax generates a 30-60s clip — it doesn't consume all lyrics anyway)
 */
function parseMusicPrompt(raw: string): { stylePrompt: string; lyrics: string } {
  const text = raw.trim()
  const paragraphs = text.split(/\n\n+/)

  // Detect if a paragraph is a "style block" (no section tags, descriptive text)
  const hasSectionTag = (p: string) => /\[\s*(Verse|Pre.?Chorus|Chorus|Bridge|Outro|Intro|Hook|Interlude|Post.?Chorus|Transition|Break|Build.?Up|Inst|Solo|Final)/i.test(p)

  // Extract style from last non-tagged paragraph
  let stylePrompt = ''
  let lyricParagraphs: string[] = []

  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const p = paragraphs[i].trim()
    if (!stylePrompt && !hasSectionTag(p) && p.length > 30) {
      stylePrompt = p.slice(0, 500)
    } else {
      lyricParagraphs.unshift(p)
    }
  }

  // If no separate style block found, try splitting at first tag
  if (!stylePrompt) {
    const lyricsTagRe = /\[\s*(Verse|Pre.?Chorus|Chorus|Bridge|Outro|Intro|Hook|Interlude|Post.?Chorus|Transition|Break|Build.?Up|Inst|Solo)/i
    const tagMatch = lyricsTagRe.exec(text)
    if (tagMatch && tagMatch.index > 0) {
      stylePrompt = text.slice(0, tagMatch.index).trim().slice(0, 500)
      lyricParagraphs = [text.slice(tagMatch.index)]
    } else {
      stylePrompt = text.slice(0, 500)
      lyricParagraphs = [text]
    }
  }

  // Build full lyrics from tagged paragraphs
  let fullLyrics = lyricParagraphs.join('\n\n').trim()
  fullLyrics = normalizeLyricsTags(fullLyrics)

  // Trim to ~1200 chars to stay within MiniMax's practical generation window
  // MiniMax produces 30-60s of audio — it won't use 800+ words of lyrics anyway
  // Trimming prevents the slow generation that causes DO gateway timeout
  if (fullLyrics.length > 1200) {
    // Cut at last newline before 1200 chars (don't cut mid-line)
    const cutPoint = fullLyrics.lastIndexOf('\n', 1200)
    fullLyrics = cutPoint > 600 ? fullLyrics.slice(0, cutPoint) : fullLyrics.slice(0, 1200)
  }

  return { stylePrompt: stylePrompt.trim(), lyrics: fullLyrics }
}

/**
 * Submit ACE Music task with 30s timeout + 3 retries.
 * DO gateway 504s at ~30s. GPU cold starts take 2-3 min on first hit.
 */
async function submitAceMusicTask(prompt: string, lyrics: string): Promise<string> {
  const MAX_ATTEMPTS = 3
  let lastErr: Error | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const taskRes = await fetch(`${ACE_MUSIC_BASE}/release_task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ACE_MUSIC_API_KEY}`,
        },
        body: JSON.stringify({ prompt, lyrics, duration: 30 }),
        signal: AbortSignal.timeout(30000),
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
      if (!isTimeout || attempt === MAX_ATTEMPTS) throw lastErr
      await sleep(5000)
    }
  }

  throw lastErr!
}

async function generateAceMusic(prompt: string, lyrics?: string): Promise<string> {
  const taskId = await submitAceMusicTask(prompt, lyrics || '')

  // Poll up to ~3.5 min, every 5s
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

  // ── ACE-Step free model ───────────────────────────────────────────────────
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

  // ── MiniMax models ────────────────────────────────────────────────────────
  const apiKey = process.env.MINIMAX_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'MINIMAX_API_KEY not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  const minimaxModel = MINIMAX_MODEL_MAP[model] || 'music-2.5'
  const { stylePrompt, lyrics } = parseMusicPrompt(rawPrompt)
  const finalLyrics = (explicitLyrics || lyrics).trim()
  const finalPrompt = stylePrompt.trim()

  const requestBody = {
    model: minimaxModel,
    prompt: finalPrompt,
    lyrics: finalLyrics,
    output_format: 'url',          // CDN link — avoids large hex payload timeout
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
      signal: AbortSignal.timeout(55000),   // 55s — under DO's 60s gateway limit
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

    // output_format: 'url' → data.data.audio_url (CDN, 24h expiry)
    const audioUrl = data?.data?.audio_url
    if (!audioUrl) {
      return new Response(
        JSON.stringify({ error: 'No audio URL returned from MiniMax. Verify MINIMAX_API_KEY has music credits.' }),
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
