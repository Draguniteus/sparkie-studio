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
// Provider chain: SiliconFlow FLUX (free) → MiniMax image-01 → Pollinations (fallback)
export async function POST(req: NextRequest) {
  const { prompt, model: _model = 'flux', size = '1024x1024', n: _n = 1 } = await req.json() as {
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

  // Helper: fetch URL → data URL
  async function toDataUrl(url: string): Promise<string | null> {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) })
      if (!r.ok) return null
      const ct = r.headers.get('content-type') || 'image/jpeg'
      const buf = await r.arrayBuffer()
      return 'data:' + ct + ';base64,' + Buffer.from(buf).toString('base64')
    } catch { return null }
  }

  // ── Provider 1: SiliconFlow FLUX.1-schnell (free) ──────────────────────────
  const sfKey = process.env.SILICONFLOW_API_KEY
  if (sfKey) {
    try {
      const sfRes = await fetch('https://api.siliconflow.cn/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + sfKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'black-forest-labs/FLUX.1-schnell', prompt, n: 1, image_size: (w || 1024) + 'x' + (h || 1024) }),
        signal: AbortSignal.timeout(40000),
      })
      if (sfRes.ok) {
        const sfData = await sfRes.json() as { images?: Array<{ url: string }> }
        const imgUrl = sfData.images?.[0]?.url
        if (imgUrl) {
          const dataUrl = await toDataUrl(imgUrl) ?? imgUrl
          return new Response(JSON.stringify({ url: dataUrl, model: 'siliconflow-flux' }), { headers: { 'Content-Type': 'application/json' } })
        }
      }
    } catch { /* fall through */ }
  }

  // ── Provider 2: MiniMax image-01 ───────────────────────────────────────────
  const mmKey = process.env.MINIMAX_API_KEY
  if (mmKey) {
    try {
      const mmRes = await fetch('https://api.minimax.io/v1/image_generation', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + mmKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'image-01', prompt, aspect_ratio: '1:1', response_format: 'url' }),
        signal: AbortSignal.timeout(40000),
      })
      if (mmRes.ok) {
        const mmData = await mmRes.json() as { data?: Array<{ url: string }> }
        const imgUrl = mmData.data?.[0]?.url
        if (imgUrl) {
          const dataUrl = await toDataUrl(imgUrl) ?? imgUrl
          return new Response(JSON.stringify({ url: dataUrl, model: 'minimax-image-01' }), { headers: { 'Content-Type': 'application/json' } })
        }
      }
    } catch { /* fall through */ }
  }

  // ── Provider 3: Pollinations (fallback) ────────────────────────────────────
  const encodedPrompt = encodeURIComponent(prompt)
  for (const polModel of ['turbo', 'flux']) {
    try {
      const polUrl = POLLINATIONS_BASE + '/' + encodedPrompt + '?model=' + polModel + '&width=' + (w || 1024) + '&height=' + (h || 1024) + '&nologo=true&seed=' + seed
      const imgRes = await fetch(polUrl, { headers: { 'User-Agent': 'SparkieStudio/1.0' }, signal: AbortSignal.timeout(45000) })
      if (!imgRes.ok) continue
      const ct = imgRes.headers.get('content-type') || 'image/jpeg'
      const buf = await imgRes.arrayBuffer()
      const dataUrl = 'data:' + ct + ';base64,' + Buffer.from(buf).toString('base64')
      return new Response(JSON.stringify({ url: dataUrl, model: polModel }), { headers: { 'Content-Type': 'application/json' } })
    } catch { continue }
  }

  return new Response(JSON.stringify({ error: 'All image providers unavailable. Please try again.' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
}
