import { NextRequest, NextResponse } from 'next/server'

// Node.js runtime for long TTS requests
export const runtime = 'nodejs'
export const maxDuration = 60

const MINIMAX_BASE = 'https://api.minimax.io/v1'

// MiniMax T2A v2 HTTP endpoint
// POST /v1/t2a_v2
// Returns { data: { audio: "<hex>", ... } }

// Voice IDs — all system voices from platform.minimax.io/docs/faq/system-voice-id
// Map passes through directly; unknown IDs fall back to English_CalmWoman
const VOICE_MAP: Record<string, string> = {
  // English Female / Girl
  'English_radiant_girl':        'English_radiant_girl',
  'English_captivating_female1': 'English_captivating_female1',
  'English_Upbeat_Woman':        'English_Upbeat_Woman',
  'English_CalmWoman':           'English_CalmWoman',
  'English_UpsetGirl':           'English_UpsetGirl',
  'English_Whispering_girl':     'English_Whispering_girl',
  'English_Graceful_Lady':       'English_Graceful_Lady',
  'English_PlayfulGirl':         'English_PlayfulGirl',
  'English_MaturePartner':       'English_MaturePartner',
  'English_MatureBoss':          'English_MatureBoss',
  'English_LovelyGirl':          'English_LovelyGirl',
  'English_WiseladyWise':        'English_WiseladyWise',
  'English_compelling_lady1':    'English_compelling_lady1',
  'English_SentimentalLady':     'English_SentimentalLady',
  'English_ImposingManner':      'English_ImposingManner',
  'English_Soft-spokenGirl':     'English_Soft-spokenGirl',
  'English_SereneWoman':         'English_SereneWoman',
  'English_ConfidentWoman':      'English_ConfidentWoman',
  'English_StressedLady':        'English_StressedLady',
  'English_AssertiveQueen':      'English_AssertiveQueen',
  'English_AnimeCharacter':      'English_AnimeCharacter',
  'English_WhimsicalGirl':       'English_WhimsicalGirl',
  'English_Kind-heartedGirl':    'English_Kind-heartedGirl',
  // English Male
  'English_expressive_narrator': 'English_expressive_narrator',
  'English_magnetic_voiced_man': 'English_magnetic_voiced_man',
  'English_Trustworth_Man':      'English_Trustworth_Man',
  'English_Gentle-voiced_man':   'English_Gentle-voiced_man',
  'English_ReservedYoungMan':    'English_ReservedYoungMan',
  'English_ManWithDeepVoice':    'English_ManWithDeepVoice',
  'English_FriendlyPerson':      'English_FriendlyPerson',
  'English_DecentYoungMan':      'English_DecentYoungMan',
  'English_CaptivatingStoryteller': 'English_CaptivatingStoryteller',
  'news_anchor_en':              'news_anchor_en',
  // Legacy speech-01 IDs (kept for backward compatibility)
  'Wise_Woman':       'Wise_Woman',
  'Friendly_Person':  'Friendly_Person',
  'Deep_Voice_Man':   'Deep_Voice_Man',
  'Calm_Woman':       'Calm_Woman',
  'Lively_Girl':      'Lively_Girl',
  'Gentle_Man':       'Gentle_Man',
  'Confident_Woman':  'Confident_Woman',
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
    voiceId = body.voice_id || 'English_CalmWoman'
    speed = body.speed ?? 1.0
    if (!text) throw new Error('Missing text')
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const resolvedVoice = VOICE_MAP[voiceId] || voiceId || 'English_CalmWoman'

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
