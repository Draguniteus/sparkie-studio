import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 300

// DO Gradient AI — Stable Audio 2.5 (Text-to-Audio)
// Model: fal-ai/stable-audio-25/text-to-audio
// Uses async-invoke → poll status → return audio URL
// Great for: SFX, ambient tracks, short musical clips (up to 60s)

const DO_INFERENCE_BASE = 'https://inference.do-ai.run/v1'
const DO_MODEL_ACCESS_KEY = process.env.DO_MODEL_ACCESS_KEY || ''

export async function POST(req: NextRequest) {
  const {
    prompt,
    seconds_total = 30,
  } = await req.json() as { prompt: string; seconds_total?: number }

  if (!DO_MODEL_ACCESS_KEY) {
    return new Response(JSON.stringify({ error: 'DO_MODEL_ACCESS_KEY not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  const headers = {
    Authorization: `Bearer ${DO_MODEL_ACCESS_KEY}`,
    'Content-Type': 'application/json',
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (data: string) => controller.enqueue(enc.encode(data))

      const keepaliveInterval = setInterval(() => {
        try { send(': keepalive\n\n') } catch { /* closed */ }
      }, 15000)

      try {
        // Submit async job
        const invokeRes = await fetch(`${DO_INFERENCE_BASE}/async-invoke`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model_id: 'fal-ai/stable-audio-25/text-to-audio',
            input: { prompt, seconds_total },
          }),
        })
        const invokeData = await invokeRes.json() as { request_id: string }
        const requestId = invokeData.request_id

        send(': queued\n\n')

        // Poll up to 120 iterations × 3s = 360s max
        let audioUrl: string | null = null
        for (let i = 0; i < 120; i++) {
          await new Promise(r => setTimeout(r, 3000))
          const statusRes = await fetch(`${DO_INFERENCE_BASE}/async-invoke/${requestId}/status`, { headers })
          const statusData = await statusRes.json() as { status: string }

          if (statusData.status === 'COMPLETE') {
            const resultRes = await fetch(`${DO_INFERENCE_BASE}/async-invoke/${requestId}`, { headers })
            const result = await resultRes.json() as {
              output?: { audio_file?: { url: string } | { url: string }[] }
            }
            const audioField = result.output?.audio_file
            audioUrl = Array.isArray(audioField) ? audioField[0]?.url : audioField?.url ?? null
            break
          }
          if (statusData.status === 'FAILED') throw new Error('Audio generation failed')
        }

        if (!audioUrl) throw new Error('Audio generation timed out')
        send(`data: ${JSON.stringify({ audio_url: audioUrl, model: 'stable-audio-2.5' })}\n\n`)
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
