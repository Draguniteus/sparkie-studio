import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 120

// DO Gradient AI — Image Generation
// Supports:
//   fal-ai/flux/schnell  — fast, high quality
//   fal-ai/fast-sdxl     — fast SDXL
//   openai-gpt-image-1   — OpenAI GPT-Image-1.5 (via DO)
//
// fal models use async-invoke (POST → poll status → GET result)
// OpenAI model uses /v1/images/generations (sync)

const DO_INFERENCE_BASE = 'https://inference.do-ai.run/v1'
const DO_MODEL_ACCESS_KEY = process.env.DO_MODEL_ACCESS_KEY || ''

const FAL_MODELS = new Set(['fal-ai/flux/schnell', 'fal-ai/fast-sdxl'])

async function pollAsyncJob(requestId: string): Promise<{ url: string }> {
  const headers = {
    Authorization: `Bearer ${DO_MODEL_ACCESS_KEY}`,
    'Content-Type': 'application/json',
  }
  // Poll up to 60 iterations × 2s = 120s max
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const statusRes = await fetch(`${DO_INFERENCE_BASE}/async-invoke/${requestId}/status`, { headers })
    const statusData = await statusRes.json() as { status: string }
    if (statusData.status === 'COMPLETE') {
      const resultRes = await fetch(`${DO_INFERENCE_BASE}/async-invoke/${requestId}`, { headers })
      const result = await resultRes.json() as { output?: { images?: Array<{ url: string }> } }
      const imgUrl = result.output?.images?.[0]?.url
      if (imgUrl) return { url: imgUrl }
      throw new Error('No image URL in result')
    }
    if (statusData.status === 'FAILED') throw new Error('Image generation failed')
  }
  throw new Error('Image generation timed out')
}

export async function POST(req: NextRequest) {
  const { prompt, model = 'fal-ai/flux/schnell', size = '1024x1024', n = 1 } = await req.json() as {
    prompt: string; model?: string; size?: string; n?: number
  }

  if (!DO_MODEL_ACCESS_KEY) {
    return new Response(JSON.stringify({ error: 'DO_MODEL_ACCESS_KEY not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  const headers = {
    Authorization: `Bearer ${DO_MODEL_ACCESS_KEY}`,
    'Content-Type': 'application/json',
  }

  // SSE stream for polling-based fal models + keepalive
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (data: string) => controller.enqueue(enc.encode(data))

      const keepaliveInterval = setInterval(() => {
        try { send(': keepalive\n\n') } catch { /* closed */ }
      }, 15000)

      try {
        if (FAL_MODELS.has(model)) {
          // async-invoke path
          const invokeRes = await fetch(`${DO_INFERENCE_BASE}/async-invoke`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model_id: model,
              input: { prompt, num_images: n },
            }),
          })
          const invokeData = await invokeRes.json() as { request_id: string }
          const requestId = invokeData.request_id

          send(': queued\n\n')

          const result = await pollAsyncJob(requestId)
          send(`data: ${JSON.stringify({ url: result.url, model })}\n\n`)
        } else {
          // /v1/images/generations path (openai-gpt-image-1, etc.)
          const genRes = await fetch(`${DO_INFERENCE_BASE}/images/generations`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ model, prompt, n, size }),
          })
          const genData = await genRes.json() as { data: Array<{ b64_json?: string; url?: string }> }
          const b64 = genData.data?.[0]?.b64_json
          const url = genData.data?.[0]?.url
          send(`data: ${JSON.stringify({ b64_json: b64, url, model })}\n\n`)
        }
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
