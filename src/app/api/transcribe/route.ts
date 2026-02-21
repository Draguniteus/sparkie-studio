import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  const deepgramKey = process.env.DEEPGRAM_API_KEY
  if (!deepgramKey) {
    return new Response(JSON.stringify({ error: 'DEEPGRAM_API_KEY not configured' }), { status: 500 })
  }
  try {
    const audioBuffer = await req.arrayBuffer()
    const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramKey}`,
        'Content-Type': req.headers.get('content-type') ?? 'audio/webm',
      },
      body: audioBuffer,
    })
    if (!res.ok) {
      const err = await res.text()
      return new Response(JSON.stringify({ error: `Deepgram error: ${res.status}` }), { status: 500 })
    }
    const data = await res.json()
    const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''
    return new Response(JSON.stringify({ transcript }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Transcription failed' }), { status: 500 })
  }
}
