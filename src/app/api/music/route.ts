import { NextRequest } from 'next/server'
import { pushMediaToGitHub } from '@/lib/github-media'

export const runtime = 'nodejs'
export const maxDuration = 300

const MINIMAX_BASE = 'https://api.minimax.io/v1'
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

function extractBpmFromText(text: string): number {
  // Match patterns like "120 BPM", "120bpm", "120 bpm", "at 120"
  const match = /\b(\d{2,3})\s*bpm\b/i.exec(text)
  if (match) {
    const bpm = parseInt(match[1], 10)
    if (bpm >= 40 && bpm <= 300) return bpm
  }
  return 120 // sensible default
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

// ─── ACE Music Handler ────────────────────────────────────────────────────────
// Two-step pipeline:
//   Step 1: MiniMax lyrics_generation → structured lyrics + style tags + title
//   Step 2: ACE /v1/chat/completions with real lyrics, thinking: true, duration: 150
//           → returns audio via SSE stream with thinking enabled for max quality
async function handleAceMusic(
  prompt: string,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctrl: any,
  userStyle?: string,
  userLyrics?: string,
  userDuration?: number
): Promise<void> {
  const enc = new TextEncoder()
  const send = (data: string) => { try { ctrl.enqueue(enc.encode(data)) } catch { /* closed */ } }

  const aceKey = process.env.ACE_MUSIC_API_KEY
  const minimaxKey = process.env.MINIMAX_API_KEY
  if (!aceKey) {
    send('data: ' + JSON.stringify({ error: 'ACE_MUSIC_API_KEY not configured' }) + '\n\n')
    return
  }

  const keepalive = setInterval(() => {
    try { send(': keepalive\n\n') } catch { /* ignore */ }
  }, 15000)

  try {
    // ── Step 1: Use user-provided lyrics/style OR generate via MiniMax ─────────
    let finalLyrics = ''
    let songTitle = ''
    let styleTags = ''

    // If user explicitly provided style + lyrics (power-user mode), skip MiniMax entirely
    if (userLyrics) {
      finalLyrics = userLyrics
      styleTags = userStyle || ''
      // Extract title from first non-tag, non-empty line of lyrics or prompt
      const firstLine = userLyrics.split('\n').find(l => l.trim() && !l.trim().startsWith('['))
      songTitle = firstLine?.trim().slice(0, 50) || prompt.slice(0, 50).replace(/\b\w/g, c => c.toUpperCase()).trim()
      console.log('[/api/music] ACE Step 1: using user-provided lyrics (', finalLyrics.length, 'chars) + style (', styleTags.slice(0, 60), ')')
    } else if (minimaxKey) {
      try {
        console.log('[/api/music] ACE Step 1: generating lyrics via MiniMax for prompt:', prompt.slice(0, 80))
        const lyricsRes = await fetch(MINIMAX_BASE + '/lyrics_generation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + minimaxKey },
          body: JSON.stringify({ mode: 'write_full_song', prompt }),
          signal: AbortSignal.timeout(30000),
        })
        if (lyricsRes.ok) {
          const lyricsData = await lyricsRes.json()
          if (lyricsData?.base_resp?.status_code === 0 && lyricsData?.lyrics) {
            finalLyrics = lyricsData.lyrics
            songTitle = lyricsData.song_title || ''
            styleTags = lyricsData.style_tags || ''
            console.log('[/api/music] ACE Step 1 done: title=', songTitle, 'style=', styleTags.slice(0, 60), 'lyrics len=', finalLyrics.length)
          } else {
            console.error('[/api/music] MiniMax lyrics error:', JSON.stringify(lyricsData?.base_resp))
          }
        } else {
          console.error('[/api/music] MiniMax lyrics HTTP error:', lyricsRes.status)
        }
      } catch (e) {
        console.error('[/api/music] MiniMax lyrics exception:', e)
      }
    }

    // Fallback: if MiniMax unavailable/failed and no user lyrics, build minimal structure
    if (!finalLyrics) {
      console.log('[/api/music] ACE Step 1 fallback: building minimal lyrics from prompt')
      const subject = prompt.replace(/^(make|write|create|generate|compose)\s+(me\s+)?(a\s+)?/i, '').trim()
      finalLyrics = `[Verse]\n${subject}\nA story told in song\nWords that carry on\nThrough melody and rhyme\n\n[Chorus]\n${subject}\nForever in our hearts\nA song that never parts\nEchoes through all time\n\n[Verse]\nThe journey carries forth\nWith meaning and with worth\nEach note a stepping stone\nTowards a place called home\n\n[Chorus]\n${subject}\nForever in our hearts\nA song that never parts\nEchoes through all time\n\n[Outro]\nThe music fades away\nBut memories will stay`
      songTitle = subject.slice(0, 50).replace(/\b\w/g, c => c.toUpperCase())
      styleTags = 'heartfelt, melodic, emotional'
    }

    // ── Step 2: Generate audio via ACE with real lyrics ──────────────────────
    // Build tagged content: <prompt>STYLE</prompt>\n<lyrics>LYRICS</lyrics>
    const stylePrompt = userStyle || styleTags || prompt.slice(0, 200)
    const taggedContent = `<prompt>${stylePrompt}</prompt>\n<lyrics>${finalLyrics}</lyrics>`
    const aceDuration = userDuration ?? 90
    const aceBpm = extractBpmFromText(stylePrompt)

    console.log('[/api/music] ACE Step 2: calling ACE — duration:', aceDuration, 'bpm:', aceBpm, 'prompt len:', stylePrompt.length)

    // Single high-quality request with thinking:true — no batching needed
    const makeAceRequest = async (): Promise<{ audioUrl: string | undefined; content: string }> => {
      const r = await fetch(ACE_MUSIC_BASE + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + aceKey },
        body: JSON.stringify({
          model: 'acestep/ACE-Step-v1.5',
          messages: [{ role: 'user', content: taggedContent }],
          stream: true,
          thinking: true,
          audio_config: { duration: aceDuration, bpm: aceBpm, format: 'mp3', vocal_language: 'en' },
        }),
        signal: AbortSignal.timeout(240000),
      })
      if (!r.ok) {
        const errText = await r.text().catch(() => 'HTTP ' + r.status)
        let errMsg = 'ACE Music error ' + r.status
        try { const j = JSON.parse(errText); errMsg = j?.error?.message || j?.message || errMsg } catch { /* noop */ }
        throw new Error(errMsg)
      }
      const rdr = r.body!.getReader()
      const dec = new TextDecoder()
      let buf = '', accum = '', foundUrl: string | undefined
      try {
        while (true) {
          const { done, value } = await rdr.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const lines = buf.split('\n'); buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            const j = line.slice(5).trim()
            if (!j || j === '[DONE]') continue
            let chunk: Record<string, unknown>
            try { chunk = JSON.parse(j) } catch { continue }

            // Check top-level chunk for audio_url (some ACE responses put it here)
            if (!foundUrl && typeof chunk.audio_url === 'string') {
              foundUrl = chunk.audio_url
            }

            // Check chunk.data array (alternative response path)
            if (!foundUrl && Array.isArray(chunk.data) && chunk.data.length > 0) {
              const d0 = chunk.data[0] as Record<string, unknown>
              if (typeof d0.audio_url === 'string') foundUrl = d0.audio_url as string
              else if (typeof d0.url === 'string') foundUrl = d0.url as string
            }

            const choices = chunk.choices as Array<Record<string, unknown>> | undefined
            if (!choices) continue
            for (const choice of choices) {
              const delta = choice.delta as Record<string, unknown> | undefined
              if (!delta) continue
              if (typeof delta.content === 'string') accum += delta.content

              // Handle both direct string audio_url and nested object audio_url
              const audioArr = delta.audio as Array<Record<string, unknown>> | undefined
              if (audioArr && !foundUrl) {
                for (const item of audioArr) {
                  let u: string | undefined
                  if (typeof item.audio_url === 'string') {
                    u = item.audio_url  // Direct URL string (e.g. data:audio/mpeg;base64,...)
                  } else if (typeof item.audio_url === 'object' && item.audio_url !== null) {
                    u = (item.audio_url as Record<string, unknown>).url as string | undefined
                  }
                  if (u) { foundUrl = u; break }
                }
              }
            }
          }
        }
      } finally { rdr.cancel().catch(() => {}) }

      if (!foundUrl) {
        console.log('[/api/music] ACE request finished — no audio_url found. accum length:', accum.length)
        console.log('[/api/music] ACE accum (first 500):', accum.slice(0, 500))
      }

      return { audioUrl: foundUrl, content: accum }
    }

    clearInterval(keepalive)

    // Run request with retry — ACE can timeout or hit transient errors
    const makeAceRequestWithRetry = async (retries = 2): Promise<{ audioUrl: string | undefined; content: string }> => {
      let lastErr: string = ''
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const result = await makeAceRequest()
          if (result.audioUrl || attempt === retries) return result
          lastErr = result.content || 'no audio_url in response'
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e)
        }
        if (attempt < retries) {
          const delay = Math.min(2000 * Math.pow(2, attempt), 8000)
          console.log(`[/api/music] ACE attempt ${attempt + 1} failed (${lastErr}) — retrying in ${delay}ms…`)
          await new Promise(r => setTimeout(r, delay))
        }
      }
      return { audioUrl: undefined, content: lastErr }
    }

    const result = await makeAceRequestWithRetry()

    if (!result.audioUrl) {
      // Fallback 1: non-streaming + thinking
      console.log('[/api/music] Streaming returned no audio — trying non-streaming fallback')
      const nbRes = await fetch(ACE_MUSIC_BASE + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + aceKey },
        body: JSON.stringify({
          model: 'acestep/ACE-Step-v1.5',
          messages: [{ role: 'user', content: taggedContent }],
          stream: false,
          thinking: true,
          audio_config: { duration: aceDuration, bpm: aceBpm, format: 'mp3', vocal_language: 'en' },
        }),
        signal: AbortSignal.timeout(240000),
      })
      if (nbRes.ok) {
        const nbData = await nbRes.json() as Record<string, unknown>
        const choices = nbData.choices as Array<{ message?: { audio?: Array<{ audio_url?: { url?: string } | string }> } }> | undefined
        const audioArr = choices?.[0]?.message?.audio
        if (Array.isArray(audioArr)) {
          for (const item of audioArr) {
            let u: string | undefined
            if (typeof item.audio_url === 'string') u = item.audio_url
            else if (typeof item.audio_url === 'object' && item.audio_url !== null) u = (item.audio_url as Record<string, unknown>).url as string | undefined
            if (u) { result.audioUrl = u; break }
          }
        }
        if (!result.audioUrl && typeof nbData.audio_url === 'string') result.audioUrl = nbData.audio_url
        if (!result.audioUrl && Array.isArray(nbData.data) && nbData.data.length > 0) {
          const d0 = nbData.data[0] as Record<string, unknown>
          if (typeof d0.audio_url === 'string') result.audioUrl = d0.audio_url as string
          else if (typeof d0.url === 'string') result.audioUrl = d0.url as string
        }
      }

      // Fallback 2: retry without thinking (ACE might have returned image instead)
      if (!result.audioUrl) {
        console.log('[/api/music] Non-streaming also returned no audio — retrying without thinking mode')
        const retryRes = await fetch(ACE_MUSIC_BASE + '/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + aceKey },
          body: JSON.stringify({
            model: 'acestep/ACE-Step-v1.5',
            messages: [{ role: 'user', content: taggedContent }],
            stream: false,
            audio_config: { duration: aceDuration, bpm: aceBpm, format: 'mp3', vocal_language: 'en' },
          }),
          signal: AbortSignal.timeout(240000),
        })
        if (retryRes.ok) {
          const retryData = await retryRes.json() as Record<string, unknown>
          const choices = retryData.choices as Array<{ message?: { audio?: Array<{ audio_url?: { url?: string } | string }> } }> | undefined
          const audioArr = choices?.[0]?.message?.audio
          if (Array.isArray(audioArr)) {
            for (const item of audioArr) {
              let u: string | undefined
              if (typeof item.audio_url === 'string') u = item.audio_url
              else if (typeof item.audio_url === 'object' && item.audio_url !== null) u = (item.audio_url as Record<string, unknown>).url as string | undefined
              if (u) { result.audioUrl = u; break }
            }
          }
          if (!result.audioUrl && Array.isArray(retryData.data) && retryData.data.length > 0) {
            const d0 = retryData.data[0] as Record<string, unknown>
            if (typeof d0.audio_url === 'string') result.audioUrl = d0.audio_url as string
            else if (typeof d0.url === 'string') result.audioUrl = d0.url as string
          }
        }
      }

      // Fallback 3: MiniMax music-2.6 — only if all ACE attempts failed
      if (!result.audioUrl && minimaxKey) {
        console.log('[/api/music] All ACE attempts failed — falling back to MiniMax music-2.6')
        const mmRes = await fetch(MINIMAX_BASE + '/music_generation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + minimaxKey },
          body: JSON.stringify({
            model: 'music-2.6',
            prompt: stylePrompt,
            lyrics: finalLyrics,
            output_format: 'url',
            audio_setting: { sample_rate: 44100, bitrate: 256000, format: 'mp3' },
          }),
          signal: AbortSignal.timeout(290000),
        })
        if (mmRes.ok) {
          const mmData = await mmRes.json() as { data?: { audio_file?: string; audio?: string; audio_url?: string; url?: string }; base_resp?: { status_code: number; status_msg?: string } }
          if ((mmData.base_resp?.status_code ?? -1) === 0) {
            const mmAudio = mmData.data?.audio_file ?? mmData.data?.audio ?? mmData.data?.audio_url ?? mmData.data?.url
            if (mmAudio) {
              const mmUrl = await tryPersistAudio(String(mmAudio), userId)
              send('data: ' + JSON.stringify({ type: 'ace_music', url: mmUrl, model: 'music-2.6', title: songTitle, style: stylePrompt, lyrics: finalLyrics }) + '\n\n')
              clearInterval(keepalive)
              return
            }
          }
        }
      }

      // All fallbacks exhausted
      const errMsg = result.content || 'ACE Music returned no audio after all fallback attempts. Check API key and credits at api.acemusic.ai.'
      console.error('[/api/music] ACE/MiniMax all failed:', errMsg)
      send('data: ' + JSON.stringify({ error: errMsg }) + '\n\n')
      clearInterval(keepalive)
      return
    }

    const audioUrls: string[] = [result.audioUrl]
    const contentAccum = result.content

    // ── Build final metadata ─────────────────────────────────────────────────
    // Extract title/style from ACE content if richer than what MiniMax gave us
    let title = songTitle
    let style = styleTags
    let lyrics = finalLyrics  // use MiniMax lyrics — they're real structured lyrics

    if (contentAccum) {
      const titleMatch = contentAccum.match(/(?:^|\n)(?:title|song\s*name|name)[:\s]+([^\n]+)/i)
      const styleMatch = contentAccum.match(/(?:^|\n)(?:style|genre|tags|mood|sound)[:\s]+([^\n]+)/i)
      if (titleMatch && !title) title = titleMatch[1].trim().replace(/["'*#]/g, '').trim()
      if (styleMatch && !style) style = styleMatch[1].trim().replace(/["'*#]/g, '').trim()
    }

    if (!title) title = prompt.slice(0, 50).replace(/\b\w/g, c => c.toUpperCase()).trim() || 'Sparkie Mix'
    if (!style) style = prompt.slice(0, 200)

    console.log('[/api/music] ACE got audio URL, title:', title)

    const url1 = await tryPersistAudio(audioUrls[0], userId)

    send('data: ' + JSON.stringify({
      type: 'ace_music',
      url: url1,
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

  // Send SSE keepalive pings every 5s while MiniMax generates (up to ~5 min).
  // DO App Platform kills idle SSE connections at ~60s — pings keep it alive.
  const keepalive = setInterval(() => {
    try { send(': keepalive\n\n') } catch { /* ignore */ }
  }, 5000)

  try {
    const res = await fetch(MINIMAX_BASE + '/music_generation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(290000),
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

    // Derive title from prompt for the Music Studio card
    const songTitle = rawPrompt.slice(0, 60).replace(/\b\w/g, c => c.toUpperCase()).trim() || 'Sparkie Mix'

    if (audioFieldValue && String(audioFieldValue).startsWith('http')) {
      const persistentUrl = await tryPersistAudio(String(audioFieldValue), userId)
      send('data: ' + JSON.stringify({ 
        type: 'ace_music', 
        url: persistentUrl, 
        model: minimaxModel,
        title: songTitle,
        style: stylePrompt.slice(0, 200),
        lyrics: finalLyrics
      }) + '\n\n')
      return
    }

    const audioRaw = dataPayload?.audio
    if (audioRaw && typeof audioRaw === 'string' && audioRaw.length > 0) {
      if (audioRaw.startsWith('http')) {
        const persistentUrl = await tryPersistAudio(audioRaw, userId)
        send('data: ' + JSON.stringify({ 
          type: 'ace_music', 
          url: persistentUrl, 
          model: minimaxModel,
          title: songTitle,
          style: stylePrompt.slice(0, 200),
          lyrics: finalLyrics
        }) + '\n\n')
        return
      } else {
        try {
          const audioBuf = Buffer.from(audioRaw, 'hex')
          if (audioBuf.length === 0) throw new Error('Hex decode produced empty buffer')
          const dataUrl = 'data:audio/mp3;base64,' + audioBuf.toString('base64')
          const persistentUrl = await tryPersistAudio(dataUrl, userId)
          send('data: ' + JSON.stringify({ 
            type: 'ace_music', 
            url: persistentUrl, 
            model: minimaxModel,
            title: songTitle,
            style: stylePrompt.slice(0, 200),
            lyrics: finalLyrics
          }) + '\n\n')
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

  let userStyle: string | undefined
  let userLyrics: string | undefined
  let userDuration: number | undefined

  try {
    const body = await req.json()
    rawPrompt = body.prompt
    model = body.model || 'music-2.5'
    bodyUserId = body.userId
    userStyle = typeof body.userStyle === 'string' && body.userStyle ? body.userStyle : undefined
    userLyrics = typeof body.userLyrics === 'string' && body.userLyrics ? body.userLyrics : undefined
    userDuration = typeof body.duration === 'number' && body.duration > 0 ? Math.min(body.duration, 240) : undefined
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
          await handleAceMusic(rawPrompt, userId, controller, userStyle, userLyrics, userDuration)
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
