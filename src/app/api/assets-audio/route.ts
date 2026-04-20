import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export const runtime = 'nodejs'

// GET /api/assets-audio?fid=<fileId>
//   or /api/assets-audio?file=<filename>  (fallback lookup by name)
//
// Use this instead of /api/assets-image for audio/video media.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return new NextResponse('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const fid  = searchParams.get('fid')
  const file = searchParams.get('file')

  // Must have either fid or file
  if (!fid && !file) {
    return new NextResponse('fid or file parameter required', { status: 400 })
  }

  try {
    let dataUrl: string | null = null

    if (fid) {
      // Primary lookup by file_id
      const result = await query<{ content: string }>(
        `SELECT content FROM sparkie_assets WHERE file_id = $1 AND user_id = $2 LIMIT 1`,
        [fid, userId]
      )
      const row = (result.rows as any[])[0]
      if (row) dataUrl = row.content as string
    } else if (file) {
      // Fallback lookup by filename (name column) — used by old malformed URLs
      const result = await query<{ content: string }>(
        `SELECT content FROM sparkie_assets
         WHERE user_id = $1
           AND asset_type = 'audio'
           AND (name ILIKE $2 OR name ILIKE $3)
         LIMIT 1`,
        [userId, `%${file}%`, `%${decodeURIComponent(file)}%`]
      )
      const row = (result.rows as any[])[0]
      if (row) dataUrl = row.content as string
    }

    if (!dataUrl) return new NextResponse('Not found', { status: 404 })

    // If it's already an HTTPS URL (e.g. from Spaces CDN), redirect
    if (dataUrl.startsWith('http')) {
      return NextResponse.redirect(dataUrl)
    }

    // Parse data URL: data:<mime>;base64,<data>
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) {
      return new NextResponse('Invalid content format', { status: 500 })
    }

    const mimeType   = match[1]
    const base64Data = match[2]
    const effectiveMime = mimeType.startsWith('audio/') ? mimeType : 'audio/mpeg'
    const bytes = Buffer.from(base64Data, 'base64')

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': effectiveMime,
        'Content-Length': bytes.length.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    })
  } catch (err) {
    console.error('GET /api/assets-audio error:', err)
    return new NextResponse('Server error', { status: 500 })
  }
}
