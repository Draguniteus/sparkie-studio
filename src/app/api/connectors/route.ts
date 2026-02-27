import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export const runtime = 'nodejs'

const COMPOSIO_BASE = 'https://backend.composio.dev/api/v1'

function composioHeaders() {
  return {
    'x-api-key': process.env.COMPOSIO_API_KEY ?? '',
    'Content-Type': 'application/json',
  }
}

function entityId(userId: string) {
  return `sparkie_user_${userId}`
}

// GET /api/connectors?action=apps&q=gmail&cursor=xxx
//                   ?action=status
//                   ?action=app_details&name=github
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const action = searchParams.get('action') ?? 'apps'

  if (action === 'status') {
    const res = await fetch(
      `${COMPOSIO_BASE}/connectedAccounts?entityId=${entityId(userId)}&showActiveOnly=true`,
      { headers: composioHeaders() }
    )
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Composio error: ${res.status}`, detail: text }, { status: 500 })
    }
    const data = await res.json() as { items?: Array<{ id: string; appName: string; status: string; createdAt: string }> }
    return NextResponse.json({ connections: data.items ?? [] })
  }

  // Return the auth scheme and required fields for a specific app
  if (action === 'app_details') {
    const name = searchParams.get('name')
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

    const res = await fetch(`${COMPOSIO_BASE}/apps/${encodeURIComponent(name)}`, { headers: composioHeaders() })
    if (!res.ok) {
      // If we can't get details, default to OAUTH2 (safe fallback)
      return NextResponse.json({ authScheme: 'OAUTH2', fields: [] })
    }

    const appData = await res.json() as {
      authSchemes?: Array<{
        mode: string
        fields?: Array<{ name: string; displayName?: string; description?: string; required?: boolean }>
      }>
    }

    // Pick preferred auth scheme order: OAUTH2 > OAUTH1 > API_KEY > BASIC
    const schemes = appData.authSchemes ?? []
    const preferred = schemes.find(s => s.mode === 'OAUTH2')
      ?? schemes.find(s => s.mode === 'OAUTH1')
      ?? schemes.find(s => s.mode === 'API_KEY')
      ?? schemes.find(s => s.mode === 'BASIC')
      ?? schemes.find(s => s.mode === 'BEARER_TOKEN')
      ?? schemes[0]

    return NextResponse.json({
      authScheme: preferred?.mode ?? 'OAUTH2',
      fields: preferred?.fields ?? [],
    })
  }

  // action === 'apps' — browse/search the catalog
  const q = searchParams.get('q') ?? ''
  const cursor = searchParams.get('cursor') ?? ''

  let url = `${COMPOSIO_BASE}/apps?limit=50`
  if (q) url += `&query=${encodeURIComponent(q)}`
  if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`
  // NOTE: No category param to Composio — categories are filtered client-side

  const res = await fetch(url, { headers: composioHeaders() })
  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `Composio error: ${res.status}`, detail: text }, { status: 500 })
  }
  const data = await res.json()
  return NextResponse.json(data)
}

// POST /api/connectors
// body: { action: 'connect', appName: 'gmail', authMode?: 'OAUTH2'|'API_KEY'... }
//     | { action: 'submit_api_key', connectedAccountId: 'xxx', fieldInputs: {...} }
//     | { action: 'disconnect', connectedAccountId: 'xxx' }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    action: string
    appName?: string
    authMode?: string
    connectedAccountId?: string
    fieldInputs?: Record<string, string>
  }

  if (body.action === 'connect') {
    if (!body.appName) return NextResponse.json({ error: 'appName required' }, { status: 400 })

    const host = req.headers.get('host') ?? 'localhost:3000'
    const proto = req.headers.get('x-forwarded-proto') ?? 'https'
    const redirectUri = `${proto}://${host}/connectors/callback`

    const authMode = body.authMode ?? 'OAUTH2'

    // For non-OAuth modes, initiate without redirectUri — just create the pending account
    const payload: Record<string, unknown> = {
      appName: body.appName,
      entityId: entityId(userId),
      authMode,
    }
    if (authMode === 'OAUTH2' || authMode === 'OAUTH1') {
      payload.redirectUri = redirectUri
    }

    const res = await fetch(`${COMPOSIO_BASE}/connectedAccounts`, {
      method: 'POST',
      headers: composioHeaders(),
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Connection failed: ${res.status}`, detail: text }, { status: 500 })
    }
    const data = await res.json() as {
      redirectUrl?: string
      connectedAccountId?: string
      connectionStatus?: string
    }
    return NextResponse.json({
      authUrl: data.redirectUrl,
      connectedAccountId: data.connectedAccountId,
      status: data.connectionStatus,
    })
  }

  // Submit API key / credentials for a pending connection
  if (body.action === 'submit_api_key') {
    if (!body.connectedAccountId) return NextResponse.json({ error: 'connectedAccountId required' }, { status: 400 })

    const res = await fetch(`${COMPOSIO_BASE}/connectedAccounts/${body.connectedAccountId}`, {
      method: 'PATCH',
      headers: composioHeaders(),
      body: JSON.stringify({ fieldInputs: body.fieldInputs ?? {} }),
    })

    if (!res.ok) {
      // Try the initiate flow instead
      const text = await res.text()
      return NextResponse.json({ error: `Failed to save credentials: ${res.status}`, detail: text }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  }

  if (body.action === 'disconnect') {
    if (!body.connectedAccountId) return NextResponse.json({ error: 'connectedAccountId required' }, { status: 400 })
    const res = await fetch(`${COMPOSIO_BASE}/connectedAccounts/${body.connectedAccountId}`, {
      method: 'DELETE',
      headers: composioHeaders(),
    })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Disconnect failed: ${res.status}`, detail: text }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
