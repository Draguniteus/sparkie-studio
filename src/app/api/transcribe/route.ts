import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_AUDIO_BYTES = 10 * 1024 * 1024 // 10 MB
const MAX_RETRIES = 2

async function tryGroq(audioBuffer: ArrayBuffer, contentType: string, groqKey: string): Promise<string | null> {
  const ext = contentType.includes('mp4') ? 'mp4'
             : contentType.includes('ogg')  ? 'ogg'
             : contentType.includes('wav')  ? 'wav'
             : contentType.includes('flac') ? 'flac'
             : 'webm'
  const form = new FormData()
  form.append('file', new Blob([audioBuffer], { type: contentType }), `audio.${ext}`)
  form.append('model', 'whisper-large-v3-turbo')
  form.append('response_format', 'json')
  form.append('language', 'en')

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}` },
    body: form,
    signal: AbortSignal.timeout(15000),
  })

  if (!res.ok) {
    console.error('[transcribe] Groq failed:', res.status)
    return null
  }
  const data = await res.json()
  return data?.text?.trim() ?? null
}

async function tryDeeepgram(audioBuffer: ArrayBuffer, contentType: string, deepgramKey: string): Promise<string | null> {
  const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true', {
    method: 'POST',
    headers: { Authorization: `Token ${deepgramKey}`, 'Content-Type': contentType },
    body: audioBuffer,
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    console.error('[transcribe] Deepgram failed:', res.status)
    return null
  }
  const data = await res.json()
  const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''
  const confidence = data?.results?.channels?.[0]?.alternatives?.[0]?.confidence ?? 0
  // If confidence is very low, treat as failed (avoid acting on garbage transcription)
  if (confidence < 0.3 && transcript.split(' ').length < 3) {
    console.warn('[transcribe] Deepgram low confidence:', confidence, transcript)
    return null
  }
  return transcript || null
}

export async function POST(req: NextRequest) {
  const groqKey      = process.env.GROQ_API_KEY
  const deepgramKey  = process.env.DEEPGRAM_API_KEY

  if (!groqKey && !deepgramKey) {
    return new Response(JSON.stringify({ error: 'No STT API key configured' }), { status: 500 })
  }

  const contentType = (req.headers.get('content-type') ?? '').split(';')[0].trim()
  const audioBuffer = await req.arrayBuffer()

  if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
    return new Response(JSON.stringify({ error: 'Audio too large (max 10 MB)' }), { status: 413 })
  }

  // ── Groq Whisper (primary) with auto-retry ───────────────────────────────
  if (groqKey) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const transcript = await tryGroq(audioBuffer, contentType, groqKey)
        if (transcript !== null) {
          return new Response(JSON.stringify({ transcript, provider: 'groq' }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
      } catch (e) {
        console.error(`[transcribe] Groq attempt ${attempt + 1} error:`, e)
      }
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 500)) // brief pause before retry
      }
    }
    // Fall through to Deepgram
  }

  // ── Deepgram (fallback) with auto-retry ──────────────────────────────────
  if (deepgramKey) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const transcript = await tryDeeepgram(audioBuffer, contentType, deepgramKey)
        if (transcript !== null) {
          return new Response(JSON.stringify({ transcript, provider: 'deepgram' }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
      } catch (e) {
        console.error(`[transcribe] Deepgram attempt ${attempt + 1} error:`, e)
      }
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 500))
      }
    }
  }

  // Both failed — surface gracefully to client
  return new Response(JSON.stringify({ 
    error: 'Transcription failed',
    recovery_hint: 'Both STT providers unavailable — please try again or type your message'
  }), { status: 500 })
}
