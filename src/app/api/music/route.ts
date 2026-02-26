import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 300

const MINIMAX_BASE = 'https://api.minimax.io/v1'
const ACE_MUSIC_BASE = 'https://api.acemusic.ai'
const ACE_MUSIC_API_KEY = process.env.ACE_MUSIC_API_KEY || ''

const MINIMAX_MODEL_MAP: Record<string, string> = {
  // music-2.0 removed from MiniMax API — all variants now map to music-2.5 (only valid model)
  'music-2.5':     'music-2.5',
  'music-2.0':     'music-2.5',
  'music-01':      'music-2.5',
  'music-01-lite': 'music-2.5',
}

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
      stylePrompt = p.slice(0, 300)
    } else {
      lyricParagraphs.unshift(p)
    }
  }

  if (!stylePrompt) {
    const tagMatch = /\[\s*(Verse|Pre.?Chorus|Chorus|Bridge|Outro|Intro|Hook|Interlude|Post.?Chorus|Transition|Break|Build.?Up|Inst|Solo)/i.exec(text)
    if (tagMatch && tagMatch.index > 0) {
      stylePrompt = text.slice(0, tagMatch.index).trim().slice(0, 300)
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
  return { stylePrompt: stylePrompt.trim(), lyrics: fullLyrics }
}

export async function GET(req: NextRequest) {
  const taskId = req.nextUrl.searchParams.get('taskId')
  if (!taskId) {
    return new Response(JSON.stringify({ error: 'Missing taskId' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    let pollRes = await fetch(`${ACE_MUSIC_BASE}/query_result?task_id=${taskId}`, {
      headers: { 'Authorization': `Bearer ${ACE_MUSIC_API_KEY}` },
      signal: AbortSignal.timeout(15000),
    })

    if (!pollRes.ok) {
      try {
        pollRes = await fetch(`${ACE_MUSIC_BASE}/query_result`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ACE_MUSIC_API_KEY}`,
          },
          body: JSON.stringify({ task_ids: [taskId] }),
          signal: AbortSignal.timeout(15000),
        })
      } catch { /* fall through to pending */ }
    }

    if (!pollRes.ok) {
      return new Response(JSON.stringify({ status: 'pending' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }

    const rawData = await pollRes.json()
    const data = Array.isArray(rawData) ? rawData[0] : rawData
    const rawStatus = data.status ?? data.state ?? ''
    const status = typeof rawStatus === 'number'
      ? (rawStatus === 1 ? 'done' : rawStatus === 2 ? 'failed' : 'pending')
      : String(rawStatus)

    if (status === 'done' || status === 'completed' || status === 'success') {
      const audioUrl = data.audio_url || data.url || data.result?.audio_url || data.result?.url
        || data.data?.audio_url || (Array.isArray(data.audios) ? data.audios[0] : null)
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
      return new Response(JSON.stringify({ status: 'error', error: data.message || data.error || 'Generation failed' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ status: 'pending' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ status: 'pending' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  }
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

  if (model === 'ace-step-free') {
    // ACE Music (api.acemusic.ai) is no longer available — provider shut down.
    // To restore: migrate to MusicAPI.ai (docs.musicapi.ai) with MUSICAPI_KEY env var.
    return new Response(JSON.stringify({
      error: 'ACE Music provider (acemusic.ai) is no longer available. Use a MiniMax music model instead (music-2.5 or music-2.0).'
    }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    })
  }

  const apiKey = process.env.MINIMAX_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'MINIMAX_API_KEY not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  const minimaxModel = MINIMAX_MODEL_MAP[model] || 'music-2.5'
  const { stylePrompt, lyrics } = parseMusicPrompt(rawPrompt)
  let finalLyrics = (explicitLyrics || lyrics).trim()
  const finalPrompt = stylePrompt.trim()

  // If no lyrics (e.g. user gave a plain prompt), auto-generate via MiniMax lyrics API
  if (!finalLyrics) {
    try {
      const lyricsRes = await fetch(`${MINIMAX_BASE}/lyrics_generation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ mode: 'write_full_song', prompt: rawPrompt }),
      })
      if (lyricsRes.ok) {
        const lyricsData = await lyricsRes.json()
        if (lyricsData?.base_resp?.status_code === 0 && lyricsData?.lyrics) {
          finalLyrics = lyricsData.lyrics
        }
      }
    } catch { /* fall through — MiniMax music will error on empty lyrics */ }
  }

  const requestBody: Record<string, unknown> = {
    model: minimaxModel,
    prompt: finalPrompt,
    lyrics: finalLyrics,
    output_format: 'url',
    audio_setting: { sample_rate: 44100, bitrate: 256000, format: 'mp3' },
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (data: string) => controller.enqueue(enc.encode(data))

      const keepaliveInterval = setInterval(() => {
        try { send(': keepalive\n\n') } catch { /* stream closed */ }
      }, 15000)

      try {
        const res = await fetch(`${MINIMAX_BASE}/music_generation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
        })

        clearInterval(keepaliveInterval)

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          send(`data: ${JSON.stringify({ error: err.message || err.base_resp?.status_msg || err.error || `MiniMax error ${res.status}` })}\n\n`)
          controller.close()
          return
        }

        const data = await res.json()

        if (data?.base_resp?.status_code !== 0) {
          send(`data: ${JSON.stringify({ error: data.base_resp?.status_msg || 'MiniMax API error' })}\n\n`)
          controller.close()
          return
        }

        const audioUrl = data?.data?.audio_url
        if (audioUrl) {
          send(`data: ${JSON.stringify({ url: audioUrl, model: minimaxModel })}\n\n`)
          controller.close()
          return
        }

        const hexAudio = data?.data?.audio
        if (hexAudio) {
          const audioBase64 = Buffer.from(hexAudio, 'hex').toString('base64')
          send(`data: ${JSON.stringify({ url: `data:audio/mp3;base64,${audioBase64}`, model: minimaxModel })}\n\n`)
          controller.close()
          return
        }

        // Neither audio_url nor hex — surface diagnostics
        const dataKeys = Object.keys(data?.data || {})
        const statusCode = data?.base_resp?.status_code
        const statusMsg = data?.base_resp?.status_msg || ''
        send(`data: ${JSON.stringify({
          error: `MiniMax returned success (status_code ${statusCode}) but no audio. Response keys: [${dataKeys.join(', ')}].${statusMsg ? ' ' + statusMsg + '.' : ''} This usually means the MiniMax account has no music generation credits or the model requires a paid tier. Check your MiniMax dashboard.`
        })}\n\n`)
        controller.close()
      } catch (err) {
        clearInterval(keepaliveInterval)
        const msg = err instanceof Error ? err.message : 'MiniMax generation failed'
        try { send(`data: ${JSON.stringify({ error: msg })}\n\n`) } catch { /* ignore */ }
        controller.close()
      }
    }
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
