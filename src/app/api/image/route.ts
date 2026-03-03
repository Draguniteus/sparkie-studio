import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 120

// New Pollinations base: gen.pollinations.ai (previously image.pollinations.ai/prompt)
const POLLINATIONS_BASE = 'https://gen.pollinations.ai/image'

// Auth header — key stored in POLLINATIONS_API_KEY env var
function pollinationsHeaders(): Record<string, string> {
  const key = process.env.POLLINATIONS_API_KEY
  const h: Record<string, string> = { 'User-Agent': 'SparkieStudio/1.0' }
  if (key) h['Authorization'] = `Bearer ${key}`
  return h
}

const MODEL_MAP: Record<string, string> = {
  // Pollinations image models
  'flux':                'flux',
  'zimage':              'zimage',
  'imagen-4':            'imagen-4',
  'grok-imagine':        'grok-imagine',
  'klein':               'klein',
  'klein-large':         'klein-large',
  'gptimage':            'gptimage',
  // Legacy aliases
  'fal-ai/flux/schnell': 'flux',
  'fal-ai/fast-sdxl':   'flux',
  'turbo':               'zimage',
  'image-01':            'flux',
}

// GET /api/image?prompt=...&model=...&w=...&h=...&seed=...
// Proxies the image bytes from Pollinations so the client never loads pollinations.ai directly.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const prompt = searchParams.get('prompt') || ''
  const model  = searchParams.get('model')  || 'flux'
  const w      = parseInt(searchParams.get('w')    || '1024', 10)
  const h      = parseInt(searchParams.get('h')    || '1024', 10)
  const seed   = searchParams.get('seed')   || '1'

  if (!prompt.trim()) {
    return new Response('prompt required', { status: 400 })
  }

  const pollinationsModel = MODEL_MAP[model] || 'flux'
  const encodedPrompt = encodeURIComponent(prompt)
  const pollinationsUrl = `${POLLINATIONS_BASE}/${encodedPrompt}?model=${pollinationsModel}&width=${w}&height=${h}&nologo=true&seed=${seed}`

  try {
    const imgRes = await fetch(pollinationsUrl, {
      headers: pollinationsHeaders(),
      signal: AbortSignal.timeout(55000),
    })

    if (!imgRes.ok) {
      return new Response(
        JSON.stringify({ error: 'Image generation temporarily unavailable (upstream ' + imgRes.status + ')' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
    const buffer = await imgRes.arrayBuffer()
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch {
    return new Response(
      JSON.stringify({ error: 'Image generation timed out or service is offline' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// POST /api/image — fetches image bytes and returns a data URL
// Goes directly to Pollinations: respects selected model, falls back to flux/zimage
// Total timeout budget: ~95s (well under 120s maxDuration)
export async function POST(req: NextRequest) {
  const { prompt, model: _model = 'flux', size = '1024x1024' } = await req.json() as {
    prompt: string
    model?: string
    size?: string
    n?: number
  }

  if (!prompt?.trim()) {
    return new Response(JSON.stringify({ error: 'prompt required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const [w, h] = (size || '1024x1024').split('x').map(Number)
  const seed = Math.floor(Math.random() * 999999)

  // Resolve the requested model (or default to flux)
  const requestedModel = MODEL_MAP[_model] || 'flux'

  // Build model fallback list: requested model first, then reliable fast models
  const fallbackModels = ['flux', 'zimage'].filter(m => m !== requestedModel)
  const modelOrder = [requestedModel, ...fallbackModels]

  // Try each model with a 25s timeout — total max ~75s, safely under 120s maxDuration
  for (const polModel of modelOrder) {
    try {
      const encodedPrompt = encodeURIComponent(prompt)
      const polUrl = POLLINATIONS_BASE + '/' + encodedPrompt +
        '?model=' + polModel + '&width=' + (w || 1024) + '&height=' + (h || 1024) +
        '&nologo=true&seed=' + seed
      const imgRes = await fetch(polUrl, {
        headers: pollinationsHeaders(),
        signal: AbortSignal.timeout(25000),
      })
      if (!imgRes.ok) continue
      const ct = imgRes.headers.get('content-type') || 'image/jpeg'
      const buf = await imgRes.arrayBuffer()
      const dataUrl = 'data:' + ct + ';base64,' + Buffer.from(buf).toString('base64')
      return new Response(JSON.stringify({ url: dataUrl, model: polModel }), {
        headers: { 'Content-Type': 'application/json' },
      })
    } catch { continue }
  }

  return new Response(
    JSON.stringify({ error: 'Image generation unavailable. Please try again in a moment.' }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  )
}
