import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 120

// DO Gradient AI — ElevenLabs Multilingual TTS v2
// Model: fal-ai/elevenlabs/tts/multilingual-v2
// Uses async-invoke → poll status → return audio URL
// 29 languages, high quality

const DO_INFERENCE_BASE = 'https://inference.do-ai.run/v1'
const DO_MODEL_ACCESS_KEY = process.env.DO_MODEL_ACCESS_KEY || ''

export async function POST(req: NextRequest) {
  const { text, voice_id } = await req.json() as { text: string; voice_id?: string }

  if (!DO_MODEL_ACCESS_KEY) {
    return new Response(JSON.stringify({ error: 'DO_MODEL_ACCESS_KEY not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  const headers = {
    Authorization: `Bearer ${DO_MODEL_ACCESS_KEY}`,
    'Content-Type': 'application/json',
  }

  const input: Record<string, string> = { text }
  if (voice_id) input.voice_id = voice_id

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (data: string) => controller.enqueue(enc.encode(data))

      const keepaliveInterval = setInterval(() => {
        try { send(': keepalive\n\n') } catch { /* closed */ }
      }, 15000)

      try {
        const invokeRes = await fetch(`${DO_INFERENCE_BASE}/async-invoke`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model_id: 'fal-ai/elevenlabs/tts/multilingual-v2',
            input,
          }),
        })
        const invokeData = await invokeRes.json() as { request_id: string }
        const requestId = invokeData.request_id

        send(': queued\n\n')

        // Poll up to 60 iterations × 2s = 120s max
        let audioUrl: string | null = null
        for (let i = 0; i < 60; i++) {
          await new Promise(r => setTimeout(r, 2000))
          const statusRes = await fetch(`${DO_INFERENCE_BASE}/async-invoke/${requestId}/status`, { headers })
          const statusData = await statusRes.json() as { status: string }

          if (statusData.status === 'COMPLETE') {
            const resultRes = await fetch(`${DO_INFERENCE_BASE}/async-invoke/${requestId}`, { headers })
            const result = await resultRes.json() as {
              output?: { audio?: { url: string } | string }
            }
            const audioField = result.output?.audio
            audioUrl = typeof audioField === 'string' ? audioField : audioField?.url ?? null
            break
          }
          if (statusData.status === 'FAILED') throw new Error('TTS generation failed')
        }

        if (!audioUrl) throw new Error('TTS generation timed out')
        send(`data: ${JSON.stringify({ audio_url: audioUrl, model: 'elevenlabs-multilingual-v2' })}\n\n`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        send(`data: ${JSON.stringify({ error: msg })}\n\n`)
      } finally {
        clearInterval(keepaliveInterval)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}
