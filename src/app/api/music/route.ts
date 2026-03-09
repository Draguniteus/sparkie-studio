import { NextRequest } from 'next/server'
import { pushMediaToGitHub } from '@/lib/github-media'

export const runtime = 'nodejs'
export const maxDuration = 300

const MINIMAX_BASE = 'https://api.minimax.io/v1'

const MINIMAX_MODEL_MAP: Record<string, string> = {
  'music-2.5':     'music-2.5',
  'music-2.5+':    'music-2.5+',
  'music-2.0':     'music-2.0',
  'music-01':      'music-2.5',
  'music-01-lite': 'music-2.0',
}

// Models that support lyrics_optimizer (auto-generate lyrics from prompt)
const LYRICS_OPTIMIZER_MODELS = new Set(['music-2.5', 'music-2.5+'])

function normalizeLyricsTags(lyrics: string): string {
  return lyrics.replace(/\[([^\]]+)\]/g, (_, inner) => {
    const cleaned = inner.replace(/\s*[\u2013\u2014\-\(].*/g, '').replace(/\s+\d+$/, '').trim()
    const s = cleaned.toLowerCase()
    if (/\bverse\b/.test(s))                          return '[Verse]'
    if (/\bpre[\s\-]?chorus\b/.test(s))              return '[Pre Chorus]'
    if (/\bpost[\s\-]?chorus\b/.test(s))             return '[Post Chorus]'
    if (/\bfinal\s+chorus\b/.test(s))                return '[Chorus]'
    if (/\bchorus\b/.test(s))                         return '[Chorus]'
    if (/\bbridge\b/.test(s))                         return '[Bridge]'
    if (/\boutro\b/.test(s))                          return '[Outro]'
    if (/\bintro\b/.test(s))                          return '[Intro]'
    if (/\bhook\b/.test(s))                           return '[Hook]'
    if (/\binterlude\b/.test(s))                      return '[Interlude]'
    if (/\btransition\b/.test(s))                     return '[Transition]'
    if (/\bbreak\b/.test(s))                          return '[Break]'
    if (/\bbuild[\s\-]?up\b/.test(s))               return '[Build Up]'
    if (/\binst\b|\binstrumental\b/.test(s))         return '[Inst]'
    if (/\bsolo\b/.test(s))                           return '[Solo]'
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
      // No section tags — plain style prompt, no explicit lyrics
      stylePrompt = text.slice(0, 500)
      lyricParagraphs.length = 0
    }
  }

  let fullLyrics = lyricParagraphs.join('\n\n').trim()
  fullLyrics = normalizeLyricsTags(fullLyrics)
  return { stylePrompt: stylePrompt.trim(), lyrics: fullLyrics }
}

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

