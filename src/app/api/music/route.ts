import { NextRequest } from 'next/server'
import { pushMediaToGitHub } from '@/lib/github-media'

export const runtime = 'nodejs'
export const maxDuration = 300

const MINIMAX_BASE = 'https://api.minimaxi.com/v1'
const ACE_MUSIC_BASE = 'https://api.acemusic.ai'

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
  // Skip if already a data: URI (we'll push the raw base64 below)
  if (url.startsWith('data:')) {
    try {
      const result = await pushMediaToGitHub('audio', url, userId, 'mp3')
      return result.url
    } catch (e) {
      console.error('[/api/music] GitHub media push failed (data URI):', e)
      return url
    }
  }
  try {
    const result = await pushMediaToGitHub('audio', url, userId, 'mp3')
    return result.url
  } catch (e) {
    console.error('[/api/music] GitHub media push failed:', e)
    return url
  }
}

// ─── ACE Music Handler ────────────────────────────────────────────────────────
// Calls api.acemusic.ai OpenRouter-compatible endpoint.
// sample_mode:true → LM auto-generates title, style, and lyrics from the prompt.
// batch_size:2 → always returns 2 versions (v1 + v2).
async function handleAceMusic(
  prompt: string,
  userId: string,
  outerController: ReadableStreamDefaultController<Uint8Array>
): Promise<void> {
  const enc = new TextEncoder()
  const send = (data: string) => { try { outerController.enqueue(enc.encode(data)) } catch { /* stream closed */ } }

  const apiKey = process.env.ACE_MUSIC_API_KEY
  if (!apiKey) {
    send('data: ' + JSON.stringify({ error: 'ACE_MUSIC_API_KEY not configured' }) + '\n\n')
    return
  }

  const keepalive = setInterval(() => {
    try { send(': keepalive\n\n') } catch { /* ignore */ }
  }, 15000)

  try {
    const res = await fetch(ACE_MUSIC_BASE + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        sample_mode: true,
        stream: true,
        batch_size: 2,
      }),
      signal: AbortSignal.timeout(240000), // 4 min
    })

    clearInterval(keepalive)

    if (!res.ok) {
      const errText = await res.text().catch(() => 'HTTP ' + res.status)
      let errMsg = 'ACE Music error ' + res.status
      try {
        const errJson = JSON.parse(errText)
        errMsg = errJson?.error?.message || errJson?.message || errMsg
      } catch { /* use status code */ }
      console.error('[/api/music] ACE HTTP error', res.status, errMsg)
      send('data: ' + JSON.stringify({ error: errMsg }) + '\n\n')
      return
    }

    // Parse ACE SSE stream
    // Each chunk: data: {"choices":[{"delta":{"content":"..."},"index":0}]}
    // Audio chunks: delta.audio[N].audio_url.url = "data:audio/mpeg;base64,..."
    // Content chunks arrive first, then audio chunks
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    let contentAccum = ''
    const audioUrls: string[] = [] // collect up to 2 audio URLs

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const json = line.slice(5).trim()
          if (!json || json === '[DONE]') continue

          let chunk: Record<string, unknown>
          try { chunk = JSON.parse(json) } catch { continue }

          const choices = chunk.choices as Array<Record<string, unknown>> | undefined
          if (!choices) continue

          for (const choice of choices) {
            const delta = choice.delta as Record<string, unknown> | undefined
            if (!delta) continue

            // Text content (title, style prompt, lyrics)
            if (typeof delta.content === 'string' && delta.content) {
              contentAccum += delta.content
            }

            // Audio chunks
            const audioArr = delta.audio as Array<Record<string, unknown>> | undefined
            if (audioArr) {
              for (const audioItem of audioArr) {
                const audioUrl = (audioItem.audio_url as Record<string, unknown> | undefined)?.url as string | undefined
                if (audioUrl && typeof audioUrl === 'string' && audioUrls.length < 2) {
                  audioUrls.push(audioUrl)
                }
              }
            }
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {})
    }

    // Parse content: ACE returns structured text like:
    // Title: Some Title\nStyle: genre, bpm, key\n\n[Verse]\nlyrics...\n[Chorus]\n...
    let title = ''
    let style = ''
    let lyrics = ''

    if (contentAccum) {
      const titleMatch = contentAccum.match(/(?:^|\n)(?:title|song)[:\s]+([^\n]+)/i)
      const styleMatch = contentAccum.match(/(?:^|\n)(?:style|genre|tags)[:\s]+([^\n]+)/i)
      if (titleMatch) title = titleMatch[1].trim().replace(/["'*]/g, '')
      if (styleMatch) style = styleMatch[1].trim()

      // Lyrics: everything with section tags
      const lyricsMatch = contentAccum.match(/\[(Verse|Chorus|Bridge|Intro|Outro|Pre Chorus|Post Chorus|Hook|Interlude)[\s\S]*/i)
      if (lyricsMatch) {
        lyrics = normalizeLyricsTags(lyricsMatch[0].trim())
      } else if (!titleMatch && !styleMatch) {
        // If no structured fields, treat whole content as lyrics
        lyrics = contentAccum.trim()
      }
    }

    if (!title) {
      // Derive a title from the prompt
      title = prompt.slice(0, 50).replace(/\b\w/g, c => c.toUpperCase()).trim() || 'Sparkie Mix'
    }
    if (!style) style = prompt.slice(0, 120)

    if (audioUrls.length === 0) {
      console.error('[/api/music] ACE returned no audio URLs. contentAccum length:', contentAccum.length)
      send('data: ' + JSON.stringify({
        error: 'ACE Music generation completed but returned no audio. Check your API key credits at api.acemusic.ai.'
      }) + '\n\n')
      return
    }

    console.log('[/api/music] ACE got', audioUrls.length, 'audio URL(s), title:', title)

    // Push both audio URLs to GitHub in parallel
    const [url1, url2] = await Promise.all([
      tryPersistAudio(audioUrls[0], userId),
      audioUrls[1] ? tryPersistAudio(audioUrls[1], userId) : Promise.resolve(undefined),
    ])

    send('data: ' + JSON.stringify({
      type: 'ace_music',
      url: url1,
      url2: url2 || undefined,
      title,
      style,
      lyrics,
    }) + '\n\n')

  } catch (err) {
    clearInterval(keepalive)
    const msg = err instanceof Error ? err.message : 'ACE Music generation failed'
    console.error('[/api/music] ACE exception:', msg)
    send('data: ' + JSON.stringify({ error: msg }) + '\n\n')
  }
}

// ─── MiniMax Handler ──────────────────────────────────────────────────────────
async function handleMiniMax(
  rawPrompt: string,
  model: string,
  userId: string,
  outerController: ReadableStreamDefaultController<Uint8Array>
): Promise<void> {
  const enc = new TextEncoder()
  const send = (data: string) => { try { outerController.enqueue(enc.encode(data)) } catch { /* ignore */ } }

  const apiKey = process.env.MINIMAX_API_KEY
  if (!apiKey) {
    send('data: ' + JSON.stringify({ error: 'MINIMAX_API_KEY not configured' }) + '\n\n')
    return
  }

  const minimaxModel = MINIMAX_MODEL_MAP[model] || 'music-2.5'
  const { stylePrompt, lyrics } = parseMusicPrompt(rawPrompt)
  let finalLyrics = lyrics.trim()

  const supportsLyricsOptimizer = LYRICS_OPTIMIZER_MODELS.has(minimaxModel)

  if (!finalLyrics && !supportsLyricsOptimizer) {
    try {
      const lyricsRes = await fetch(MINIMAX_BASE + '/lyrics_generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
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

  const requestBody: Record<string, unknown> = {
    model: minimaxModel,
    prompt: stylePrompt.trim() || rawPrompt.slice(0, 500),
    output_format: 'url',
    audio_setting: { sample_rate: 44100, bitrate: 256000, format: 'mp3' },
  }

  if (finalLyrics) {
    requestBody.lyrics = finalLyrics
  } else if (supportsLyricsOptimizer) {
    requestBody.lyrics = ''
    requestBody.lyrics_optimizer = true
  } else {
    requestBody.lyrics = finalLyrics || ''
  }

  const keepalive = setInterval(() => {
    try { send(': keepalive\n\n') } catch { /* ignore */ }
  }, 15000)

  try {
    const res = await fetch(MINIMAX_BASE + '/music_generation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(120000),
    })

    clearInterval(keepalive)

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'HTTP ' + res.status }))
      const errMsg = (err as Record<string, unknown>)?.base_resp?.status_msg || (err as Record<string, unknown>)?.message || (err as Record<string, unknown>)?.error || ('MiniMax error ' + res.status)
      console.error('[/api/music] HTTP error', res.status, errMsg)
      send('data: ' + JSON.stringify({ error: errMsg }) + '\n\n')
      return
    }

    const data = await res.json()
    console.log('[/api/music] response base_resp:', JSON.stringify(data?.base_resp), '| data keys:', Object.keys(data?.data || {}))

    if (data?.base_resp?.status_code !== 0) {
      const errMsg = data?.base_resp?.status_msg || 'MiniMax API error (code ' + data?.base_resp?.status_code + ')'
      console.error('[/api/music] API error:', errMsg)
      send('data: ' + JSON.stringify({ error: errMsg }) + '\n\n')
      return
    }

    const dataPayload = Array.isArray(data?.data) ? data.data[0] : data?.data
    const audioFieldValue =
      dataPayload?.audio_file ||
      dataPayload?.audioURL ||
      dataPayload?.audio_url ||
      dataPayload?.url ||
      dataPayload?.download_url

    if (audioFieldValue && String(audioFieldValue).startsWith('http')) {
      const persistentUrl = await tryPersistAudio(String(audioFieldValue), userId)
      send('data: ' + JSON.stringify({ url: persistentUrl, model: minimaxModel, persistent: persistentUrl !== String(audioFieldValue) }) + '\n\n')
      return
    }

    const audioRaw = dataPayload?.audio
    if (audioRaw && typeof audioRaw === 'string' && audioRaw.length > 0) {
      if (audioRaw.startsWith('http')) {
        const persistentUrl = await tryPersistAudio(audioRaw, userId)
        send('data: ' + JSON.stringify({ url: persistentUrl, model: minimaxModel, persistent: persistentUrl !== audioRaw }) + '\n\n')
        return
      } else {
        try {
          const audioBuf = Buffer.from(audioRaw, 'hex')
          if (audioBuf.length === 0) throw new Error('Hex decode produced empty buffer')
          const audioBase64 = audioBuf.toString('base64')
          const dataUrl = 'data:audio/mp3;base64,' + audioBase64
          const persistentUrl = await tryPersistAudio(dataUrl, userId)
          send('data: ' + JSON.stringify({ url: persistentUrl, model: minimaxModel, persistent: persistentUrl !== dataUrl }) + '\n\n')
          return
        } catch (hexErr) {
          console.error('[/api/music] Hex decode failed:', hexErr)
        }
      }
    }

    const dataKeys = Object.keys(dataPayload || {})
    const statusMsg = data?.base_resp?.status_msg || ''
    console.error('[/api/music] No audio. dataPayload keys:', dataKeys)
    send('data: ' + JSON.stringify({
      error: 'MiniMax returned success but no audio. Keys: [' + dataKeys.join(', ') + '].' +
        (statusMsg ? ' ' + statusMsg + '.' : '') +
        ' Check MiniMax dashboard for credits/quota.'
    }) + '\n\n')
  } catch (err) {
    clearInterval(keepalive)
    const msg = err instanceof Error ? err.message : 'MiniMax generation failed'
    console.error('[/api/music] exception:', msg)
    send('data: ' + JSON.stringify({ error: msg }) + '\n\n')
  }
}

// ─── Main Route Handler ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let rawPrompt: string
  let model: string
  let bodyUserId: string | undefined

  try {
    const body = await req.json()
    rawPrompt = body.prompt
    model = body.model || 'music-2.5'
    bodyUserId = body.userId
    if (!rawPrompt) throw new Error('Missing prompt')
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const userId = bodyUserId || extractUserId(req)

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (model === 'ace-step-free') {
          await handleAceMusic(rawPrompt, userId, controller)
        } else {
          await handleMiniMax(rawPrompt, model, userId, controller)
        }
      } finally {
        try { controller.close() } catch { /* already closed */ }
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
