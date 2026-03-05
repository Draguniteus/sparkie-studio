import { NextRequest, NextResponse } from 'next/server'
import { pushMediaToGitHub } from '@/lib/github-media'

// Auth header — key stored in POLLINATIONS_API_KEY env var
function pollinationsHeaders(): Record<string, string> {
  const key = process.env.POLLINATIONS_API_KEY
  const h: Record<string, string> = { 'User-Agent': 'SparkieStudio/1.0' }
  if (key) h['Authorization'] = 'Bearer ' + key
  return h
}

export const runtime = 'nodejs'
export const maxDuration = 300

const MINIMAX_BASE = 'https://api.minimax.io/v1'

// MiniMax Video Generation
// Models (T2V): MiniMax-Hailuo-2.3, MiniMax-Hailuo-02, T2V-01-Director, T2V-01
// Models (I2V): MiniMax-Hailuo-2.3, MiniMax-Hailuo-2.3-Fast, MiniMax-Hailuo-02, I2V-01-Director, I2V-01-live, I2V-01
// Flow: POST → task_id → poll GET status → file_id → GET download_url

// Extract userId from Authorization Bearer token (JWT sub or raw token prefix)
function extractUserId(req: NextRequest): string {
  try {
    const auth = req.headers.get('authorization') || ''
    const token = auth.replace('Bearer ', '').trim()
    if (!token) return 'anon'
    // Try JWT payload
    const parts = token.split('.')
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
      return payload.sub || payload.id || token.slice(0, 12)
    }
    return token.slice(0, 12)
  } catch {
    return 'anon'
  }
}

// Best-effort push to GitHub — never throws
async function tryPersistVideo(url: string, userId: string): Promise<string> {
  try {
    const result = await pushMediaToGitHub('video', url, userId, 'mp4')
    return result.url
  } catch (e) {
    console.error('[/api/video] GitHub media push failed:', e)
    return url
  }
}

// GET /api/video?taskId=xxx → poll status
export async function GET(req: NextRequest) {
  const taskId = req.nextUrl.searchParams.get('taskId')
  if (!taskId) {
    return NextResponse.json({ error: 'Missing taskId' }, { status: 400 })
  }

  const apiKey = process.env.MINIMAX_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'MINIMAX_API_KEY not configured' }, { status: 500 })
  }

  const userId = req.nextUrl.searchParams.get('userId') || extractUserId(req)

  try {
    // Query task status
    const statusRes = await fetch(MINIMAX_BASE + '/query/video_generation?task_id=' + taskId, {
      headers: { Authorization: 'Bearer ' + apiKey },
      signal: AbortSignal.timeout(15000),
    })

    if (!statusRes.ok) {
      return NextResponse.json({ status: 'pending' })
    }

    const statusData = await statusRes.json()

    // NOTE: MiniMax poll response has NO base_resp wrapper
    // Status values (capitalized): Preparing, Queueing, Processing, Success, Fail
    const taskStatus = statusData?.status as string | undefined
    const fileId = statusData?.file_id as string | undefined

    if (taskStatus === 'Fail') {
      return NextResponse.json({ status: 'error', error: 'Video generation failed' })
    }

    if (taskStatus === 'Success' && fileId) {
      const fileRes = await fetch(MINIMAX_BASE + '/files/retrieve?file_id=' + fileId, {
        headers: { Authorization: 'Bearer ' + apiKey },
        signal: AbortSignal.timeout(15000),
      })

      if (!fileRes.ok) {
        return NextResponse.json({ status: 'error', error: 'File retrieve failed: ' + fileRes.status })
      }

      const fileData = await fileRes.json()
      const downloadUrl = fileData?.file?.download_url

      if (!downloadUrl) {
        return NextResponse.json({ status: 'error', error: 'No download URL in file response' })
      }

      // Persist to GitHub (best-effort)
      const persistentUrl = await tryPersistVideo(downloadUrl, userId)

      return NextResponse.json({ status: 'done', url: persistentUrl, fileId, persistent: persistentUrl !== downloadUrl })
    }

    return NextResponse.json({ status: 'pending' })
  } catch {
    return NextResponse.json({ status: 'pending' })
  }
}

