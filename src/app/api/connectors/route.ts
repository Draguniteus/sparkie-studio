import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export const runtime = 'nodejs'

const V1 = 'https://backend.composio.dev/api/v1'
const V3 = 'https://backend.composio.dev/api/v3'

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

    // List user's active connections (v3)
    if (action === 'status') {
      const res = await fetch(
        `${V3}/connected_accounts?user_id=${entityId(userId)}&status=ACTIVE`,
        { headers: composioHeaders() }
      )
      if (!res.ok) return NextResponse.json({ connections: [] })
      const data = await res.json() as { items?: Array<{ id: string; toolkit?: { slug: string; name: string }; status: string; created_at: string }> }
      // Normalize to the shape the frontend expects
      const connections = (data.items ?? []).map(item => ({
        id: item.id,
        appName: item.toolkit?.slug ?? '',
        status: item.status,
        createdAt: item.created_at,
      }))
      return NextResponse.json({ connections })
    }

    // Browse/search the app catalog (v1 — still the correct catalog endpoint)
    const q = searchParams.get('q') ?? ''
    const cursor = searchParams.get('cursor') ?? ''

    let url = `${V1}/apps?limit=50`
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
// body: { action: 'connect', appName: 'github' }
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

      // Step 1: Get Composio-managed auth config for this app (v3)
      const authConfigRes = await fetch(
        `${V3}/auth_configs?toolkit_slug=${encodeURIComponent(body.appName)}&limit=1`,
        { headers: composioHeaders() }
      )
      if (!authConfigRes.ok) {
        const text = await authConfigRes.text()
        return NextResponse.json({ error: `Could not find auth config for ${body.appName}`, detail: text }, { status: authConfigRes.status })
      }
      const authConfigData = await authConfigRes.json() as { items?: Array<{ id: string; toolkit?: { slug: string } }> }
      const authConfig = authConfigData.items?.[0]
      if (!authConfig) {
        return NextResponse.json({ error: `No auth config found for "${body.appName}". This app may not support automated OAuth — check your Composio dashboard.` }, { status: 404 })
      }

      // Step 2: Create connected account (v3)
      const host = req.headers.get('host') ?? 'localhost:3000'
      const proto = req.headers.get('x-forwarded-proto') ?? 'https'
      const redirectUri = `${proto}://${host}/connectors/callback`

      const connectRes = await fetch(`${V3}/connected_accounts`, {
        method: 'POST',
        headers: composioHeaders(),
        body: JSON.stringify({
          auth_config: { id: authConfig.id },
          connection: {
            user_id: entityId(userId),
            redirect_uri: redirectUri,
          },
        }),
      })

      if (!connectRes.ok) {
        const text = await connectRes.text()
        let detail = text
        try { detail = JSON.stringify(JSON.parse(text)) } catch {}
        return NextResponse.json({ error: `Connection failed: ${connectRes.status}`, detail }, { status: connectRes.status })
      }

      const data = await connectRes.json() as {
        redirect_url?: string
        id?: string
        status?: string
      }
      return NextResponse.json({
        authUrl: data.redirect_url,
        connectedAccountId: data.id,
        status: data.status,
      })
    }

    if (body.action === 'disconnect') {
      if (!body.connectedAccountId) return NextResponse.json({ error: 'connectedAccountId required' }, { status: 400 })
      // v3 delete
      const res = await fetch(`${V3}/connected_accounts/${body.connectedAccountId}`, {
        method: 'DELETE',
        headers: composioHeaders(),
      })
      if (!res.ok) {
        // Fallback: try v1
        const resV1 = await fetch(`${V1}/connectedAccounts/${body.connectedAccountId}`, {
          method: 'DELETE',
          headers: composioHeaders(),
        })
        if (!resV1.ok) {
          const text = await resV1.text()
          return NextResponse.json({ error: `Disconnect failed: ${resV1.status}`, detail: text }, { status: resV1.status })
        }
      }
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[connectors POST]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
