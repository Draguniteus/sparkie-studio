import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt'

const MODEL_MAP: Record<string, string> = {
  'flux':                'flux',
  'fal-ai/flux/schnell': 'flux',
  'fal-ai/fast-sdxl':   'flux',
  'klein':               'flux-schnell',
  'klein-large':         'flux',
  'gptimage':            'flux',
  'image-01':            'flux',
  'turbo':               'turbo',
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
      headers: { 'User-Agent': 'SparkieStudio/1.0' },
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

// POST /api/image — returns a proxied URL (our own server, not pollinations.ai directly)
export async function POST(req: NextRequest) {
  const { prompt, model = 'flux', size = '1024x1024', n: _n = 1 } = await req.json() as {
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
  const pollinationsModel = MODEL_MAP[model] || 'flux'
  const seed = Math.floor(Math.random() * 999999)

  // Return a proxied URL that goes through our server — not pollinations.ai directly.
  // This prevents broken images when Pollinations CDN is down.
  const encodedPrompt = encodeURIComponent(prompt)
  const proxyUrl = '/api/image?' +
    'prompt=' + encodedPrompt +
    '&model=' + pollinationsModel +
    '&w=' + (w || 1024) +
    '&h=' + (h || 1024) +
    '&seed=' + seed

  return new Response(
    JSON.stringify({ url: proxyUrl, model: pollinationsModel }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}
