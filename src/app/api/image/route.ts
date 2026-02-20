import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  try {
    const { prompt, width = 1024, height = 1024, model = 'flux' } = await req.json()

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    // Pollinations.ai generates images via URL — encode prompt and return the image URL
    const encodedPrompt = encodeURIComponent(prompt)
    const seed = Math.floor(Math.random() * 1000000)
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=${model}&seed=${seed}&nologo=true`

    // Pre-fetch to ensure the image is generated (Pollinations generates on first request)
    const prefetch = await fetch(imageUrl, { method: 'HEAD' })

    return NextResponse.json({
      url: imageUrl,
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
