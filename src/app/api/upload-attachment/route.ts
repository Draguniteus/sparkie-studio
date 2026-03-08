import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export const runtime = 'nodejs'

// POST /api/upload-attachment
// Body: { filename: string, mimeType: string, base64Data: string }
// Returns: { ok: true, filename, mimeType, base64Data }
// Validates the file and echoes it back for use in tasks/route.ts MIME assembly
// No external upload needed — the full MIME message is built at send time
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as { id?: string } | undefined)?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { filename, mimeType, base64Data } = await req.json() as {
      filename: string
      mimeType: string
      base64Data: string
    }

    if (!filename || !base64Data) {
      return NextResponse.json({ error: 'Missing filename or base64Data' }, { status: 400 })
    }

    // Validate base64 by attempting decode
    try {
      const buf = Buffer.from(base64Data, 'base64')
      if (buf.length === 0) return NextResponse.json({ error: 'Empty file' }, { status: 400 })
      console.log('[upload-attachment] Validated:', filename, mimeType, buf.length, 'bytes')
    } catch {
      return NextResponse.json({ error: 'Invalid base64' }, { status: 400 })
    }

    // Return the attachment data so tasks/route.ts can assemble the MIME message
    return NextResponse.json({
      ok: true,
      filename,
      mimeType: mimeType || 'application/octet-stream',
      base64Data,
    })
  } catch (e) {
    console.error('[upload-attachment] Error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
