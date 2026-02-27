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
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as { id?: string } | undefined)?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = req.nextUrl
    const action = searchParams.get('action') ?? 'apps'

    // List user's active connections
    if (action === 'status') {
      const res = await fetch(
        `${COMPOSIO_BASE}/connectedAccounts?entityId=${entityId(userId)}&showActiveOnly=true`,
        { headers: composioHeaders() }
      )
      if (!res.ok) return NextResponse.json({ connections: [] })
      const data = await res.json() as { items?: Array<{ id: string; appName: string; status: string; createdAt: string }> }
      return NextResponse.json({ connections: data.items ?? [] })
    }

    // Browse/search the app catalog
    const q = searchParams.get('q') ?? ''
    const cursor = searchParams.get('cursor') ?? ''

    let url = `${COMPOSIO_BASE}/apps?limit=50`
    if (q) url += `&query=${encodeURIComponent(q)}`
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`

    const res = await fetch(url, { headers: composioHeaders() })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Composio error: ${res.status}`, detail: text }, { status: 500 })
    }
    return NextResponse.json(await res.json())
  } catch (err) {
    console.error('[connectors GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST /api/connectors
// body: { action: 'connect', appName: 'gmail' }
//     | { action: 'disconnect', connectedAccountId: 'xxx' }
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as { id?: string } | undefined)?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json() as {
      action: string
      appName?: string
      connectedAccountId?: string
    }

    if (body.action === 'connect') {
      if (!body.appName) return NextResponse.json({ error: 'appName required' }, { status: 400 })

      // Step 1: Resolve integrationId for this app
      const intRes = await fetch(
        `${COMPOSIO_BASE}/integrations?appName=${encodeURIComponent(body.appName)}&limit=1`,
        { headers: composioHeaders() }
      )
      if (!intRes.ok) {
        const text = await intRes.text()
        return NextResponse.json({ error: `Could not find integration for ${body.appName}: ${intRes.status}`, detail: text }, { status: intRes.status })
      }
      const intData = await intRes.json() as { items?: Array<{ id: string; name: string }> }
      const integration = intData.items?.[0]
      if (!integration) {
        return NextResponse.json({ error: `No integration found for ${body.appName}` }, { status: 404 })
      }

      // Step 2: Create the connected account
      const host = req.headers.get('host') ?? 'localhost:3000'
      const proto = req.headers.get('x-forwarded-proto') ?? 'https'
      const redirectUri = `${proto}://${host}/connectors/callback`

      const connectRes = await fetch(`${COMPOSIO_BASE}/connectedAccounts`, {
        method: 'POST',
        headers: composioHeaders(),
        body: JSON.stringify({
          integrationId: integration.id,
          entityId: entityId(userId),
          redirectUri,
        }),
      })

      if (!connectRes.ok) {
        const text = await connectRes.text()
        let detail = text
        try { detail = JSON.stringify(JSON.parse(text)) } catch {}
        return NextResponse.json({ error: `Connection failed: ${connectRes.status}`, detail }, { status: connectRes.status })
      }

      const data = await connectRes.json() as {
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

    if (body.action === 'disconnect') {
      if (!body.connectedAccountId) return NextResponse.json({ error: 'connectedAccountId required' }, { status: 400 })
      const res = await fetch(`${COMPOSIO_BASE}/connectedAccounts/${body.connectedAccountId}`, {
        method: 'DELETE',
        headers: composioHeaders(),
      })
      if (!res.ok) {
        const text = await res.text()
        return NextResponse.json({ error: `Disconnect failed: ${res.status}`, detail: text }, { status: res.status })
      }
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[connectors POST]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
