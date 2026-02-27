import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY!;
const COMPOSIO_BASE = 'https://backend.composio.tech';

function composioHeaders() {
  return {
    'x-api-key': COMPOSIO_API_KEY,
    'Content-Type': 'application/json',
  };
}

// GET /api/connectors
// ?action=list                   → list active connections for user
// ?action=auth&app=<toolkit>     → start OAuth flow, returns redirect_url
// ?action=status&app=<toolkit>   → check if user has active connection
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = `sparkie_user_${session.user.id}`;
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') ?? 'list';
  const app = searchParams.get('app');

  try {
    if (action === 'list') {
      // List all active connections for this user
      const res = await fetch(
        `${COMPOSIO_BASE}/api/v3/connected_accounts?user_id=${encodeURIComponent(userId)}&status=ACTIVE`,
        { headers: composioHeaders() }
      );
      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json({ error: data?.message ?? 'Failed to list connections' }, { status: res.status });
      }
      return NextResponse.json({ connections: data?.items ?? [] });
    }

    if (action === 'auth') {
      if (!app) {
        return NextResponse.json({ error: 'Missing app parameter' }, { status: 400 });
      }

      // Step 1: Get auth_config id for this toolkit
      const configRes = await fetch(
        `${COMPOSIO_BASE}/api/v3/auth_configs?toolkit_slug=${encodeURIComponent(app)}&is_composio_managed=true&limit=1`,
        { headers: composioHeaders() }
      );
      const configData = await configRes.json();
      if (!configRes.ok || !configData?.items?.length) {
        return NextResponse.json(
          { error: `No auth config found for app: ${app}` },
          { status: 404 }
        );
      }
      const authConfigId = configData.items[0].id;

      // Step 2: Create connected account → get redirect_url
      const origin = req.headers.get('origin') ?? req.headers.get('x-forwarded-proto')
        ? `${req.headers.get('x-forwarded-proto')}://${req.headers.get('host')}`
        : 'https://sparkie.studio';
      const redirectUri = `${origin}/dashboard?connected=${encodeURIComponent(app)}`;

      const connectRes = await fetch(`${COMPOSIO_BASE}/api/v3/connected_accounts`, {
        method: 'POST',
        headers: composioHeaders(),
        body: JSON.stringify({
          auth_config: { id: authConfigId },
          connection: {
            user_id: userId,
            redirect_uri: redirectUri,
          },
        }),
      });
      const connectData = await connectRes.json();
      if (!connectRes.ok) {
        return NextResponse.json(
          { error: connectData?.message ?? 'Failed to initiate connection' },
          { status: connectRes.status }
        );
      }

      return NextResponse.json({
        redirect_url: connectData.redirect_url,
        connection_id: connectData.id,
        status: connectData.status,
      });
    }

    if (action === 'status') {
      if (!app) {
        return NextResponse.json({ error: 'Missing app parameter' }, { status: 400 });
      }
      const res = await fetch(
        `${COMPOSIO_BASE}/api/v3/connected_accounts?user_id=${encodeURIComponent(userId)}&status=ACTIVE`,
        { headers: composioHeaders() }
      );
      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json({ error: data?.message ?? 'Failed to check status' }, { status: res.status });
      }
      const items: any[] = data?.items ?? [];
      const connected = items.some(
        (c: any) =>
          c.toolkit_slug?.toLowerCase() === app.toLowerCase() ||
          c.app_name?.toLowerCase() === app.toLowerCase()
      );
      return NextResponse.json({ connected, app });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error('[/api/connectors] Error:', err);
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/connectors?id=<connection_id>
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const connectionId = searchParams.get('id');
  if (!connectionId) {
    return NextResponse.json({ error: 'Missing connection id' }, { status: 400 });
  }

  try {
    const res = await fetch(`${COMPOSIO_BASE}/api/v3/connected_accounts/${connectionId}`, {
      method: 'DELETE',
      headers: composioHeaders(),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: data?.message ?? 'Failed to delete connection' },
        { status: res.status }
      );
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[/api/connectors] DELETE Error:', err);
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 });
  }
}
