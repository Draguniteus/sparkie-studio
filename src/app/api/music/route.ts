import { NextRequest } from 'next/server'

export const runtime = 'edge'

const MINIMAX_BASE = 'https://api.minimaxi.chat/v1'

// MiniMax Music Generation API
// Docs: https://platform.minimaxi.com/document/music
// POST /v1/music_generation → { audio_setting, refer_voice, refer_instrumental, lyrics_model, prompt }
// Returns: { data: { audio: "<base64 mp3>", ... } }

export async function POST(req: NextRequest) {
  const apiKey = process.env.MINIMAX_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'MINIMAX_API_KEY not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  let prompt: string
  let model: string
  try {
    const body = await req.json()
    prompt = body.prompt
    model = body.model || 'music-01'
    if (!prompt) throw new Error('Missing prompt')
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Map our model IDs to MiniMax model names
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
        // Let model decide genre/mood from the prompt
        audio_setting: {
          sample_rate: 44100,
          bitrate: 256000,
          format: 'mp3',
        },
      }),
      signal: AbortSignal.timeout(120_000), // music gen can take up to 2min
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      return new Response(JSON.stringify({ error: err.message || err.error || `MiniMax ${res.status}` }), {
        status: res.status, headers: { 'Content-Type': 'application/json' },
      })
    }

    const data = await res.json()

    // MiniMax returns audio as base64 in data.data.audio
    // Convert to a data URL so the client can play it directly
    const audioBase64 = data?.data?.audio
    if (!audioBase64) {
      return new Response(JSON.stringify({ error: 'No audio returned from MiniMax' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }

    const audioDataUrl = `data:audio/mp3;base64,${audioBase64}`

    return new Response(JSON.stringify({ url: audioDataUrl, model: minimaxModel }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Music generation failed'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
