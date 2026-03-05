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
    if (action === 'status') {
      const session = await getServerSession(authOptions)
      const userId = (session?.user as { id?: string } | undefined)?.id
      if (!userId) return NextResponse.json({ connections: [] })
      const res = await fetch(
        `${V3}/connected_accounts?user_id=${entityId(userId)}&status=ACTIVE`,
        { headers: composioHeaders() }
      )
      if (!res.ok) return NextResponse.json({ connections: [] })
      const data = await res.json() as { items?: Array<{ id: string; toolkit?: { slug: string; name: string }; status: string; created_at: string }> }
      const connections = (data.items ?? []).map(item => ({
        id: item.id,
        appName: item.toolkit?.slug ?? '',
        status: item.status,
        createdAt: item.created_at,
      }))
      return NextResponse.json({ connections })
    }

    // Browse/search the app catalog — curated static list (Composio v1 /apps is unreliable)
    const q = (searchParams.get('q') ?? '').toLowerCase().trim()
    const CATALOG: Array<{ slug: string; name: string; displayName: string; icon: string; categories: string[] }> = [
      { slug: 'gmail', name: 'gmail', displayName: 'Gmail', icon: '📧', categories: ['Communication'] },
      { slug: 'google-calendar', name: 'google-calendar', displayName: 'Google Calendar', icon: '📅', categories: ['Productivity'] },
      { slug: 'google-drive', name: 'google-drive', displayName: 'Google Drive', icon: '📁', categories: ['Productivity'] },
      { slug: 'google-docs', name: 'google-docs', displayName: 'Google Docs', icon: '📄', categories: ['Productivity'] },
      { slug: 'google-sheets', name: 'google-sheets', displayName: 'Google Sheets', icon: '📊', categories: ['Productivity'] },
      { slug: 'google-slides', name: 'google-slides', displayName: 'Google Slides', icon: '📽️', categories: ['Productivity'] },
      { slug: 'twitter', name: 'twitter', displayName: 'Twitter / X', icon: '🐦', categories: ['Social Media'] },
      { slug: 'instagram', name: 'instagram', displayName: 'Instagram', icon: '📸', categories: ['Social Media'] },
      { slug: 'reddit', name: 'reddit', displayName: 'Reddit', icon: '🤖', categories: ['Social Media'] },
      { slug: 'tiktok', name: 'tiktok', displayName: 'TikTok', icon: '🎵', categories: ['Social Media'] },
      { slug: 'linkedin', name: 'linkedin', displayName: 'LinkedIn', icon: '💼', categories: ['Social Media'] },
      { slug: 'youtube', name: 'youtube', displayName: 'YouTube', icon: '▶️', categories: ['Social Media'] },
      { slug: 'slack', name: 'slack', displayName: 'Slack', icon: '💬', categories: ['Communication'] },
      { slug: 'discord', name: 'discord', displayName: 'Discord', icon: '🎮', categories: ['Communication'] },
      { slug: 'telegram', name: 'telegram', displayName: 'Telegram', icon: '✈️', categories: ['Communication'] },
      { slug: 'whatsapp', name: 'whatsapp', displayName: 'WhatsApp', icon: '💚', categories: ['Communication'] },
      { slug: 'outlook', name: 'outlook', displayName: 'Outlook', icon: '📮', categories: ['Communication'] },
      { slug: 'teams', name: 'teams', displayName: 'Microsoft Teams', icon: '🟦', categories: ['Communication'] },
      { slug: 'zoom', name: 'zoom', displayName: 'Zoom', icon: '📹', categories: ['Communication'] },
      { slug: 'github', name: 'github', displayName: 'GitHub', icon: '🐙', categories: ['Developer'] },
      { slug: 'gitlab', name: 'gitlab', displayName: 'GitLab', icon: '🦊', categories: ['Developer'] },
      { slug: 'jira', name: 'jira', displayName: 'Jira', icon: '🔵', categories: ['Developer', 'Productivity'] },
      { slug: 'linear', name: 'linear', displayName: 'Linear', icon: '🟣', categories: ['Developer', 'Productivity'] },
      { slug: 'vercel', name: 'vercel', displayName: 'Vercel', icon: '▲', categories: ['Developer'] },
      { slug: 'supabase', name: 'supabase', displayName: 'Supabase', icon: '⚡', categories: ['Developer'] },
      { slug: 'notion', name: 'notion', displayName: 'Notion', icon: '🗒️', categories: ['Productivity'] },
      { slug: 'trello', name: 'trello', displayName: 'Trello', icon: '🟩', categories: ['Productivity'] },
      { slug: 'asana', name: 'asana', displayName: 'Asana', icon: '🟠', categories: ['Productivity'] },
      { slug: 'airtable', name: 'airtable', displayName: 'Airtable', icon: '🟦', categories: ['Productivity'] },
      { slug: 'clickup', name: 'clickup', displayName: 'ClickUp', icon: '🟡', categories: ['Productivity'] },
      { slug: 'todoist', name: 'todoist', displayName: 'Todoist', icon: '🔴', categories: ['Productivity'] },
      { slug: 'dropbox', name: 'dropbox', displayName: 'Dropbox', icon: '📦', categories: ['Productivity'] },
      { slug: 'hubspot', name: 'hubspot', displayName: 'HubSpot', icon: '🟠', categories: ['CRM'] },
      { slug: 'salesforce', name: 'salesforce', displayName: 'Salesforce', icon: '☁️', categories: ['CRM'] },
      { slug: 'pipedrive', name: 'pipedrive', displayName: 'Pipedrive', icon: '🟢', categories: ['CRM'] },
      { slug: 'stripe', name: 'stripe', displayName: 'Stripe', icon: '💳', categories: ['Finance'] },
      { slug: 'quickbooks', name: 'quickbooks', displayName: 'QuickBooks', icon: '💰', categories: ['Finance'] },
      { slug: 'shopify', name: 'shopify', displayName: 'Shopify', icon: '🛍️', categories: ['Finance'] },
      { slug: 'google-analytics', name: 'google-analytics', displayName: 'Google Analytics', icon: '📈', categories: ['Analytics'] },
      { slug: 'mixpanel', name: 'mixpanel', displayName: 'Mixpanel', icon: '📉', categories: ['Analytics'] },
      { slug: 'posthog', name: 'posthog', displayName: 'PostHog', icon: '🦔', categories: ['Analytics'] },
      { slug: 'amplitude', name: 'amplitude', displayName: 'Amplitude', icon: '📊', categories: ['Analytics'] },
      { slug: 'sentry', name: 'sentry', displayName: 'Sentry', icon: '🔍', categories: ['Developer', 'Analytics'] },
      { slug: 'datadog', name: 'datadog', displayName: 'Datadog', icon: '🐕', categories: ['Developer', 'Analytics'] },
      { slug: 'figma', name: 'figma', displayName: 'Figma', icon: '🎨', categories: ['Design'] },
      { slug: 'canva', name: 'canva', displayName: 'Canva', icon: '🖌️', categories: ['Design'] },
      { slug: 'openai', name: 'openai', displayName: 'OpenAI', icon: '🤖', categories: ['AI'] },
      { slug: 'anthropic', name: 'anthropic', displayName: 'Anthropic', icon: '🧠', categories: ['AI'] },
      { slug: 'spotify', name: 'spotify', displayName: 'Spotify', icon: '🎵', categories: ['Entertainment'] },
    ]
    const filtered = q
      ? CATALOG.filter(a => a.displayName.toLowerCase().includes(q) || a.slug.includes(q) || a.categories.some(c => c.toLowerCase().includes(q)))
      : CATALOG
    return NextResponse.json({ items: filtered, nextCursor: null })
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
