import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

// GET /api/music/proxy?url=<encoded_audio_url>
// Proxies MiniMax/ACE CDN audio through our origin to avoid CORS restrictions.
// <audio src="...cdn..."> fails cross-origin; <audio src="/api/music/proxy?url=..."> works.
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return new Response(JSON.stringify({ error: 'Missing url param' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  let decodedUrl: string
  try {
    decodedUrl = decodeURIComponent(url)
    // Basic safety check — only proxy known audio CDN domains
    const allowed = ['cdn-static.minimax.chat', 'minimax.io', 'minimax.chat', 'acemusic', 'acestudio']
    const urlObj = new URL(decodedUrl)
    if (!allowed.some(d => urlObj.hostname.includes(d))) {
      return new Response(JSON.stringify({ error: 'Domain not allowed' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      })
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid url param' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const upstream = await fetch(decodedUrl, {
      signal: AbortSignal.timeout(30000),
    })

    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: `Upstream ${upstream.status}` }), {
        status: upstream.status, headers: { 'Content-Type': 'application/json' },
      })
    }

    const contentType = upstream.headers.get('content-type') || 'audio/mpeg'
    const contentLength = upstream.headers.get('content-length')

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    }
    if (contentLength) headers['Content-Length'] = contentLength

    return new Response(upstream.body, { status: 200, headers })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Proxy fetch failed'
    return new Response(JSON.stringify({ error: msg }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    })
  }
}
