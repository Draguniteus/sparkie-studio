import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

const MINIMAX_BASE = 'https://api.minimax.io/v1'

const VOICE_MAP: Record<string, string> = {
  'English_radiant_girl':           'English_radiant_girl',
  'English_PlayfulGirl':            'English_PlayfulGirl',
  'English_LovelyGirl':             'English_LovelyGirl',
  'English_Kind-heartedGirl':       'English_Kind-heartedGirl',
  'English_WhimsicalGirl':          'English_WhimsicalGirl',
  'English_Soft-spokenGirl':        'English_Soft-spokenGirl',
  'English_Whispering_girl':        'English_Whispering_girl',
  'English_UpsetGirl':              'English_UpsetGirl',
  'English_AnimeCharacter':         'English_AnimeCharacter',
  'English_CalmWoman':              'English_CalmWoman',
  'English_Upbeat_Woman':           'English_Upbeat_Woman',
  'English_SereneWoman':            'English_SereneWoman',
  'English_ConfidentWoman':         'English_ConfidentWoman',
  'English_AssertiveQueen':         'English_AssertiveQueen',
  'English_ImposingManner':         'English_ImposingManner',
  'English_WiseladyWise':           'English_WiseladyWise',
  'English_Graceful_Lady':          'English_Graceful_Lady',
  'English_compelling_lady1':       'English_compelling_lady1',
  'English_captivating_female1':    'English_captivating_female1',
  'English_MaturePartner':          'English_MaturePartner',
  'English_MatureBoss':             'English_MatureBoss',
  'English_SentimentalLady':        'English_SentimentalLady',
  'English_StressedLady':           'English_StressedLady',
  'English_expressive_narrator':    'English_expressive_narrator',
  'English_ManWithDeepVoice':       'English_ManWithDeepVoice',
  'English_Gentle-voiced_man':      'English_Gentle-voiced_man',
  'English_FriendlyPerson':         'English_FriendlyPerson',
  'news_anchor_en':                 'news_anchor_en',
}

// Streaming TTS — pipes MiniMax audio stream directly to client
// Client can start playing before full audio is generated (halves perceived latency)
export async function POST(req: NextRequest) {
  const apiKey = process.env.MINIMAX_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'MINIMAX_API_KEY not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  let text: string, model: string, voiceId: string, speed: number
  try {
    const body = await req.json()
    text    = body.text
    model   = body.model   || 'speech-02-turbo'
    voiceId = body.voice_id || 'English_radiant_girl'
    speed   = body.speed   ?? 1.0
    if (!text) throw new Error('Missing text')
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const resolvedVoice = VOICE_MAP[voiceId] || voiceId || 'English_radiant_girl'

  try {
    const upstream = await fetch(`${MINIMAX_BASE}/t2a_v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        text,
        stream: true,
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

    if (!upstream.ok || !upstream.body) {
      const err = await upstream.text()
      return new Response(JSON.stringify({ error: `MiniMax TTS error ${upstream.status}: ${err}` }), {
        status: upstream.status, headers: { 'Content-Type': 'application/json' },
      })
    }

    // MiniMax streaming T2A returns SSE lines like:
    // data: {"data":{"audio":"<hex_chunk>","status":1},"trace_id":"..."}
    // status 1 = in progress, 2 = done
    // We decode hex chunks and stream raw MP3 bytes to the client.

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
    const writer = writable.getWriter()

    ;(async () => {
      const reader = upstream.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const jsonStr = trimmed.slice(5).trim()
            if (jsonStr === '[DONE]') continue
            try {
              const parsed = JSON.parse(jsonStr)
              const hexChunk = parsed?.data?.audio
              if (hexChunk && hexChunk.length > 0) {
                const bytes = Buffer.from(hexChunk, 'hex')
                await writer.write(new Uint8Array(bytes))
              }
            } catch { /* skip malformed SSE lines */ }
          }
        }
      } finally {
        await writer.close()
      }
    })()

    return new Response(readable, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Streaming TTS failed'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
