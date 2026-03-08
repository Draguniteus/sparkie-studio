import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export const runtime = 'nodejs'

// POST /api/upload-attachment
// Body: { filename: string, mimeType: string, base64Data: string }
// Returns: { s3key: string }
// Used by TaskApprovalCard before sending email with attachment via GMAIL_SEND_EMAIL
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

    const composioKey = process.env.COMPOSIO_API_KEY
    if (!composioKey) {
      return NextResponse.json({ error: 'Composio not configured' }, { status: 500 })
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64')

    // Upload to Composio file storage via multipart/form-data
    const formData = new FormData()
    const blob = new Blob([buffer], { type: mimeType || 'application/octet-stream' })
    formData.append('file', blob, filename)

    const uploadRes = await fetch('https://backend.composio.dev/api/v1/files/upload', {
      method: 'POST',
      headers: {
        'x-api-key': composioKey,
      },
      body: formData,
    })

    if (!uploadRes.ok) {
      const errText = await uploadRes.text()
      console.error('[upload-attachment] Composio upload failed:', uploadRes.status, errText)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    const result = await uploadRes.json()
    // Composio returns { s3key: string } or { key: string }
    const s3key = result.s3key || result.key || result.id
    if (!s3key) {
      console.error('[upload-attachment] No s3key in response:', result)
      return NextResponse.json({ error: 'No s3key returned' }, { status: 500 })
    }

    console.log('[upload-attachment] Uploaded:', filename, '→ s3key:', s3key)
    return NextResponse.json({ s3key })
  } catch (e) {
    console.error('[upload-attachment] Error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
