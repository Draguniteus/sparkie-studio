import { NextRequest } from 'next/server'

// Node.js runtime needed for long-running music generation (up to 2 min)
export const runtime = 'nodejs'
export const maxDuration = 150

const MINIMAX_BASE = 'https://api.minimaxi.chat/v1'
const ACE_MUSIC_BASE = 'https://api.acemusic.ai'
const ACE_MUSIC_API_KEY = 'd33f8bc6767445a98b608dbf56710d26'

// MiniMax Music Generation API
// POST /v1/music_generation → { data: { audio: "<base64 mp3>" } }

// ACE Music (ACE-Step 1.5) Free API
// POST /release_task → { task_id }
// GET /query_result?task_id=xxx → poll → { status, audio_url }

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function generateAceMusic(prompt: string, lyrics?: string): Promise<string> {
  // Submit task
  const taskRes = await fetch(`${ACE_MUSIC_BASE}/release_task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ACE_MUSIC_API_KEY}`,
    },
    body: JSON.stringify({
      prompt,
      lyrics: lyrics || '',
      duration: 30,
    }),
  })

  if (!taskRes.ok) {
    const err = await taskRes.json().catch(() => ({}))
    throw new Error(err.message || err.error || `ACE Music submit ${taskRes.status}`)
  }

  const taskData = await taskRes.json()
  const taskId = taskData.task_id || taskData.id
  if (!taskId) throw new Error('ACE Music: no task_id returned')

  // Poll for result (up to 2 min, every 4s)
  for (let i = 0; i < 30; i++) {
    await sleep(4000)
    const pollRes = await fetch(`${ACE_MUSIC_BASE}/query_result?task_id=${taskId}`, {
      headers: { 'Authorization': `Bearer ${ACE_MUSIC_API_KEY}` },
    })
    if (!pollRes.ok) continue

    const pollData = await pollRes.json()
    const status = pollData.status || pollData.state

    if (status === 'done' || status === 'completed' || status === 'success') {
      const audioUrl = pollData.audio_url || pollData.url || pollData.result?.audio_url
      if (audioUrl) return audioUrl
      throw new Error('ACE Music: task done but no audio_url')
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(pollData.message || 'ACE Music generation failed')
    }
    // still pending/running — keep polling
  }

  throw new Error('ACE Music: timed out after 2 minutes')
}

export async function POST(req: NextRequest) {
  let prompt: string
  let model: string
  let lyrics: string | undefined

  try {
    const body = await req.json()
    prompt = body.prompt
    model = body.model || 'music-01'
    lyrics = body.lyrics
    if (!prompt) throw new Error('Missing prompt')
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Route ACE-Step free model
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

  // MiniMax models
  const apiKey = process.env.MINIMAX_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'MINIMAX_API_KEY not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  const modelMap: Record<string, string> = {
    'music-01': 'music-01',
    'music-01-lite': 'music-01-lite',
  }
  const minimaxModel = modelMap[model] || 'music-01'

  try {
    const res = await fetch(`${MINIMAX_BASE}/music_generation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: minimaxModel,
        prompt,
        audio_setting: {
          sample_rate: 44100,
          bitrate: 256000,
          format: 'mp3',
        },
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      return new Response(JSON.stringify({ error: err.message || err.error || `MiniMax ${res.status}` }), {
        status: res.status, headers: { 'Content-Type': 'application/json' },
      })
    }

    const data = await res.json()
    const audioBase64 = data?.data?.audio
    if (!audioBase64) {
      return new Response(JSON.stringify({ error: 'No audio returned from MiniMax' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ url: `data:audio/mp3;base64,${audioBase64}`, model: minimaxModel }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Music generation failed'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
