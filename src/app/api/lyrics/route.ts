import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

const MINIMAX_BASE = 'https://api.minimax.io/v1'

// MiniMax Lyrics Generation
// POST /v1/lyrics_generation
// body: { prompt: string }  ← model field NOT accepted, causes 400
// Returns: { base_resp: { status_code, status_msg }, data: { lyrics: string, title: string } }

export async function POST(req: NextRequest) {
  const apiKey = process.env.MINIMAX_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'MINIMAX_API_KEY not configured' }, { status: 500 })
  }

  let prompt: string

  try {
    const body = await req.json()
    prompt = body.prompt
    if (!prompt) throw new Error('Missing prompt')
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const res = await fetch(`${MINIMAX_BASE}/lyrics_generation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      // ⚠️ Do NOT send model field — MiniMax lyrics_generation rejects it with 400
      body: JSON.stringify({ prompt }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      return NextResponse.json(
        { error: err.message || err.error || `MiniMax lyrics ${res.status}` },
        { status: res.status }
      )
    }

    const data = await res.json()

    if (data?.base_resp?.status_code !== 0) {
      return NextResponse.json(
        { error: data.base_resp?.status_msg || 'MiniMax API error' },
        { status: 500 }
      )
    }

    const lyricsText = data?.data?.lyrics
    const title = data?.data?.title || 'Generated Lyrics'

    if (!lyricsText) {
      return NextResponse.json({ error: 'No lyrics returned from MiniMax' }, { status: 500 })
    }

    return NextResponse.json({ lyrics: lyricsText, title, model: 'music-2.5' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lyrics generation failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
