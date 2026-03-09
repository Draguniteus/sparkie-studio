import { NextRequest } from 'next/server'
import { pushMediaToGitHub } from '@/lib/github-media'

export const runtime = 'nodejs'
export const maxDuration = 300

const MINIMAX_BASE = 'https://api.minimax.io/v1'
const ACE_MUSIC_BASE = 'https://api.acemusic.ai'
const ACE_MUSIC_API_KEY = process.env.ACE_MUSIC_API_KEY || ''

const MINIMAX_MODEL_MAP: Record<string, string> = {
  'music-2.5':     'music-2.5',
  'music-2.0':     'music-2.0',   // $0.03/5min — confirmed still active (per pricing page)
  'music-01':      'music-2.5',
  'music-01-lite': 'music-2.0',
}

// Models that support auto_lyrics generation from prompt
const AUTO_LYRICS_MODELS = new Set(['music-2.5'])

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeLyricsTags(lyrics: string): string {
  return lyrics.replace(/\[([^\]]+)\]/g, (_, inner) => {
    const cleaned = inner.replace(/\s*[\u2013\u2014\-\(].*/g, '').replace(/\s+\d+$/, '').trim()
    const s = cleaned.toLowerCase()
    if (/\bverse\b/.test(s))                                           return '[Verse]'
    if (/\bpre[\s\-]?chorus\b/.test(s))                               return '[Pre Chorus]'
    if (/\bpost[\s\-]?chorus\b/.test(s))                              return '[Post Chorus]'
    if (/\bfinal\s+chorus\b/.test(s))                                 return '[Chorus]'
    if (/\bchorus\b/.test(s))                                          return '[Chorus]'
    if (/\bbridge\b/.test(s))                                          return '[Bridge]'
    if (/\boutro\b/.test(s))                                           return '[Outro]'
    if (/\bintro\b/.test(s))                                           return '[Intro]'
    if (/\bhook\b/.test(s))                                            return '[Hook]'
    if (/\binterlude\b/.test(s))                                       return '[Interlude]'
    if (/\btransition\b/.test(s))                                      return '[Transition]'
    if (/\bbreak\b/.test(s))                                           return '[Break]'
    if (/\bbuild[\s\-]?up\b/.test(s))                                 return '[Build Up]'
    if (/\binst\b|\binstrumental\b/.test(s))                          return '[Inst]'
    if (/\bsolo\b/.test(s))                                            return '[Solo]'
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
      // No section tags — plain style prompt, no lyrics
      stylePrompt = text.slice(0, 500)
      lyricParagraphs.length = 0
    }
  }

  let fullLyrics = lyricParagraphs.join('\n\n').trim()
  fullLyrics = normalizeLyricsTags(fullLyrics)
  return { stylePrompt: stylePrompt.trim(), lyrics: fullLyrics }
}

// Extract userId from Authorization Bearer token
function extractUserId(req: NextRequest): string {
  try {
    const auth = req.headers.get('authorization') || ''
    const token = auth.replace('Bearer ', '').trim()
    if (!token) return 'anon'
    const parts = token.split('.')
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
      return payload.sub || payload.id || token.slice(0, 12)
    }
    return token.slice(0, 12)
  } catch {
    return 'anon'
  }
}

// Best-effort GitHub persist — never throws
async function tryPersistAudio(url: string, userId: string): Promise<string> {
  try {
    const result = await pushMediaToGitHub('audio', url, userId, 'mp3')
    return result.url
  } catch (e) {
    console.error('[/api/music] GitHub media push failed:', e)
    return url
  }
}