async function tryPersistAudio(url: string, userId: string): Promise<string> {
  try {
    const result = await pushMediaToGitHub('audio', url, userId, 'mp3')
    return result.url
  } catch (e) {
    console.error('[/api/music] GitHub media push failed:', e)
    return url
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

  // ACE Music is no longer available — provider shut down
  if (model === 'ace-step-free') {
    return new Response(JSON.stringify({
      error: 'ACE Music (ace-step-free) is no longer available. Please select Music-2.5 or Music-2.0 instead.'
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

  const supportsLyricsOptimizer = LYRICS_OPTIMIZER_MODELS.has(minimaxModel)

  // For music-2.0: call /lyrics_generation first if no lyrics provided
  if (!finalLyrics && !supportsLyricsOptimizer) {
    try {
      const lyricsRes = await fetch(MINIMAX_BASE + '/lyrics_generation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
        },
        body: JSON.stringify({ mode: 'write_full_song', prompt: rawPrompt }),
        signal: AbortSignal.timeout(30000),
      })
      if (lyricsRes.ok) {
        const lyricsData = await lyricsRes.json()
        if (lyricsData?.base_resp?.status_code === 0 && lyricsData?.lyrics) {
          finalLyrics = lyricsData.lyrics
        } else {
          console.error('[/api/music] lyrics_generation failed:', JSON.stringify(lyricsData?.base_resp))
        }
      } else {
        console.error('[/api/music] lyrics_generation HTTP error:', lyricsRes.status)
      }
    } catch (e) {
      console.error('[/api/music] lyrics_generation exception:', e)
    }
  }

  // Build MiniMax request body
  // output_format:'url' is a valid field — MiniMax returns a CDN URL in data.audio instead of hex
  const requestBody: Record<string, unknown> = {
    model: minimaxModel,
    prompt: stylePrompt.trim() || rawPrompt.slice(0, 500),
    output_format: 'url',
    audio_setting: { sample_rate: 44100, bitrate: 256000, format: 'mp3' },
  }

  if (finalLyrics) {
    // Explicit lyrics — send directly
    requestBody.lyrics = finalLyrics
  } else if (supportsLyricsOptimizer) {
    // lyrics_optimizer:true + empty lyrics → MiniMax auto-generates lyrics from prompt
    // This is the correct field name per official docs (not 'auto_lyrics')
    requestBody.lyrics = ''
    requestBody.lyrics_optimizer = true
  } else {
    // music-2.0 fallback — lyrics_generation already attempted above
    // If it failed, send empty lyrics (may produce instrumental)
    requestBody.lyrics = finalLyrics || ''
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
          signal: AbortSignal.timeout(120000),
        })

        clearInterval(keepaliveInterval)

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'HTTP ' + res.status }))
          const errMsg = err?.base_resp?.status_msg || err?.message || err?.error || ('MiniMax error ' + res.status)
          console.error('[/api/music] HTTP error', res.status, errMsg)
          send('data: ' + JSON.stringify({ error: errMsg }) + '\n\n')
          controller.close()
          return
        }

        const data = await res.json()
        console.log('[/api/music] response base_resp:', JSON.stringify(data?.base_resp), '| data keys:', Object.keys(data?.data || {}))

        if (data?.base_resp?.status_code !== 0) {
          const errMsg = data?.base_resp?.status_msg || 'MiniMax API error (code ' + data?.base_resp?.status_code + ')'
          console.error('[/api/music] API error:', errMsg)
          send('data: ' + JSON.stringify({ error: errMsg }) + '\n\n')
          controller.close()
          return
        }

        // Response shape with output_format:'url':
        //   data.audio = "https://..." (CDN URL, valid for 24h)
        //   data.status = 2
        // Response shape without output_format (or output_format:'hex'):
        //   data.audio = "<hex string>"
        //   data.status = 2
        const dataPayload = Array.isArray(data?.data) ? data.data[0] : data?.data

        // Try URL fields first (output_format:'url' puts the URL in data.audio)
        const audioFieldValue =
          dataPayload?.audio_file ||
          dataPayload?.audioURL ||
          dataPayload?.audio_url ||
          dataPayload?.url ||
          dataPayload?.download_url

        if (audioFieldValue && String(audioFieldValue).startsWith('http')) {
          const persistentUrl = await tryPersistAudio(String(audioFieldValue), userId)
          send('data: ' + JSON.stringify({ url: persistentUrl, model: minimaxModel, persistent: persistentUrl !== String(audioFieldValue) }) + '\n\n')
          controller.close()
          return
        }

        // data.audio: could be URL (output_format:url) or hex string
        const audioRaw = dataPayload?.audio
        if (audioRaw && typeof audioRaw === 'string' && audioRaw.length > 0) {
          if (audioRaw.startsWith('http')) {
            // URL returned in data.audio (output_format:'url' response shape)
            const persistentUrl = await tryPersistAudio(audioRaw, userId)
            send('data: ' + JSON.stringify({ url: persistentUrl, model: minimaxModel, persistent: persistentUrl !== audioRaw }) + '\n\n')
            controller.close()
            return
          } else {
            // Hex-encoded audio (output_format:'hex' or default)
            try {
              const audioBuf = Buffer.from(audioRaw, 'hex')
              if (audioBuf.length === 0) throw new Error('Hex decode produced empty buffer — likely empty lyrics with no lyrics_optimizer')
              const audioBase64 = audioBuf.toString('base64')
              const dataUrl = 'data:audio/mp3;base64,' + audioBase64
              const persistentUrl = await tryPersistAudio(dataUrl, userId)
              send('data: ' + JSON.stringify({ url: persistentUrl, model: minimaxModel, persistent: persistentUrl !== dataUrl }) + '\n\n')
              controller.close()
              return
            } catch (hexErr) {
              console.error('[/api/music] Hex decode failed:', hexErr)
              // Fall through to diagnostics
            }
          }
        }

        // No audio found — surface diagnostics
        const dataKeys = Object.keys(dataPayload || {})
        const statusCode = data?.base_resp?.status_code
        const statusMsg = data?.base_resp?.status_msg || ''
        console.error('[/api/music] No audio. dataPayload keys:', dataKeys, '| data.audio type:', typeof dataPayload?.audio, '| data.audio length:', String(dataPayload?.audio || '').length)
        send('data: ' + JSON.stringify({
          error: 'MiniMax returned success but no audio. Keys: [' + dataKeys.join(', ') + '].' +
            (statusMsg ? ' ' + statusMsg + '.' : '') +
            ' Check MiniMax dashboard for credits/quota.'
        }) + '\n\n')
        controller.close()

      } catch (err) {
        clearInterval(keepaliveInterval)
        const msg = err instanceof Error ? err.message : 'MiniMax generation failed'
        console.error('[/api/music] exception:', msg)
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
