import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 300

// MiniMax Music Generation
// POST https://api.minimax.io/v1/music_generation
// Both music-2.5 AND music-2.0 support output_format='url' (per MiniMax docs).
// Use URL output for both: returns data.audio_url CDN link (fast, tiny response).
// Hex output (default) returns a massive hex payload that can overflow DO's 100s gateway.
//
// ACE Music (api.acemusic.ai) — SPLIT ARCHITECTURE:
// POST /api/music { model: 'ace-step-free' } → { taskId, status:'queued' } in <30s
// GET  /api/music?taskId=xxx → proxy to ACE /query_result → { status, url? }
// Frontend polls GET every 5s (ACE generates full songs in ~1 min)
// Note: ACE playground always outputs 2 songs per request — this is expected behavior.
//
// ⚠️  Section tags MUST be Title Case with spaces:
//   [Intro] [Verse] [Pre Chorus] [Chorus] [Bridge] [Outro] etc.
// ⚠️  Lyrics trimmed to ~1200 chars max (MiniMax 30-60s clip)

const MINIMAX_BASE = 'https://api.minimax.io/v1'
const ACE_MUSIC_BASE = 'https://api.acemusic.ai'
const ACE_MUSIC_API_KEY = process.env.ACE_MUSIC_API_KEY || ''

const MINIMAX_MODEL_MAP: Record<string, string> = {
  'music-2.5':     'music-2.5',
  'music-2.0':     'music-2.0',
  'music-01':      'music-2.5',
  'music-01-lite': 'music-2.0',
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
  // No lyrics length cap — MiniMax handles full song lyrics natively.
  // Generation time depends on output duration, not input text length.
  // Proven: music-2.0 generated a 3-min song from a 2,647-char gothic country prompt.

  return { stylePrompt: stylePrompt.trim(), lyrics: fullLyrics }
}

// ── GET /api/music?taskId=xxx ─────────────────────────────────────────────
// ACE status proxy — called by frontend every 5s
export async function GET(req: NextRequest) {
  const taskId = req.nextUrl.searchParams.get('taskId')
  if (!taskId) {
    return new Response(JSON.stringify({ error: 'Missing taskId' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // Try GET first; ACE may also accept POST {task_ids:[id]} format
    let pollRes = await fetch(`${ACE_MUSIC_BASE}/query_result?task_id=${taskId}`, {
      headers: { 'Authorization': `Bearer ${ACE_MUSIC_API_KEY}` },
      signal: AbortSignal.timeout(15000),
    })

    // If GET fails, try POST format (alternate ACE API contract)
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

    let rawData = await pollRes.json()
    // Normalize: POST {task_ids:[id]} returns an array; GET returns object directly
    const data = Array.isArray(rawData) ? rawData[0] : rawData
    const rawStatus = data.status ?? data.state ?? ''
    // ACE returns integer status: 0=pending/processing, 1=success, 2=failed
    // Normalize to string for comparison
    const status = typeof rawStatus === 'number'
      ? (rawStatus === 1 ? 'done' : rawStatus === 2 ? 'failed' : 'pending')
      : String(rawStatus)

    if (status === 'done' || status === 'completed' || status === 'success') {
      // ACE audio URL can be in multiple locations depending on API version
      const audioUrl = data.audio_url
        || data.url
        || data.result?.audio_url
        || data.result?.url
        || data.data?.audio_url
        || (Array.isArray(data.audios) ? data.audios[0] : null)
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

  // ── ACE-Step: return taskId immediately, frontend polls ──────────────────
  if (model === 'ace-step-free') {
    if (!ACE_MUSIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ACE_MUSIC_API_KEY not configured. Get a free key at acemusic.ai/playground/api-key and add it to your environment.' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }
    const { stylePrompt, lyrics } = parseMusicPrompt(rawPrompt)

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
          if (taskRes.status === 401 || taskRes.status === 403) break
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

    return new Response(JSON.stringify({ taskId, status: 'queued', model: 'ace-step-free' }), {
      status: 202, headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── MiniMax models — SSE streaming to bypass DO 100s gateway idle timeout ──
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

  const requestBody: Record<string, unknown> = {
    model: minimaxModel,
    prompt: finalPrompt,
    lyrics: finalLyrics,
    output_format: 'url',
    audio_setting: { sample_rate: 44100, bitrate: 256000, format: 'mp3' },
  }

  // SSE stream: keeps the DO gateway connection alive with periodic keepalive comments
  // while MiniMax generates (can take 60–120s for full songs).
  // DO's 100s "gateway timeout" is an idle timeout — active streaming resets it.
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (data: string) => controller.enqueue(enc.encode(data))

      // Keepalive timer: send SSE comment every 15s to prevent idle timeout
      const keepaliveInterval = setInterval(() => {
        try { send(': keepalive\n\n') } catch { /* stream closed */ }
      }, 15000)

      try {
        // Fire MiniMax request — NO AbortSignal timeout, let it run as long as needed
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
        if (!audioUrl) {
          // Fallback: decode hex audio
          const hexAudio = data?.data?.audio
          if (hexAudio) {
            const audioBase64 = Buffer.from(hexAudio, 'hex').toString('base64')
            send(`data: ${JSON.stringify({ url: `data:audio/mp3;base64,${audioBase64}`, model: minimaxModel })}\n\n`)
            controller.close()
            return
          }
          send(`data: ${JSON.stringify({ error: 'No audio from MiniMax. Verify API key has music credits.' })}\n\n`)
          controller.close()
          return
        }

        send(`data: ${JSON.stringify({ url: audioUrl, model: minimaxModel })}\n\n`)
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
      'X-Accel-Buffering': 'no', // Disable nginx buffering (important for DO)
    },
  })

}