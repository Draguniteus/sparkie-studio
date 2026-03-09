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

const LYRICS_OPTIMIZER_MODELS = new Set(['music-2.5', 'music-2.5+'])

function normalizeLyricsTags(lyrics: string): string {
  return lyrics.replace(/\[([^\]]+)\]/g, (_, inner) => {
    const cleaned = inner.replace(/\s*[\u2013\u2014\-\(].*/g, '').replace(/\s+\d+$/, '').trim()
    const s = cleaned.toLowerCase()
    if (/\bverse\b/.test(s))                         return '[Verse]'
    if (/\bpre[\s\-]?chorus\b/.test(s))             return '[Pre Chorus]'
    if (/\bpost[\s\-]?chorus\b/.test(s))            return '[Post Chorus]'
    if (/\bfinal\s+chorus\b/.test(s))               return '[Chorus]'
    if (/\bchorus\b/.test(s))                        return '[Chorus]'
    if (/\bbridge\b/.test(s))                        return '[Bridge]'
    if (/\boutro\b/.test(s))                         return '[Outro]'
    if (/\bintro\b/.test(s))                         return '[Intro]'
    if (/\bhook\b/.test(s))                          return '[Hook]'
    if (/\binterlude\b/.test(s))                     return '[Interlude]'
    if (/\btransition\b/.test(s))                    return '[Transition]'
    if (/\bbreak\b/.test(s))                         return '[Break]'
    if (/\bbuild[\s\-]?up\b/.test(s))              return '[Build Up]'
    if (/\binst\b|\binstrumental\b/.test(s))        return '[Inst]'
    if (/\bsolo\b/.test(s))                          return '[Solo]'
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
  // Handle base64 data URLs from ACE Step (data:audio/wav;base64,...)
  if (url.startsWith('data:')) {
    try {
      const commaIdx = url.indexOf(',')
      if (commaIdx === -1) return url
      const base64Data = url.slice(commaIdx + 1)
      // Convert to data URL blob path for GitHub push
      const audioBuffer = Buffer.from(base64Data, 'base64')
      if (audioBuffer.length === 0) return url
      const tempDataUrl = 'data:audio/wav;base64,' + base64Data
      // Push to GitHub as binary — use the buffer approach via a temp file pattern
      // Since pushMediaToGitHub expects URL, convert to object URL approach:
      // Fall through to direct data URL (client can play data: URLs natively)
      console.log('[/api/music] ACE audio data URL, size:', audioBuffer.length, 'bytes — passing through')
      return url  // data: URLs work directly in <audio src>
    } catch (e) {
      console.error('[/api/music] ACE data URL handling failed:', e)
      return url
    }
  }
  // HTTP URLs: push to GitHub for persistence
  try {
    const result = await pushMediaToGitHub('audio', url, userId, 'mp3')
    return result.url
  } catch (e) {
    console.error('[/api/music] GitHub media push failed:', e)
    return url
  }
}

// ─── ACE Music Handler ──────────────────────────────────────────────────────
// Uses api.acemusic.ai OpenRouter-compatible endpoint.
// sample_mode:true → LM auto-generates everything from natural language.
// batch_size:2 → always returns 2 versions.
async function handleAceMusic(
  prompt: string,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctrl: any
): Promise<void> {
  const enc = new TextEncoder()
  const send = (data: string) => { try { ctrl.enqueue(enc.encode(data)) } catch { /* closed */ } }

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
      signal: AbortSignal.timeout(240000),
    })

    clearInterval(keepalive)

    if (!res.ok) {
      const errText = await res.text().catch(() => 'HTTP ' + res.status)
      let errMsg = 'ACE Music error ' + res.status
      try {
        const errJson = JSON.parse(errText)
        errMsg = errJson?.error?.message || errJson?.message || errMsg
      } catch { /* use status */ }
      console.error('[/api/music] ACE HTTP error', res.status, errMsg)
      send('data: ' + JSON.stringify({ error: errMsg }) + '\n\n')
      return
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let contentAccum = ''
    const audioUrls: string[] = []

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

            if (typeof delta.content === 'string' && delta.content) {
              contentAccum += delta.content
            }

            const audioArr = delta.audio as Array<Record<string, unknown>> | undefined
            if (audioArr) {
              for (const item of audioArr) {
                const audioUrl = (item.audio_url as Record<string, unknown> | undefined)?.url as string | undefined
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

    let title = ''
    let style = ''
    let lyrics = ''

    if (contentAccum) {
      // ACE Step sample_mode streams: title line, style/tags line, then full lyrics
      const titleMatch = contentAccum.match(/(?:^|\n)(?:title|song\s*name|name)[:\s]+([^\n]+)/i)
      const styleMatch = contentAccum.match(/(?:^|\n)(?:style|genre|tags|mood|sound)[:\s]+([^\n]+)/i)
      if (titleMatch) title = titleMatch[1].trim().replace(/["'*#]/g, '').trim()
      if (styleMatch) style = styleMatch[1].trim().replace(/["'*#]/g, '').trim()

      // Lyrics: try section-tagged block first, then fall back to all content after metadata lines
      const lyricsMatch = contentAccum.match(/\[(Verse|Chorus|Bridge|Intro|Outro|Pre[\s-]?Chorus|Post[\s-]?Chorus|Hook|Interlude|Inst|Solo)[\s\S]*/i)
      if (lyricsMatch) {
        lyrics = normalizeLyricsTags(lyricsMatch[0].trim())
      } else {
        // Remove any title/style header lines and use the rest as lyrics
        const cleaned = contentAccum
          .replace(/^(?:title|song\s*name|name|style|genre|tags|mood|sound)[:\s][^\n]+\n?/gim, '')
          .trim()
        if (cleaned.length > 20) {
          lyrics = normalizeLyricsTags(cleaned)
        }
      }
    }

    if (!title) title = prompt.slice(0, 50).replace(/\b\w/g, c => c.toUpperCase()).trim() || 'Sparkie Mix'
    // Style: prefer extracted style, fallback to full prompt (shows what was requested)
    if (!style) style = prompt.slice(0, 200)

    if (audioUrls.length === 0) {
      console.error('[/api/music] ACE returned no audio. contentAccum length:', contentAccum.length)
      send('data: ' + JSON.stringify({
        error: 'ACE Music returned no audio. Check API key credits at api.acemusic.ai.'
      }) + '\n\n')
      return
    }

    console.log('[/api/music] ACE got', audioUrls.length, 'audio URL(s), title:', title)

    const [url1, url2] = await Promise.all([
      tryPersistAudio(audioUrls[0], userId),
      audioUrls[1] ? tryPersistAudio(audioUrls[1], userId) : Promise.resolve(undefined as string | undefined),
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

// ─── MiniMax Handler ────────────────────────────────────────────────────────
async function handleMiniMax(
  rawPrompt: string,
  model: string,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctrl: any
): Promise<void> {
  const enc = new TextEncoder()
  const send = (data: string) => { try { ctrl.enqueue(enc.encode(data)) } catch { /* closed */ } }

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
    requestBody.lyrics = ''
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
      const errRaw = await res.json().catch(() => ({ error: 'HTTP ' + res.status }))
      const errObj = errRaw as Record<string, unknown>
      const baseResp = errObj?.base_resp as Record<string, unknown> | undefined
      const errMsg = (baseResp?.status_msg as string) || (errObj?.message as string) || (errObj?.error as string) || ('MiniMax error ' + res.status)
      console.error('[/api/music] HTTP error', res.status, errMsg)
      send('data: ' + JSON.stringify({ error: errMsg }) + '\n\n')
      return
    }

    const data = await res.json()
    console.log('[/api/music] base_resp:', JSON.stringify(data?.base_resp))

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
      send('data: ' + JSON.stringify({ url: persistentUrl, model: minimaxModel }) + '\n\n')
      return
    }

    const audioRaw = dataPayload?.audio
    if (audioRaw && typeof audioRaw === 'string' && audioRaw.length > 0) {
      if (audioRaw.startsWith('http')) {
        const persistentUrl = await tryPersistAudio(audioRaw, userId)
        send('data: ' + JSON.stringify({ url: persistentUrl, model: minimaxModel }) + '\n\n')
        return
      } else {
        try {
          const audioBuf = Buffer.from(audioRaw, 'hex')
          if (audioBuf.length === 0) throw new Error('Hex decode produced empty buffer')
          const dataUrl = 'data:audio/mp3;base64,' + audioBuf.toString('base64')
          const persistentUrl = await tryPersistAudio(dataUrl, userId)
          send('data: ' + JSON.stringify({ url: persistentUrl, model: minimaxModel }) + '\n\n')
          return
        } catch (hexErr) {
          console.error('[/api/music] Hex decode failed:', hexErr)
        }
      }
    }

    const dataKeys = Object.keys(dataPayload || {})
    console.error('[/api/music] No audio. Keys:', dataKeys)
    send('data: ' + JSON.stringify({
      error: 'MiniMax returned success but no audio. Keys: [' + dataKeys.join(', ') + ']. Check credits/quota.'
    }) + '\n\n')

  } catch (err) {
    clearInterval(keepalive)
    const msg = err instanceof Error ? err.message : 'MiniMax generation failed'
    console.error('[/api/music] exception:', msg)
    send('data: ' + JSON.stringify({ error: msg }) + '\n\n')
  }
}

// ─── Main Route ─────────────────────────────────────────────────────────────
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

  const stream = new ReadableStream({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async start(controller: any) {
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
