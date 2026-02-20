import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

const VIDEO_MODELS = ['seedance', 'seedance-pro', 'veo', 'wan', 'ltx-2']

// POST: initiate generation, return proxy URL
export async function POST(req: NextRequest) {
  try {
    const { prompt, width = 1024, height = 1024, model = 'flux', duration } = await req.json()

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const seed = Math.floor(Math.random() * 1000000)
    const isVideo = VIDEO_MODELS.includes(model)

    const params = new URLSearchParams({
      prompt,
      width: String(width),
      height: String(height),
      model,
      seed: String(seed),
    })

    if (isVideo && duration) {
      params.set('duration', String(duration))
    }

    const proxyUrl = `/api/image?${params.toString()}`

    return NextResponse.json({
      url: proxyUrl,
      prompt,
      width,
      height,
      model,
      seed,
      type: isVideo ? 'video' : 'image',
    })
  } catch (error) {
    console.error('Media API error:', error)
    return NextResponse.json({ error: 'Failed to generate media' }, { status: 500 })
  }
}

// GET: proxy binary from Pollinations (keeps API key server-side)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const prompt = searchParams.get('prompt')
    const width = searchParams.get('width') || '1024'
    const height = searchParams.get('height') || '1024'
    const model = searchParams.get('model') || 'flux'
    const seed = searchParams.get('seed') || '0'
    const duration = searchParams.get('duration')

    if (!prompt) {
      return new Response('Missing prompt', { status: 400 })
    }

    const encodedPrompt = encodeURIComponent(prompt)
    let imageUrl = `https://gen.pollinations.ai/image/${encodedPrompt}?width=${width}&height=${height}&model=${model}&seed=${seed}&nologo=true`

    if (duration) {
      imageUrl += `&duration=${duration}`
    }

    const headers: Record<string, string> = {
      'User-Agent': 'SparkieStudio/2.0',
    }

    const apiKey = process.env.POLLINATIONS_API_KEY
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    const response = await fetch(imageUrl, { headers })

    if (!response.ok) {
      return new Response(`Generation failed: ${response.status}`, { status: response.status })
    }

    const contentType = response.headers.get('content-type') || 'image/png'

    return new Response(response.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (error) {
    console.error('Media proxy error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
