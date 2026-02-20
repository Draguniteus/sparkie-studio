import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  try {
    const { prompt, width = 1024, height = 1024, model = 'flux' } = await req.json()

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const apiKey = process.env.POLLINATIONS_API_KEY
    const encodedPrompt = encodeURIComponent(prompt)
    const seed = Math.floor(Math.random() * 1000000)

    // Build the Pollinations URL
    const imageUrl = `https://gen.pollinations.ai/image/${encodedPrompt}?width=${width}&height=${height}&model=${model}&seed=${seed}&nologo=true`

    // Fetch the image server-side (with API key if available)
    const headers: Record<string, string> = {}
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    const imageResponse = await fetch(imageUrl, { headers })

    if (!imageResponse.ok) {
      console.error('Pollinations error:', imageResponse.status, await imageResponse.text().catch(() => ''))
      return NextResponse.json(
        { error: `Image generation failed (${imageResponse.status})` },
        { status: imageResponse.status }
      )
    }

    // Return the image as a data URL for direct embedding
    const imageBlob = await imageResponse.arrayBuffer()
    const contentType = imageResponse.headers.get('content-type') || 'image/png'
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBlob)))
    const dataUrl = `data:${contentType};base64,${base64Image}`

    return NextResponse.json({
      url: dataUrl,
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
