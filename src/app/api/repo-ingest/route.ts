import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { ingestRepo, getProjectContext } from '@/lib/repoIngestion'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { owner = 'Draguniteus', repo = 'sparkie-studio' } = await req.json().catch(() => ({})) as {
      owner?: string; repo?: string
    }

    const ctx = await ingestRepo(userId, owner, repo)
    return NextResponse.json({
      ok: true,
      repo: ctx.repo,
      summary: ctx.summary,
      techStack: ctx.techStack,
      keyFileCount: Object.keys(ctx.keyFiles).length,
      lastIngestedAt: ctx.lastIngestedAt,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const repo = searchParams.get('repo') ?? 'Draguniteus/sparkie-studio'
    const ctx = await getProjectContext(userId, repo)
    if (!ctx) return NextResponse.json({ error: 'Not ingested yet' }, { status: 404 })
    return NextResponse.json(ctx)
  } catch e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
