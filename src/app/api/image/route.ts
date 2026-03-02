import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 120

const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt'

const MODEL_MAP: Record<string, string> = {
  'flux':                'turbo',   // default to turbo — 3–5x faster than flux
  'fal-ai/flux/schnell': 'turbo',
  'fal-ai/fast-sdxl':   'turbo',
  'klein':               'turbo',
  'klein-large':         'flux',    // quality-priority models keep flux
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

// POST /api/image — fetches image bytes and returns a data URL (eliminates browser GET 504s)
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
  const seed = Math.floor(Math.random() * 999999)

  // Try turbo first (faster), fall back to flux
  const modelsToTry = model === 'flux' ? ['turbo', 'flux'] : [MODEL_MAP[model] || 'turbo', 'turbo']
  const encodedPrompt = encodeURIComponent(prompt)

  for (const polModel of modelsToTry) {
    try {
      const polUrl = `${POLLINATIONS_BASE}/${encodedPrompt}?model=${polModel}&width=${w || 1024}&height=${h || 1024}&nologo=true&seed=${seed}`
      const imgRes = await fetch(polUrl, {
        headers: { 'User-Agent': 'SparkieStudio/1.0' },
        signal: AbortSignal.timeout(50000),
      })
      if (!imgRes.ok) continue
      const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
      const buffer = await imgRes.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      const dataUrl = `data:${contentType};base64,${base64}`
      return new Response(
        JSON.stringify({ url: dataUrl, model: polModel }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    } catch {
      continue
    }
  }

  // All timed out — return proxy URL as last resort
  const proxyUrl = '/api/image?prompt=' + encodedPrompt + '&model=turbo&w=' + (w || 1024) + '&h=' + (h || 1024) + '&seed=' + seed
  return new Response(
    JSON.stringify({ url: proxyUrl, model: 'turbo', fallback: true }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}
