import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_AUDIO_BYTES = 10 * 1024 * 1024 // 10 MB

export async function POST(req: NextRequest) {
  const groqKey  = process.env.GROQ_API_KEY
  const deepgramKey = process.env.DEEPGRAM_API_KEY

  if (!groqKey && !deepgramKey) {
    return new Response(JSON.stringify({ error: 'No STT API key configured' }), { status: 500 })
  }

  const contentType = (req.headers.get('content-type') ?? '').split(';')[0].trim()
  const audioBuffer = await req.arrayBuffer()

  if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
    return new Response(JSON.stringify({ error: 'Audio too large (max 10 MB)' }), { status: 413 })
  }

  // ── Groq Whisper (primary — fastest available STT ~200ms) ──────────
  if (groqKey) {
    try {
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

      if (res.ok) {
        const data = await res.json()
        const transcript = data?.text?.trim() ?? ''
        return new Response(JSON.stringify({ transcript, provider: 'groq' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }
      // If Groq fails, fall through to Deepgram
      console.error('[transcribe] Groq failed:', res.status, await res.text().catch(() => ''))
    } catch (e) {
      console.error('[transcribe] Groq error:', e)
    }
  }

  // ── Deepgram nova-2 (fallback) ─────────────────────────────────────
  if (deepgramKey) {
    try {
      const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true', {
        method: 'POST',
        headers: { Authorization: `Token ${deepgramKey}`, 'Content-Type': contentType },
        body: audioBuffer,
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) throw new Error(`Deepgram ${res.status}`)
      const data = await res.json()
      const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''
      return new Response(JSON.stringify({ transcript, provider: 'deepgram' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (e) {
      console.error('[transcribe] Deepgram error:', e)
    }
  }

  return new Response(JSON.stringify({ error: 'Transcription failed' }), { status: 500 })
}
