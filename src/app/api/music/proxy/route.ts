import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

// GET /api/music/proxy?url=<encoded_audio_url>
// Proxies CDN audio through our origin to avoid CORS restrictions on <audio> elements.
// <audio src="cdn_url"> blocks cross-origin playback; /api/music/proxy?url=... works.
// Supports Range requests for seek functionality.
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
    // Validate it's actually a URL (not a data: URI or script injection)
    const urlObj = new URL(decodedUrl)
    if (urlObj.protocol !== 'https:' && urlObj.protocol !== 'http:') {
      return new Response(JSON.stringify({ error: 'Only http/https URLs allowed' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid url param' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // Forward Range header for seek support
    const rangeHeader = req.headers.get('range')
    const fetchHeaders: Record<string, string> = {}
    if (rangeHeader) fetchHeaders['Range'] = rangeHeader

    const upstream = await fetch(decodedUrl, {
      headers: fetchHeaders,
      signal: AbortSignal.timeout(30000),
    })

    if (!upstream.ok && upstream.status !== 206) {
      return new Response(JSON.stringify({ error: `Upstream ${upstream.status}` }), {
        status: upstream.status, headers: { 'Content-Type': 'application/json' },
      })
    }

    const contentType = upstream.headers.get('content-type') || 'audio/mpeg'
    const contentLength = upstream.headers.get('content-length')
    const contentRange = upstream.headers.get('content-range')
    const acceptRanges = upstream.headers.get('accept-ranges')

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD',
      'Access-Control-Allow-Headers': 'Range',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    }
    if (contentLength) headers['Content-Length'] = contentLength
    if (contentRange) headers['Content-Range'] = contentRange
    if (acceptRanges) headers['Accept-Ranges'] = acceptRanges
    else headers['Accept-Ranges'] = 'bytes'

    return new Response(upstream.body, { 
      status: upstream.status, // preserve 206 for range requests
      headers 
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Proxy fetch failed'
    return new Response(JSON.stringify({ error: msg }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    })
  }
}