// POST /api/video → submit generation task, returns { taskId } or { url } for sync providers
export async function POST(req: NextRequest) {
  const apiKey = process.env.MINIMAX_API_KEY

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const {
    model,
    prompt,
    first_frame_image,
    duration,
    resolution,
    prompt_optimizer,
    userId: bodyUserId,
  } = body as {
    model?: string
    prompt?: string
    first_frame_image?: string
    duration?: number
    resolution?: string
    prompt_optimizer?: boolean
    userId?: string
  }

  if (!model) {
    return NextResponse.json({ error: 'Missing model' }, { status: 400 })
  }
  if (!prompt && !first_frame_image) {
    return NextResponse.json({ error: 'Missing prompt or first_frame_image' }, { status: 400 })
  }

  const userId = bodyUserId || extractUserId(req)

  // Pollinations video models (seedance, grok-video) — synchronous, return video bytes directly
  const POLLINATIONS_VIDEO_MODELS = ['seedance', 'seedance-pro', 'grok-video']
  if (POLLINATIONS_VIDEO_MODELS.includes(model as string)) {
    try {
      const dur = typeof duration === 'number' ? Math.min(Math.max(duration, 2), 10) : 6
      const polUrl = 'https://gen.pollinations.ai/video/' + encodeURIComponent(prompt || '') +
        '?model=' + model + '&duration=' + dur + '&aspectRatio=16%3A9&nologo=true'
      const vidRes = await fetch(polUrl, {
        headers: pollinationsHeaders(),
        signal: AbortSignal.timeout(120000),
      })
      if (!vidRes.ok) {
        return NextResponse.json({ error: 'Pollinations video generation failed: ' + vidRes.status }, { status: 502 })
      }
      const ct = vidRes.headers.get('content-type') || 'video/mp4'
      const buf = await vidRes.arrayBuffer()
      const b64 = Buffer.from(buf).toString('base64')
      const dataUrl = 'data:' + ct + ';base64,' + b64

      // Persist data URL to GitHub (best-effort)
      const persistentUrl = await tryPersistVideo(dataUrl, userId)

      return NextResponse.json({ url: persistentUrl, model, status: 'done', persistent: persistentUrl !== dataUrl })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Pollinations video failed'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  // MiniMax models need API key
  if (!apiKey) {
    return NextResponse.json({ error: 'MINIMAX_API_KEY not configured' }, { status: 500 })
  }

  // Validate MiniMax model
  const T2V_MODELS = ['MiniMax-Hailuo-2.3', 'MiniMax-Hailuo-02', 'T2V-01-Director', 'T2V-01']
  const I2V_MODELS = ['MiniMax-Hailuo-2.3', 'MiniMax-Hailuo-2.3-Fast', 'MiniMax-Hailuo-02', 'I2V-01-Director', 'I2V-01-live', 'I2V-01']
  const isI2V = !!first_frame_image
  const validModels = isI2V ? I2V_MODELS : T2V_MODELS

  if (!validModels.includes(model as string)) {
    return NextResponse.json({
      error: 'Invalid model ' + model + ' for ' + (isI2V ? 'image-to-video' : 'text-to-video') + '. Valid: ' + validModels.join(', ')
    }, { status: 400 })
  }

  const reqBody: Record<string, unknown> = { model, prompt }
  if (first_frame_image) reqBody.first_frame_image = first_frame_image
  if (duration) reqBody.duration = duration
  if (resolution) reqBody.resolution = resolution
  if (prompt_optimizer !== undefined) reqBody.prompt_optimizer = prompt_optimizer

  try {
    const submitRes = await fetch(MINIMAX_BASE + '/video_generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(30000),
    })

    if (!submitRes.ok) {
      const err = await submitRes.json().catch(() => ({ error: 'HTTP ' + submitRes.status }))
      return NextResponse.json(
        { error: err.base_resp?.status_msg || err.error || ('MiniMax video error ' + submitRes.status) },
        { status: submitRes.status }
      )
    }

    const submitData = await submitRes.json()

    if (submitData?.base_resp?.status_code !== 0) {
      return NextResponse.json(
        { error: submitData.base_resp?.status_msg || 'MiniMax video submit failed' },
        { status: 500 }
      )
    }

    const taskId = submitData?.task_id
    if (!taskId) {
      return NextResponse.json({ error: 'No task_id returned from MiniMax' }, { status: 500 })
    }

    // MiniMax is async — return taskId for client to poll GET /api/video?taskId=xxx&userId=xxx
    return NextResponse.json({ taskId, userId, status: 'processing' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
