import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

// Image generation via Pollinations.ai (free, no API key required)
// https://image.pollinations.ai/prompt/{prompt}?model=flux&width=1024&height=1024&nologo=true
// Sync response — returns image URL directly, no polling needed.
// Falls back gracefully: if URL fetch fails, returns a placeholder message.

const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt'

const MODEL_MAP: Record<string, string> = {
  'flux':           'flux',
  'fal-ai/flux/schnell': 'flux',
  'fal-ai/fast-sdxl': 'flux',
  'klein':          'flux-schnell',
  'klein-large':    'flux',
  'gptimage':       'flux',
  'image-01':       'flux',
  'turbo':          'turbo',
}

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
  const encodedPrompt = encodeURIComponent(prompt)
  const imageUrl = `${POLLINATIONS_BASE}/${encodedPrompt}?model=${pollinationsModel}&width=${w || 1024}&height=${h || 1024}&nologo=true&seed=${seed}`

  // Return a sync JSON response with the URL
  // Pollinations returns the image at the URL — client renders it directly
  return new Response(
    JSON.stringify({ url: imageUrl, model: pollinationsModel }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}
