import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

// POST: initiate image generation, return metadata
export async function POST(req: NextRequest) {
  try {
    const { prompt, width = 1024, height = 1024, model = 'flux' } = await req.json()

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const seed = Math.floor(Math.random() * 1000000)

    // Return a proxy URL that the client can use as an img src
    // The GET handler below will proxy the actual image with the API key
    const proxyUrl = `/api/image?prompt=${encodeURIComponent(prompt)}&width=${width}&height=${height}&model=${model}&seed=${seed}`

    return NextResponse.json({
      url: proxyUrl,
      prompt,
      width,
      height,
      model,
      seed,
    })
  } catch (error) {
    console.error('Image API error:', error)
    return NextResponse.json({ error: 'Failed to generate image' }, { status: 500 })
  }
}

// GET: proxy the image binary from Pollinations (keeps API key server-side)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const prompt = searchParams.get('prompt')
    const width = searchParams.get('width') || '1024'
    const height = searchParams.get('height') || '1024'
    const model = searchParams.get('model') || 'flux'
    const seed = searchParams.get('seed') || '0'

    if (!prompt) {
      return new Response('Missing prompt', { status: 400 })
    }

    const encodedPrompt = encodeURIComponent(prompt)
    const imageUrl = `https://gen.pollinations.ai/image/${encodedPrompt}?width=${width}&height=${height}&model=${model}&seed=${seed}&nologo=true`

    const headers: Record<string, string> = {
      'User-Agent': 'SparkieStudio/2.0',
    }

    const apiKey = process.env.POLLINATIONS_API_KEY
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    const response = await fetch(imageUrl, { headers })

    if (!response.ok) {
      return new Response(`Image generation failed: ${response.status}`, { status: response.status })
    }

    // Stream the image through
    return new Response(response.body, {
      headers: {
        'Content-Type': response.headers.get('content-type') || 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (error) {
    console.error('Image proxy error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
