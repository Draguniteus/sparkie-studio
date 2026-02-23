import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 150

// MiniMax Music Generation (synchronous)
// POST https://api.minimax.io/v1/music_generation
// Body: { model, prompt, lyrics?, audio_setting }
// Response: { data: { audio: "<hex>", status: 2 }, base_resp: { status_code: 0 } }
// audio field is HEX-encoded → Buffer.from(hex, 'hex').toString('base64')

// ACE Music (api.acemusic.ai)
// POST /release_task → { task_id }
// GET  /query_result?task_id=xxx → poll → { status, audio_url }

const MINIMAX_BASE = 'https://api.minimax.io/v1'
const ACE_MUSIC_BASE = 'https://api.acemusic.ai'
const ACE_MUSIC_API_KEY = 'd33f8bc6767445a98b608dbf56710d26'

// MiniMax model name mapping
const MINIMAX_MODEL_MAP: Record<string, string> = {
  'music-2.5':      'music-2.5',
  'music-2.0':      'music-2.0',
  // legacy aliases (from old picker IDs)
  'music-01':       'music-2.5',
  'music-01-lite':  'music-2.0',
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function generateAceMusic(prompt: string, lyrics?: string): Promise<string> {
  const taskRes = await fetch(`${ACE_MUSIC_BASE}/release_task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ACE_MUSIC_API_KEY}`,
    },
    body: JSON.stringify({ prompt, lyrics: lyrics || '', duration: 30 }),
    signal: AbortSignal.timeout(15000),
  })

  if (!taskRes.ok) {
    const err = await taskRes.json().catch(() => ({}))
    throw new Error(err.message || err.error || `ACE Music submit error (${taskRes.status})`)
  }

  const taskData = await taskRes.json()
  const taskId = taskData.task_id || taskData.id
  if (!taskId) throw new Error('ACE Music: no task_id returned')

  // Poll for result (up to 2 min, every 4s)
  for (let i = 0; i < 30; i++) {
    await sleep(4000)
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
      // Ignore poll errors and keep retrying
      if (pollErr instanceof Error && pollErr.message.includes('ACE Music')) throw pollErr
    }
  }

  throw new Error('ACE Music: generation timed out (>2 min). Try again.')
}

export async function POST(req: NextRequest) {
  let prompt: string
  let model: string
  let lyrics: string | undefined

  try {
    const body = await req.json()
    prompt = body.prompt
    model = body.model || 'music-2.5'
    lyrics = body.lyrics
    if (!prompt) throw new Error('Missing prompt')
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── ACE-Step free model ──────────────────────────────────────────────────────
  if (model === 'ace-step-free') {
    try {
      const audioUrl = await generateAceMusic(prompt, lyrics)
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

  const requestBody: Record<string, unknown> = {
    model: minimaxModel,
    prompt,
    audio_setting: {
      sample_rate: 44100,
      bitrate: 256000,
      format: 'mp3',
    },
  }

  // Include lyrics if provided (enables vocal generation with correct lyrics)
  if (lyrics && lyrics.trim()) {
    requestBody.lyrics = lyrics.trim()
  }

  try {
    const res = await fetch(`${MINIMAX_BASE}/music_generation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(120000), // 2 min timeout
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      return new Response(
        JSON.stringify({ error: err.message || err.base_resp?.status_msg || err.error || `MiniMax ${res.status}` }),
        { status: res.status, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const data = await res.json()

    // Check MiniMax base_resp for API-level errors
    if (data?.base_resp?.status_code !== 0) {
      return new Response(
        JSON.stringify({ error: data.base_resp?.status_msg || 'MiniMax API error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const hexAudio = data?.data?.audio
    if (!hexAudio) {
      return new Response(
        JSON.stringify({ error: 'No audio returned from MiniMax. Check MINIMAX_API_KEY and model availability.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // MiniMax returns HEX-encoded audio — convert to base64 data URL
    const audioBytes = Buffer.from(hexAudio, 'hex')
    const audioBase64 = audioBytes.toString('base64')
    const audioDataUrl = `data:audio/mp3;base64,${audioBase64}`

    return new Response(
      JSON.stringify({ url: audioDataUrl, model: minimaxModel }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Music generation failed'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
