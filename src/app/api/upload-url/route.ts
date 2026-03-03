import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

// Generates a presigned upload URL for DigitalOcean Spaces (S3-compatible)
// Client uploads directly to Spaces; server never handles the binary data

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { filename, contentType, folder = 'uploads' } = await req.json() as {
      filename: string; contentType: string; folder?: string
    }

    if (!filename || !contentType) {
      return NextResponse.json({ error: 'filename and contentType required' }, { status: 400 })
    }

    const SPACES_KEY    = process.env.DO_SPACES_KEY ?? ''
    const SPACES_SECRET = process.env.DO_SPACES_SECRET ?? ''
    const SPACES_BUCKET = process.env.DO_SPACES_BUCKET ?? 'sparkie-studio'
    const SPACES_REGION = process.env.DO_SPACES_REGION ?? 'nyc3'
    const SPACES_ENDPOINT = `https://${SPACES_REGION}.digitaloceanspaces.com`

    if (!SPACES_KEY || !SPACES_SECRET) {
      return NextResponse.json({ error: 'Spaces credentials not configured' }, { status: 500 })
    }

    // Build S3-compatible presigned URL (AWS Signature V4)
    const { createPresignedPost } = await import('@aws-sdk/s3-presigned-post')
    const { S3Client } = await import('@aws-sdk/client-s3')

    const client = new S3Client({
      region: SPACES_REGION,
      endpoint: SPACES_ENDPOINT,
      credentials: { accessKeyId: SPACES_KEY, secretAccessKey: SPACES_SECRET },
    })

    // Sanitize filename
    const ext = filename.split('.').pop() ?? 'bin'
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
    const key = `${folder}/${userId}/${Date.now()}_${safe}`

    const { url, fields } = await createPresignedPost(client, {
      Bucket: SPACES_BUCKET,
      Key: key,
      Conditions: [
        ['content-length-range', 0, 50 * 1024 * 1024], // 50MB max
        ['eq', '$Content-Type', contentType],
      ],
      Fields: { 'Content-Type': contentType },
      Expires: 300, // 5 minutes
    })

    const publicUrl = `https://${SPACES_BUCKET}.${SPACES_REGION}.cdn.digitaloceanspaces.com/${key}`

    return NextResponse.json({ url, fields, key, publicUrl, expiresIn: 300 })
  } catch (e) {
    console.error('upload-url error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
