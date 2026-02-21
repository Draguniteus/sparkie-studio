import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

const IMAGE_MODELS = new Set(['flux', 'flux-realism', 'flux-anime', 'flux-3d', 'turbo', 'gptimage'])
const VIDEO_MODELS = new Set(['seedance', 'seedance-pro', 'veo', 'wan', 'ltx-2'])
const ALL_MODELS = new Set([...IMAGE_MODELS, ...VIDEO_MODELS])

const MAX_PROMPT_LENGTH = 500
const ALLOWED_DIMS = [256, 512, 768, 1024, 1280, 1536]

function clampDim(v: string | null, fallback: number): number {
  const n = parseInt(v ?? String(fallback))
  if (isNaN(n)) return fallback
  // snap to nearest allowed dimension
  return ALLOWED_DIMS.reduce((a, b) => Math.abs(b - n) < Math.abs(a - n) ? b : a)
}

// POST: initiate generation, return proxy URL
export async function POST(req: NextRequest) {
  try {
    const { prompt, width = 1024, height = 1024, model = 'flux', duration } = await req.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const safePrompt = prompt.slice(0, MAX_PROMPT_LENGTH)
    const safeModel = ALL_MODELS.has(model) ? model : 'flux'
    const isVideo = VIDEO_MODELS.has(safeModel)
    const seed = Math.floor(Math.random() * 1_000_000)

    const params = new URLSearchParams({
      prompt: safePrompt,
      width: String(clampDim(String(width), 1024)),
      height: String(clampDim(String(height), 1024)),
      model: safeModel,
      seed: String(seed),
    })

    if (isVideo && duration) {
      params.set('duration', String(Math.min(Math.max(parseInt(String(duration)) || 5, 1), 30)))
    }

    return NextResponse.json({
      url: `/api/image?${params.toString()}`,
      prompt: safePrompt,
      width, height, model: safeModel, seed,
      type: isVideo ? 'video' : 'image',
    })
  } catch {
    return NextResponse.json({ error: 'Failed to generate media' }, { status: 500 })
  }
}

// GET: proxy binary from Pollinations (API key stays server-side, URL never user-controlled)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const prompt = searchParams.get('prompt')
    const width = searchParams.get('width') || '1024'
    const height = searchParams.get('height') || '1024'
    const model = searchParams.get('model') || 'flux'
    const seed = searchParams.get('seed') || '0'
    const duration = searchParams.get('duration')

    if (!prompt) return new Response('Missing prompt', { status: 400 })

    // Validate model — reject anything outside known list (prevents probing unknown endpoints)
    const safeModel = ALL_MODELS.has(model) ? model : 'flux'
    const safeWidth = clampDim(width, 1024)
    const safeHeight = clampDim(height, 1024)
    const safeSeed = Math.abs(parseInt(seed) || 0)

    const imageUrl = new URL(`https://gen.pollinations.ai/image/${encodeURIComponent(prompt.slice(0, MAX_PROMPT_LENGTH))}`)
    imageUrl.searchParams.set('width', String(safeWidth))
    imageUrl.searchParams.set('height', String(safeHeight))
    imageUrl.searchParams.set('model', safeModel)
    imageUrl.searchParams.set('seed', String(safeSeed))
    imageUrl.searchParams.set('nologo', 'true')
    if (duration) imageUrl.searchParams.set('duration', String(Math.min(parseInt(duration) || 5, 30)))

    const headers: Record<string, string> = { 'User-Agent': 'SparkieStudio/2.0' }
    const apiKey = process.env.POLLINATIONS_API_KEY
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

    const response = await fetch(imageUrl.toString(), { headers })
    if (!response.ok) return new Response(`Generation failed: ${response.status}`, { status: response.status })

    const contentType = response.headers.get('content-type') || 'image/png'
    // Only forward image/video content types — never forward unexpected content
    if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
      return new Response('Unexpected content type from upstream', { status: 502 })
    }

    return new Response(response.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return new Response('Internal server error', { status: 500 })
  }
}