export async function GET(req: NextRequest) {
  const taskId = req.nextUrl.searchParams.get('taskId')
  if (!taskId) {
    return new Response(JSON.stringify({ error: 'Missing taskId' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    let pollRes = await fetch(ACE_MUSIC_BASE + '/query_result?task_id=' + taskId, {
      headers: { 'Authorization': 'Bearer ' + ACE_MUSIC_API_KEY },
      signal: AbortSignal.timeout(15000),
    })

    if (!pollRes.ok) {
      try {
        pollRes = await fetch(ACE_MUSIC_BASE + '/query_result', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + ACE_MUSIC_API_KEY,
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
  let bodyUserId: string | undefined

  try {
    const body = await req.json()
    rawPrompt = body.prompt
    model = body.model || 'music-2.5'
    explicitLyrics = body.lyrics
    bodyUserId = body.userId
    if (!rawPrompt) throw new Error('Missing prompt')
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const userId = bodyUserId || extractUserId(req)

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

  const supportsAutoLyrics = AUTO_LYRICS_MODELS.has(minimaxModel)

  // If no lyrics and model doesn't support auto_lyrics, try the lyrics generation API first
  if (!finalLyrics && !supportsAutoLyrics) {
    try {
      const lyricsRes = await fetch(MINIMAX_BASE + '/lyrics_generation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
        },
        body: JSON.stringify({ mode: 'write_full_song', prompt: rawPrompt }),
      })
      if (lyricsRes.ok) {
        const lyricsData = await lyricsRes.json()
        if (lyricsData?.base_resp?.status_code === 0 && lyricsData?.lyrics) {
          finalLyrics = lyricsData.lyrics
        }
      }
    } catch { /* fall through — will use auto_lyrics or send without lyrics */ }
  }

  // Build request body — do NOT include output_format (not a valid MiniMax field; causes silent audio)
  const requestBody: Record<string, unknown> = {
    model: minimaxModel,
    prompt: finalPrompt,
    audio_setting: { sample_rate: 44100, bitrate: 128000, format: 'mp3' },
  }

  if (finalLyrics) {
    // Explicit lyrics provided or fetched from lyrics API
    requestBody.lyrics = finalLyrics
  } else if (supportsAutoLyrics) {
    // music-2.5 supports auto_lyrics: true — MiniMax generates lyrics from prompt internally
    requestBody.auto_lyrics = true
  } else {
    // music-2.0 fallback — send empty lyrics; API will handle (may produce instrumental)
    requestBody.lyrics = ''
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (data: string) => controller.enqueue(enc.encode(data))

      const keepaliveInterval = setInterval(() => {
        try { send(': keepalive\n\n') } catch { /* stream closed */ }
      }, 15000)

      try {
        const res = await fetch(MINIMAX_BASE + '/music_generation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey,
          },
          body: JSON.stringify(requestBody),
        })

        clearInterval(keepaliveInterval)

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'HTTP ' + res.status }))
          send('data: ' + JSON.stringify({ error: err.message || err.base_resp?.status_msg || err.error || ('MiniMax error ' + res.status) }) + '\n\n')
          controller.close()
          return
        }

        const data = await res.json()

        if (data?.base_resp?.status_code !== 0) {
          send('data: ' + JSON.stringify({ error: data.base_resp?.status_msg || 'MiniMax API error' }) + '\n\n')
          controller.close()
          return
        }

        // MiniMax music_generation returns audio in multiple shapes depending on model/version:
        // music-2.5: { data: { audioURL: "..." } } or { data: [{ audioURL: "..." }] }
        // music-2.0: hex audio in { data: { audio: "hex" } }
        // Both models (no output_format): default returns hex in data.audio
        const dataPayload = Array.isArray(data?.data) ? data.data[0] : data?.data
        const audioFieldValue = dataPayload?.audio_file || dataPayload?.audioURL
          || dataPayload?.audio_url || dataPayload?.url || dataPayload?.download_url

        if (audioFieldValue && (String(audioFieldValue).startsWith('http') || String(audioFieldValue).startsWith('data:'))) {
          // Persist to GitHub (best-effort) before sending to client
          const persistentUrl = await tryPersistAudio(String(audioFieldValue), userId)
          send('data: ' + JSON.stringify({ url: persistentUrl, model: minimaxModel, persistent: persistentUrl !== String(audioFieldValue) }) + '\n\n')
          controller.close()
          return
        }

        // Hex audio — default MiniMax return format when no output_format is specified
        const hexAudio = dataPayload?.audio
        if (hexAudio && typeof hexAudio === 'string' && hexAudio.length > 0 && !hexAudio.startsWith('http')) {
          try {
            const audioBuf = Buffer.from(hexAudio, 'hex')
            if (audioBuf.length === 0) throw new Error('Hex decode produced empty buffer')
            const audioBase64 = audioBuf.toString('base64')
            const dataUrl = 'data:audio/mp3;base64,' + audioBase64
            const persistentUrl = await tryPersistAudio(dataUrl, userId)
            send('data: ' + JSON.stringify({ url: persistentUrl, model: minimaxModel, persistent: persistentUrl !== dataUrl }) + '\n\n')
            controller.close()
            return
          } catch (hexErr) {
            console.error('[/api/music] Hex decode failed:', hexErr)
            // Fall through to diagnostics below
          }
        }

        // Neither audio URL nor valid hex — surface diagnostics
        console.error('[/api/music] No audio found. dataPayload keys:', Object.keys(dataPayload || {}), '| full response data:', JSON.stringify(data?.data).slice(0, 500))
        const dataKeys = Object.keys(dataPayload || {})
        const statusCode = data?.base_resp?.status_code
        const statusMsg = data?.base_resp?.status_msg || ''
        send('data: ' + JSON.stringify({
          error: 'MiniMax returned success (status_code ' + statusCode + ') but no audio. Response keys: [' + dataKeys.join(', ') + '].' + (statusMsg ? ' ' + statusMsg + '.' : '') + ' This usually means the MiniMax account has no music generation credits or the model requires a paid tier. Check your MiniMax dashboard.'
        }) + '\n\n')
        controller.close()
      } catch (err) {
        clearInterval(keepaliveInterval)
        const msg = err instanceof Error ? err.message : 'MiniMax generation failed'
        try { send('data: ' + JSON.stringify({ error: msg }) + '\n\n') } catch { /* ignore */ }
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
