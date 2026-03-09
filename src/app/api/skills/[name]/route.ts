import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// This route redirects to /api/skills?name=... for backwards compatibility
// The main skill logic lives in /api/skills/route.ts (GET ?name= query param)
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ name: string }> } | { params: { name: string } }
): Promise<NextResponse> {
  // Support both Next.js 14 (sync) and 15 (async) params
  const params = 'then' in context.params ? await context.params : context.params
  const name = params.name
  const base = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const url = base + '/api/skills?name=' + encodeURIComponent(name)
  const res = await fetch(url, { headers: { 'x-internal': 'skill-redirect' } })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
