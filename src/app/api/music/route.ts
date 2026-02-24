import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 300

// MiniMax Music Generation
// POST https://api.minimax.io/v1/music_generation
// music-2.5: output_format='url' → data.audio_url CDN link (fast, avoids hex payload timeout)
// music-2.0: no output_format → data.audio hex → decode to base64
//
// ACE Music (api.acemusic.ai) — SPLIT ARCHITECTURE:
// POST /api/music { model: 'ace-step-free', prompt } → { taskId, status: 'queued' } in <5s
// GET  /api/music?taskId=xxx → proxy to ACE /query_result → { status, url? }
// Frontend polls GET every 5s until status=done (sidesteps DO's 60s gateway limit)
//
// ⚠️  Section tags MUST be Title Case with spaces:
//   [Intro] [Verse] [Pre Chorus] [Chorus] [Bridge] [Outro] etc.
// ⚠️  Lyrics trimmed to ~1200 chars max (MiniMax 30-60s clip)

const MINIMAX_BASE = 'https://api.minimax.io/v1'
const ACE_MUSIC_BASE = 'https://api.acemusic.ai'
const ACE_MUSIC_API_KEY = 'd33f8bc6767445a98b608dbf56710d26'

const MINIMAX_MODEL_MAP: Record<string, string> = {
  'music-2.5':     'music-2.5',
  'music-2.0':     'music-2.0',
  'music-01':      'music-2.5',
  'music-01-lite': 'music-2.0',
}

// Only music-2.5 supports output_format:'url' (CDN link)
const URL_OUTPUT_SUPPORTED = new Set(['music-2.5', 'music-01'])

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeLyricsTags(lyrics: string): string {
  return lyrics.replace(/\[([^\]]+)\]/g, (_, inner) => {
    const cleaned = inner.replace(/\s*[–—\-\(].*$/, '').replace(/\s+\d+$/, '').trim()
    const s = cleaned.toLowerCase()
    if (/\bverse\b/.test(s))                           return '[Verse]'
    if (/\bpre[\s\-]?chorus\b/.test(s))               return '[Pre Chorus]'
    if (/\bpost[\s\-]?chorus\b/.test(s))              return '[Post Chorus]'
    if (/\bfinal\s+chorus\b/.test(s))                 return '[Chorus]'
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
    return '[' + cleaned.charAt(0).toUpperCase() + cleaned.slice(1) + ']'
  })
}

