import { NextRequest } from 'next/server'

export const runtime = 'edge'

const MAX_AUDIO_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/mp3',
  'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac',
])

export async function POST(req: NextRequest) {
  const deepgramKey = process.env.DEEPGRAM_API_KEY
  if (!deepgramKey) {
    return new Response(JSON.stringify({ error: 'DEEPGRAM_API_KEY not configured' }), { status: 500 })
  }

  // ── Size guard ──────────────────────────────────────────────────────
  const contentLength = req.headers.get('content-length')
  if (contentLength && parseInt(contentLength) > MAX_AUDIO_BYTES) {
    return new Response(JSON.stringify({ error: 'Audio file too large (max 10 MB)' }), { status: 413 })
  }

  // ── Content-type validation ─────────────────────────────────────────
  const contentType = (req.headers.get('content-type') ?? '').split(';')[0].trim()
  if (!ALLOWED_AUDIO_TYPES.has(contentType)) {
    return new Response(JSON.stringify({ error: 'Unsupported audio format' }), { status: 415 })
  }

  try {
    const audioBuffer = await req.arrayBuffer()

    // Double-check actual size after reading (content-length can be spoofed)
    if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
      return new Response(JSON.stringify({ error: 'Audio file too large (max 10 MB)' }), { status: 413 })
    }

    const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramKey}`,
        'Content-Type': contentType,
      },
      body: audioBuffer,
    })

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Deepgram error: ${res.status}` }), { status: 500 })
    }

    const data = await res.json()
    const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''
    return new Response(JSON.stringify({ transcript }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Transcription failed' }), { status: 500 })
  }
}
