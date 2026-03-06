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
    const { searchParams } = req.nextUrl
    const action = searchParams.get('action') ?? 'apps'

    // List user's active connections (v3)
    // Strategy: query by entity first; if empty, fall back to global list
    // (admin connections made via Composio dashboard land in the global list, not under user entity)
    if (action === 'status') {
      const session = await getServerSession(authOptions)
      const userId = (session?.user as { id?: string } | undefined)?.id
      if (!userId) return NextResponse.json({ connections: [] })

      type ConnItem = { id: string; toolkit?: { slug: string; name: string }; status: string; created_at: string }
      const mapItems = (items: ConnItem[]) => items.map(item => ({
        id: item.id,
        appName: item.toolkit?.slug ?? '',
        status: item.status,
        createdAt: item.created_at,
      }))

      // 1) Try entity-scoped connections
      let connections: ReturnType<typeof mapItems> = []
      try {
        const res = await fetch(
          `${V3}/connected_accounts?user_id=${entityId(userId)}&status=ACTIVE&limit=50`,
          { headers: composioHeaders() }
        )
        if (res.ok) {
          const d = await res.json() as { items?: ConnItem[] }
          connections = mapItems(d.items ?? [])
        }
      } catch { /* fallthrough */ }

      // 2) If entity has no connections, try global (covers admin/dashboard-created connections)
      if (connections.length === 0) {
        try {
          const res = await fetch(
            `${V3}/connected_accounts?status=ACTIVE&limit=50`,
            { headers: composioHeaders() }
          )
          if (res.ok) {
            const d = await res.json() as { items?: ConnItem[] }
            connections = mapItems(d.items ?? [])
          }
        } catch { /* fallthrough */ }
      }

      return NextResponse.json({ connections })
    }

    // Browse/search the live Composio app catalog (v1 /apps)
    // Returns real brand logo_url + categories per app — replaces old hardcoded 51-app static list
    const q = (searchParams.get('q') ?? '').toLowerCase().trim()
    const cursor = searchParams.get('cursor') ?? ''

    type ComposioApp = {
      key: string
      name: string
      logo?: string
      categories?: string[]
      tags?: string[]
      description?: string
      auth_schemes?: string[]
    }

    const catalogUrl = new URL(`${V1}/apps`)
    catalogUrl.searchParams.set('limit', '100')
    if (cursor) catalogUrl.searchParams.set('page', cursor)

    const catalogRes = await fetch(catalogUrl.toString(), {
      headers: composioHeaders(),
      // @ts-ignore — Next.js fetch cache hint (not in standard RequestInit types)
      next: { revalidate: 3600 },
    })

    if (!catalogRes.ok) {
      console.error('[connectors GET] catalog fetch failed', catalogRes.status)
      return NextResponse.json({ error: 'Failed to fetch app catalog' }, { status: 502 })
    }

    const catalogData = await catalogRes.json() as {
      items?: ComposioApp[]
      totalPages?: number
      page?: number
    }

    const rawItems = catalogData.items ?? []

    // Normalise to the shape the frontend expects
    const items = rawItems.map(app => ({
      slug: app.key,
      name: app.key,
      displayName: app.name,
      logo: app.logo ?? '',
      categories: app.categories ?? app.tags ?? [],
    }))

    // Filter by search query if provided
    const filtered = q
      ? items.filter(a =>
          a.displayName.toLowerCase().includes(q) ||
          a.slug.includes(q) ||
          a.categories.some((c: string) => c.toLowerCase().includes(q))
        )
      : items

    const page = catalogData.page ?? 1
    const totalPages = catalogData.totalPages ?? 1
    const nextCursor = page < totalPages ? String(page + 1) : null

    return NextResponse.json({ items: filtered, nextCursor })
  } catch (err) {
    console.error('[connectors GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST /api/connectors
// body: { action: 'connect', appName: 'github' }
//       { action: 'connect', appName: 'openai', credentials: { generic_api_key: 'sk-...' } }
//     | { action: 'disconnect', connectedAccountId: 'xxx' }
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as { id?: string } | undefined)?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json() as {
      action: string
      appName?: string
      credentials?: Record<string, string>
      connectedAccountId?: string
    }

    if (body.action === 'connect') {
      if (!body.appName) return NextResponse.json({ error: 'appName required' }, { status: 400 })

      // Step 1: Find auth config for this app (v3)
      // NOTE: Do NOT use &is_composio_managed=true — that filter excludes custom auth configs.
      const authConfigRes = await fetch(
        `${V3}/auth_configs?toolkit_slug=${encodeURIComponent(body.appName)}&limit=1`,
        { headers: composioHeaders() }
      )
      if (!authConfigRes.ok) {
        const text = await authConfigRes.text()
        return NextResponse.json(
          { error: `Could not fetch auth config for ${body.appName}`, detail: text },
          { status: authConfigRes.status }
        )
      }
      const authConfigData = await authConfigRes.json() as {
        items?: Array<{
          id: string
          auth_scheme?: string
          toolkit?: { slug: string }
          is_composio_managed?: boolean
          fields?: Array<{ name: string; displayName?: string; description?: string; required?: boolean }>
        }>
      }
      const authConfig = authConfigData.items?.[0]
      if (!authConfig) {
        return NextResponse.json(
          {
            error: `No auth config found for "${body.appName}".`,
            detail: `This app requires a custom OAuth app. Go to https://app.composio.dev, find the ${body.appName} toolkit, and create an auth config using your own OAuth Client ID + Secret. The callback URL to use is: https://backend.composio.dev/api/v3/toolkits/auth/callback`,
          },
          { status: 404 }
        )
      }

      // Step 2a: API_KEY scheme — need credentials from user
      // If not provided yet, fetch detail for expected_input_fields, return to frontend for modal
      if (authConfig.auth_scheme === 'API_KEY') {
        if (!body.credentials || Object.keys(body.credentials).length === 0) {
          // Detail endpoint has expected_input_fields (list endpoint does not)
          let fields: Array<{ name: string; displayName?: string; description?: string; required?: boolean }> = []
          try {
            const detailRes = await fetch(`${V3}/auth_configs/${authConfig.id}`, { headers: composioHeaders() })
            if (detailRes.ok) {
              const detail = await detailRes.json() as { expected_input_fields?: typeof fields }
              fields = detail.expected_input_fields ?? []
            }
          } catch { /* fall through with empty fields */ }
          return NextResponse.json({
            authScheme: 'API_KEY',
            fields,
          })
        }
        // Credentials provided — create connection with data payload
        const connectRes = await fetch(`${V3}/connected_accounts`, {
          method: 'POST',
          headers: composioHeaders(),
          body: JSON.stringify({
            auth_config: { id: authConfig.id },
            connection: {
              user_id: entityId(userId),
              data: body.credentials,
            },
          }),
        })
        if (!connectRes.ok) {
          const text = await connectRes.text()
          let detail = text
          try { detail = JSON.stringify(JSON.parse(text)) } catch { /* keep raw */ }
          return NextResponse.json(
            { error: `Connection failed: ${connectRes.status}`, detail },
            { status: connectRes.status }
          )
        }
        const data = await connectRes.json() as { id?: string; status?: string }
        return NextResponse.json({ status: data.status, connectedAccountId: data.id })
      }

      // Step 2b: OAuth scheme — redirect flow
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
        try { detail = JSON.stringify(JSON.parse(text)) } catch { /* keep raw */ }
        return NextResponse.json(
          { error: `Connection failed: ${connectRes.status}`, detail },
          { status: connectRes.status }
        )
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
      const res = await fetch(`${V3}/connected_accounts/${body.connectedAccountId}`, {
        method: 'DELETE',
        headers: composioHeaders(),
      })
      if (!res.ok) {
        const resV1 = await fetch(`${V1}/connectedAccounts/${body.connectedAccountId}`, {
          method: 'DELETE',
          headers: composioHeaders(),
        })
        if (!resV1.ok) {
          const text = await resV1.text()
          return NextResponse.json(
            { error: `Disconnect failed: ${resV1.status}`, detail: text },
            { status: resV1.status }
          )
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
