import { NextRequest, NextResponse } from 'next/server'

// Node.js runtime for long TTS requests
export const runtime = 'nodejs'
export const maxDuration = 60

const MINIMAX_BASE = 'https://api.minimax.io/v1'

// MiniMax T2A v2 HTTP endpoint
// POST /v1/t2a_v2
// Returns { data: { audio: "<hex>", ... } }

// Voice IDs must match exactly what VoiceChat.tsx picker sends
const VOICE_MAP: Record<string, string> = {
  'Wise_Woman':       'Wise_Woman',
  'Friendly_Person':  'Friendly_Person',
  'Deep_Voice_Man':   'Deep_Voice_Man',
  'Calm_Woman':       'Calm_Woman',
  'Lively_Girl':      'Lively_Girl',
  'Gentle_Man':       'Gentle_Man',
  'Confident_Woman':  'Confident_Woman',
  'news_anchor_en':   'news_anchor_en',
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.MINIMAX_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'MINIMAX_API_KEY not configured' }, { status: 500 })
  }

  let text: string
  let model: string
  let voiceId: string
  let speed: number

  try {
    const body = await req.json()
    text = body.text
    model = body.model || 'speech-01-turbo'
    voiceId = body.voice_id || 'Wise_Woman'
    speed = body.speed ?? 1.0
    if (!text) throw new Error('Missing text')
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const resolvedVoice = VOICE_MAP[voiceId] || 'Wise_Woman'

  try {
    const res = await fetch(`${MINIMAX_BASE}/t2a_v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        text,
        stream: false,
        voice_setting: {
          voice_id: resolvedVoice,
          speed,
          pitch: 0,
          vol: 1,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
          channel: 1,
        },
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      return NextResponse.json(
        { error: err.message || err.error || `MiniMax T2A ${res.status}` },
        { status: res.status }
      )
    }

    const data = await res.json()

    // MiniMax T2A returns audio as hex string in data.data.audio
    const hexAudio = data?.data?.audio
    if (!hexAudio) {
      return NextResponse.json({ error: 'No audio returned from MiniMax T2A' }, { status: 500 })
    }

    // Convert hex to base64
    const bytes = Buffer.from(hexAudio, 'hex')
    const base64 = bytes.toString('base64')
    const audioDataUrl = `data:audio/mp3;base64,${base64}`

    return NextResponse.json({ url: audioDataUrl, model, voice: resolvedVoice })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Speech generation failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
