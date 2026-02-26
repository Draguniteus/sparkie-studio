import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 300

const MINIMAX_BASE = 'https://api.minimax.io/v1'

// MiniMax Video Generation
// Models (T2V): MiniMax-Hailuo-2.3, MiniMax-Hailuo-02, T2V-01-Director, T2V-01
// Models (I2V): MiniMax-Hailuo-2.3, MiniMax-Hailuo-2.3-Fast, MiniMax-Hailuo-02, I2V-01-Director, I2V-01-live, I2V-01
// Flow: POST → task_id → poll GET status → file_id → GET download_url

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

  try {
    // Query task status
    const statusRes = await fetch(`${MINIMAX_BASE}/query/video_generation?task_id=${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    })

    if (!statusRes.ok) {
      // Return pending so frontend keeps polling
      return NextResponse.json({ status: 'pending' })
    }

    const statusData = await statusRes.json()

    if (statusData?.base_resp?.status_code !== 0) {
      return NextResponse.json({
        status: 'error',
        error: statusData.base_resp?.status_msg || 'Task query failed',
      })
    }

    const taskStatus = statusData?.status  // 'processing' | 'success' | 'failed'
    const fileId = statusData?.file_id

    if (taskStatus === 'failed') {
      return NextResponse.json({ status: 'error', error: statusData.message || 'Video generation failed' })
    }

    if (taskStatus === 'success' && fileId) {
      // Retrieve download URL from file management API
      const fileRes = await fetch(`${MINIMAX_BASE}/files/retrieve?file_id=${fileId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15000),
      })

      if (!fileRes.ok) {
        return NextResponse.json({ status: 'error', error: `File retrieve failed: ${fileRes.status}` })
      }

      const fileData = await fileRes.json()
      const downloadUrl = fileData?.file?.download_url

      if (!downloadUrl) {
        return NextResponse.json({ status: 'error', error: 'No download URL in file response' })
      }

      return NextResponse.json({ status: 'done', url: downloadUrl, fileId })
    }

    // Still processing
    return NextResponse.json({ status: 'pending' })
  } catch (err) {
    // On error, return pending so frontend keeps trying
    return NextResponse.json({ status: 'pending' })
  }
}

// POST /api/video → submit generation task, returns { taskId }
export async function POST(req: NextRequest) {
  const apiKey = process.env.MINIMAX_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'MINIMAX_API_KEY not configured' }, { status: 500 })
  }

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
  } = body as {
    model?: string
    prompt?: string
    first_frame_image?: string
    duration?: number
    resolution?: string
    prompt_optimizer?: boolean
  }

  if (!model) {
    return NextResponse.json({ error: 'Missing model' }, { status: 400 })
  }
  if (!prompt && !first_frame_image) {
    return NextResponse.json({ error: 'Missing prompt or first_frame_image' }, { status: 400 })
  }

  // Validate model
  const T2V_MODELS = ['MiniMax-Hailuo-2.3', 'MiniMax-Hailuo-02', 'T2V-01-Director', 'T2V-01']
  const I2V_MODELS = ['MiniMax-Hailuo-2.3', 'MiniMax-Hailuo-2.3-Fast', 'MiniMax-Hailuo-02', 'I2V-01-Director', 'I2V-01-live', 'I2V-01']
  const isI2V = !!first_frame_image
  const validModels = isI2V ? I2V_MODELS : T2V_MODELS

  if (!validModels.includes(model as string)) {
    return NextResponse.json({
      error: `Invalid model '${model}' for ${isI2V ? 'image-to-video' : 'text-to-video'}. Valid: ${validModels.join(', ')}`
    }, { status: 400 })
  }

  // Build request body
  const reqBody: Record<string, unknown> = { model, prompt }
  if (first_frame_image) reqBody.first_frame_image = first_frame_image
  if (duration) reqBody.duration = duration
  if (resolution) reqBody.resolution = resolution
  if (prompt_optimizer !== undefined) reqBody.prompt_optimizer = prompt_optimizer

  try {
    const submitRes = await fetch(`${MINIMAX_BASE}/video_generation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(30000),
    })

    if (!submitRes.ok) {
      const err = await submitRes.json().catch(() => ({ error: `HTTP ${submitRes.status}` }))
      return NextResponse.json(
        { error: err.base_resp?.status_msg || err.error || `MiniMax video error ${submitRes.status}` },
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

    return NextResponse.json({ taskId, status: 'queued', model }, { status: 202 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Video submit failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
