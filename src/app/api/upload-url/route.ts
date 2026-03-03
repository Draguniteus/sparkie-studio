import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { createHmac, createHash } from 'crypto'

// Generates a presigned PUT URL for DigitalOcean Spaces (S3-compatible)
// Uses only Node.js built-in crypto -- no external AWS SDK needed
// Client PUTs directly to Spaces; server never handles binary data

function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

function hmacSha256(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest()
}

function presignPut({
  accessKey,
  secretKey,
  region,
  bucket,
  key,
  contentType,
  expiresIn = 300,
}: {
  accessKey: string
  secretKey: string
  region: string
  bucket: string
  key: string
  contentType: string
  expiresIn?: number
}): string {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
  const dateTimeStr = now.toISOString().replace(/[:-]/g, '').slice(0, 15) + 'Z'

  const host = `${bucket}.${region}.digitaloceanspaces.com`
  const credentialScope = `${dateStr}/${region}/s3/aws4_request`
  const credential = `${accessKey}/${credentialScope}`

  const qp = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': dateTimeStr,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': 'host;content-type',
  })
  qp.sort()

  const canonicalRequest = [
    'PUT',
    `/${key}`,
    qp.toString(),
    `content-type:${contentType}\nhost:${host}\n`,
    'content-type;host',
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    dateTimeStr,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n')

  const signingKey = hmacSha256(
    hmacSha256(hmacSha256(hmacSha256(`AWS4${secretKey}`, dateStr), region), 's3'),
    'aws4_request'
  )

  const sig = hmacSha256(signingKey, stringToSign).toString('hex')
  return `https://${host}/${key}?${qp.toString()}&X-Amz-Signature=${sig}`
}

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

    const SPACES_KEY = process.env.DO_SPACES_KEY ?? ''
    const SPACES_SECRET = process.env.DO_SPACES_SECRET ?? ''
    const SPACES_BUCKET = process.env.DO_SPACE_BUCKET ?? process.env.DO_SPACES_BUCKET ?? 'sparkie-studio'
    const SPACES_REGION = process.env.DO_SPACES_REGION ?? 'nyc3'

    if (!SPACES_KEY || !SPACES_SECRET) {
      return NextResponse.json({ error: 'Spaces credentials not configured' }, { status: 500 })
    }

    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
    const objectKey = `${folder}/${userId}/${Date.now()}_${safe}`

    const presignedUrl = presignPut({
      accessKey: SPACES_KEY,
      secretKey: SPACES_SECRET,
      region: SPACES_REGION,
      bucket: SPACES_BUCKET,
      key: objectKey,
      contentType,
      expiresIn: 300,
    })

    const publicUrl = `https://${SPACES_BUCKET}.${SPACES_REGION}.cdn.digitaloceanspaces.com/${objectKey}`

    return NextResponse.json({
      url: presignedUrl,
      method: 'PUT',
      key: objectKey,
      publicUrl,
      headers: { 'Content-Type': contentType },
      expiresIn: 300,
    })
  } catch (e) {
    console.error('upload-url error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
