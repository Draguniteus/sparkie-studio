import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

const MINIMAX_BASE = 'https://api.minimax.io/v1'

// MiniMax Lyrics Generation
// POST /v1/lyrics_generation
// body: { mode: 'write_full_song', prompt: string }  ← mode is REQUIRED, no model field
// Returns: { song_title, style_tags, lyrics, base_resp: { status_code, status_msg } }

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
      // mode is REQUIRED — omitting it causes 400. Do NOT send model field.
      body: JSON.stringify({ mode: 'write_full_song', prompt }),
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

    // New API shape: { song_title, style_tags, lyrics, base_resp }  (top-level, not nested under data.data)
    const lyricsText = data?.lyrics
    const title = data?.song_title || 'Generated Lyrics'
    const styleTags = data?.style_tags || ''

    if (!lyricsText) {
      return NextResponse.json({ error: 'No lyrics returned from MiniMax' }, { status: 500 })
    }

    return NextResponse.json({ lyrics: lyricsText, title, styleTags, model: 'music-2.5' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lyrics generation failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