function parseMusicPrompt(raw: string): { stylePrompt: string; lyrics: string } {
  const text = raw.trim()
  const paragraphs = text.split(/\n\n+/)
  const hasSectionTag = (p: string) =>
    /\[\s*(Verse|Pre.?Chorus|Chorus|Bridge|Outro|Intro|Hook|Interlude|Post.?Chorus|Transition|Break|Build.?Up|Inst|Solo|Final)/i.test(p)

  let stylePrompt = ''
  const lyricParagraphs: string[] = []

  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const p = paragraphs[i].trim()
    if (!stylePrompt && !hasSectionTag(p) && p.length > 30) {
      stylePrompt = p.slice(0, 500)
    } else {
      lyricParagraphs.unshift(p)
    }
  }

  if (!stylePrompt) {
    const tagMatch = /\[\s*(Verse|Pre.?Chorus|Chorus|Bridge|Outro|Intro|Hook|Interlude|Post.?Chorus|Transition|Break|Build.?Up|Inst|Solo)/i.exec(text)
    if (tagMatch && tagMatch.index > 0) {
      stylePrompt = text.slice(0, tagMatch.index).trim().slice(0, 500)
      lyricParagraphs.length = 0
      lyricParagraphs.push(text.slice(tagMatch.index))
    } else {
      stylePrompt = text.slice(0, 500)
      lyricParagraphs.length = 0
      lyricParagraphs.push(text)
    }
  }

  let fullLyrics = lyricParagraphs.join('\n\n').trim()
  fullLyrics = normalizeLyricsTags(fullLyrics)
  if (fullLyrics.length > 1200) {
    const cut = fullLyrics.lastIndexOf('\n', 1200)
    fullLyrics = cut > 600 ? fullLyrics.slice(0, cut) : fullLyrics.slice(0, 1200)
  }

  return { stylePrompt: stylePrompt.trim(), lyrics: fullLyrics }
}

// ── GET /api/music?taskId=xxx ─────────────────────────────────────────────
// Lightweight ACE status proxy — called by frontend every 5s
// Returns: { status: 'pending'|'done'|'error', url?: string, error?: string }
export async function GET(req: NextRequest) {
  const taskId = req.nextUrl.searchParams.get('taskId')
  if (!taskId) {
    return new Response(JSON.stringify({ error: 'Missing taskId' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const pollRes = await fetch(`${ACE_MUSIC_BASE}/query_result?task_id=${taskId}`, {
      headers: { 'Authorization': `Bearer ${ACE_MUSIC_API_KEY}` },
      signal: AbortSignal.timeout(15000),
    })

    if (!pollRes.ok) {
      return new Response(JSON.stringify({ status: 'pending' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }

    const data = await pollRes.json()
    const status = data.status || data.state || ''

    if (status === 'done' || status === 'completed' || status === 'success') {
      const audioUrl = data.audio_url || data.url || data.result?.audio_url
      if (audioUrl) {
        return new Response(JSON.stringify({ status: 'done', url: audioUrl }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ status: 'error', error: 'Completed but no audio URL' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }

    if (status === 'failed' || status === 'error') {
      return new Response(JSON.stringify({ status: 'error', error: data.message || 'Generation failed' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }

    // Still in progress
    return new Response(JSON.stringify({ status: 'pending' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    // Timeout or network error → return pending so frontend keeps trying
    return new Response(JSON.stringify({ status: 'pending' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  }
}

// ── POST /api/music ───────────────────────────────────────────────────────
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

  // ── ACE-Step: submit task and return taskId immediately ──────────────────
  // Frontend polls GET /api/music?taskId=xxx every 5s
  if (model === 'ace-step-free') {
    const { stylePrompt, lyrics } = parseMusicPrompt(rawPrompt)

    // Submit with 30s timeout, 3 retries — but only if previous attempt didn't return a task_id
    let taskId: string | null = null
    let lastErr = ''

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const taskRes = await fetch(`${ACE_MUSIC_BASE}/release_task`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ACE_MUSIC_API_KEY}`,
          },
          body: JSON.stringify({
            prompt: stylePrompt,
            lyrics: explicitLyrics || lyrics,
          }),
          signal: AbortSignal.timeout(30000),
        })

        if (!taskRes.ok) {
          const err = await taskRes.json().catch(() => ({}))
          lastErr = err.message || err.error || `ACE Music submit error (${taskRes.status})`
          if (taskRes.status === 401 || taskRes.status === 403) break // no point retrying auth errors
          await sleep(5000)
          continue
        }

        const taskData = await taskRes.json()
        taskId = taskData.task_id || taskData.id || null
        if (taskId) break
        lastErr = 'ACE Music: no task_id in response'
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e)
        const isTimeout = lastErr.includes('TimeoutError') || lastErr.includes('timed out') || lastErr.includes('abort') || (e instanceof Error && e.name === 'TimeoutError')
        if (!isTimeout) break
        await sleep(5000)
      }
    }

    if (!taskId) {
      return new Response(JSON.stringify({ error: `ACE Music submit failed: ${lastErr}` }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }

    // Return taskId immediately — frontend will poll GET /api/music?taskId=xxx
    return new Response(JSON.stringify({ taskId, status: 'queued', model: 'ace-step-free' }), {
      status: 202, headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── MiniMax models ───────────────────────────────────────────────────────
  const apiKey = process.env.MINIMAX_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'MINIMAX_API_KEY not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  const minimaxModel = MINIMAX_MODEL_MAP[model] || 'music-2.5'
  const useUrlOutput = URL_OUTPUT_SUPPORTED.has(model)

  const { stylePrompt, lyrics } = parseMusicPrompt(rawPrompt)
  const finalLyrics = (explicitLyrics || lyrics).trim()
  const finalPrompt = stylePrompt.trim()

  const requestBody: Record<string, unknown> = {
    model: minimaxModel,
    prompt: finalPrompt,
    lyrics: finalLyrics,
    audio_setting: { sample_rate: 44100, bitrate: 256000, format: 'mp3' },
  }
  if (useUrlOutput) requestBody.output_format = 'url'

  try {
    const res = await fetch(`${MINIMAX_BASE}/music_generation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(55000),
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

    if (useUrlOutput) {
      const audioUrl = data?.data?.audio_url
      if (!audioUrl) {
        return new Response(
          JSON.stringify({ error: 'No audio URL from MiniMax. Check MINIMAX_API_KEY music credits.' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return new Response(
        JSON.stringify({ url: audioUrl, model: minimaxModel }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    } else {
      const hexAudio = data?.data?.audio
      if (!hexAudio) {
        return new Response(
          JSON.stringify({ error: 'No audio from MiniMax. Check MINIMAX_API_KEY music credits.' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }
      const audioBase64 = Buffer.from(hexAudio, 'hex').toString('base64')
      return new Response(
        JSON.stringify({ url: `data:audio/mp3;base64,${audioBase64}`, model: minimaxModel }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Music generation failed'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
