import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export const runtime = 'nodejs'

// GET /api/assets-image?fid=<fileId>
// Serves a stored asset's base64 data URL as raw image bytes.
// Used so messages can reference images by stable URL instead of embedding base64.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return new NextResponse('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const fid = searchParams.get('fid')
  if (!fid) return new NextResponse('fid required', { status: 400 })

  try {
    const result = await query<{ content: string; asset_type: string }>(
      `SELECT content, asset_type FROM sparkie_assets WHERE file_id = $1 AND user_id = $2 LIMIT 1`,
      [fid, userId]
    )
    const row = (result.rows as any[])[0]
    if (!row) return new NextResponse('Not found', { status: 404 })

    const dataUrl: string = row.content
    // Parse data URL: data:<mime>;base64,<data>
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) {
      // Not a data URL — might already be an https URL, validate and redirect
      let normalizedUrl = dataUrl.trim()
      normalizedUrl = normalizedUrl.replace(/^(https?|http)\/+/, '$1://')
      if (normalizedUrl.startsWith('https://') && !normalizedUrl.includes('undefined')) {
        return NextResponse.redirect(normalizedUrl)
      }
      return new NextResponse('Invalid content format', { status: 500 })
    }
    const mimeType = match[1]
    const base64Data = match[2]
    const bytes = Buffer.from(base64Data, 'base64')

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=86400, immutable',
        'Content-Length': bytes.length.toString(),
      },
    })
  } catch (err) {
    console.error('GET /api/assets-image error:', err)
    return new NextResponse('Server error', { status: 500 })
  }
}
