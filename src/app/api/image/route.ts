import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

const POLLINATIONS_IMAGE_MODELS = new Set(['flux', 'flux-realism', 'flux-anime', 'flux-3d', 'turbo', 'gptimage', 'klein', 'klein-large', 'zimage'])
const POLLINATIONS_VIDEO_MODELS = new Set(['seedance', 'seedance-pro', 'veo', 'wan', 'ltx-2'])
const MINIMAX_IMAGE_MODELS = new Set(['image-01'])
const MINIMAX_VIDEO_MODELS = new Set(['hailuo-2.3-fast', 'hailuo-2.3', 'hailuo-02'])
const ALL_MODELS = new Set([
  ...Array.from(POLLINATIONS_IMAGE_MODELS),
  ...Array.from(POLLINATIONS_VIDEO_MODELS),
  ...Array.from(MINIMAX_IMAGE_MODELS),
  ...Array.from(MINIMAX_VIDEO_MODELS),
])

const MAX_PROMPT_LENGTH = 500
const ALLOWED_DIMS = [256, 512, 768, 1024, 1280, 1536]

function clampDim(v: string | null, fallback: number): number {
  const n = parseInt(v ?? String(fallback))
  if (isNaN(n)) return fallback
  return ALLOWED_DIMS.reduce((a, b) => Math.abs(b - n) < Math.abs(a - n) ? b : a)
}

// POST: initiate generation, return proxy URL or direct URL for MiniMax
export async function POST(req: NextRequest) {
  try {
    const { prompt, width = 1024, height = 1024, model = 'flux', duration } = await req.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const safePrompt = prompt.slice(0, MAX_PROMPT_LENGTH)
    const safeModel = ALL_MODELS.has(model) ? model : 'flux'

    // ── MiniMax image-01 ──────────────────────────────────────────────
    if (MINIMAX_IMAGE_MODELS.has(safeModel)) {
      const apiKey = process.env.MINIMAX_API_KEY
      if (!apiKey) return NextResponse.json({ error: 'MINIMAX_API_KEY not configured' }, { status: 500 })
      const mmRes = await fetch('https://api.minimaxi.chat/v1/image_generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'image-01', prompt: safePrompt }),
        signal: AbortSignal.timeout(60_000),
      })
      if (!mmRes.ok) return NextResponse.json({ error: `MiniMax ${mmRes.status}` }, { status: mmRes.status })
      const mmData = await mmRes.json()
      // MiniMax returns data.data.image_urls[] or data.data.images[{url}]
      const url = mmData?.data?.image_urls?.[0] || mmData?.data?.images?.[0]?.url
      if (!url) return NextResponse.json({ error: 'No image URL returned' }, { status: 500 })
      return NextResponse.json({ url, prompt: safePrompt, model: safeModel, type: 'image' })
    }

    // ── MiniMax Hailuo video ──────────────────────────────────────────
    if (MINIMAX_VIDEO_MODELS.has(safeModel)) {
      const apiKey = process.env.MINIMAX_API_KEY
      if (!apiKey) return NextResponse.json({ error: 'MINIMAX_API_KEY not configured' }, { status: 500 })

      // MiniMax video gen is async — submit task, poll for result
      const modelNameMap: Record<string, string> = {
        'hailuo-2.3-fast': 'video-01-hailuo-2.3-fast',
        'hailuo-2.3': 'video-01-hailuo-2.3',
        'hailuo-02': 'video-01',
      }
      const mmModel = modelNameMap[safeModel] || 'video-01'
      const submitRes = await fetch('https://api.minimaxi.chat/v1/video_generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: mmModel, prompt: safePrompt }),
        signal: AbortSignal.timeout(30_000),
      })
      if (!submitRes.ok) return NextResponse.json({ error: `MiniMax ${submitRes.status}` }, { status: submitRes.status })
      const submitData = await submitRes.json()
      const taskId = submitData?.task_id
      if (!taskId) return NextResponse.json({ error: 'No task_id returned' }, { status: 500 })

      // Poll for result (max 90s)
      for (let i = 0; i < 18; i++) {
        await new Promise(r => setTimeout(r, 5000))
        const pollRes = await fetch(`https://api.minimaxi.chat/v1/query/video_generation?task_id=${taskId}`, {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(15_000),
        })
        if (!pollRes.ok) continue
        const pollData = await pollRes.json()
        const status = pollData?.status
        if (status === 'Success') {
          const url = pollData?.file_id
            ? `https://api.minimaxi.chat/v1/files/retrieve?file_id=${pollData.file_id}`
            : pollData?.video_url
          if (url) return NextResponse.json({ url, prompt: safePrompt, model: safeModel, type: 'video' })
        }
        if (status === 'Fail') return NextResponse.json({ error: 'MiniMax video generation failed' }, { status: 500 })
      }
      return NextResponse.json({ error: 'Video generation timed out' }, { status: 504 })
    }

    // ── Pollinations (image + video) ──────────────────────────────────
    const isVideo = POLLINATIONS_VIDEO_MODELS.has(safeModel)
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
      prompt: safePrompt, width, height, model: safeModel, seed,
      type: isVideo ? 'video' : 'image',
    })
  } catch {
    return NextResponse.json({ error: 'Failed to generate media' }, { status: 500 })
  }
}

// GET: proxy binary from Pollinations (MiniMax requests are handled entirely in POST)
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

    // Only Pollinations models go through GET proxy
    const pollinationsModels = new Set([...Array.from(POLLINATIONS_IMAGE_MODELS), ...Array.from(POLLINATIONS_VIDEO_MODELS)])
    const safeModel = pollinationsModels.has(model) ? model : 'flux'
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
    if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
      return new Response('Unexpected content type from upstream', { status: 502 })
    }

    return new Response(response.body, {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' },
    })
  } catch {
    return new Response('Internal server error', { status: 500 })
  }
}
