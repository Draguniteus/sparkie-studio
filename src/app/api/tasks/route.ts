import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export const runtime = 'nodejs'

const V3 = 'https://backend.composio.dev/api/v3'

async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS sparkie_tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    label TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending',
    executor TEXT NOT NULL DEFAULT 'human',
    trigger_type TEXT DEFAULT 'manual',
    trigger_config JSONB DEFAULT '{}',
    scheduled_at TIMESTAMPTZ,
    why_human TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_sparkie_tasks_user ON sparkie_tasks(user_id, status)`)
  await query(`ALTER TABLE sparkie_tasks ADD COLUMN IF NOT EXISTS executor TEXT NOT NULL DEFAULT 'human'`).catch(() => {})
  await query(`ALTER TABLE sparkie_tasks ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'manual'`).catch(() => {})
  await query(`ALTER TABLE sparkie_tasks ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ`).catch(() => {})
}

// POST /api/tasks — create a new pending task
export async function POST(req: NextRequest) {
  try {
    // Allow internal server-to-server calls (scheduler, agent, chat tools)
    const reqInternalSecret = req.headers.get('x-internal-secret')
    const internalSecret = process.env.SPARKIE_INTERNAL_SECRET
    const isInternal = !!internalSecret && reqInternalSecret === internalSecret

    const session = await getServerSession(authOptions)
    const sessionUserId = (session?.user as { id?: string } | undefined)?.id

    let userId: string
    if (isInternal) {
      // Internal calls must supply user_id in body — we'll extract after parsing
      userId = '' // resolved after body parse below
    } else if (sessionUserId) {
      userId = sessionUserId
    } else {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await ensureTable()
    const body = await req.json() as {
      id: string; action: string; label: string; payload: Record<string, unknown>
      executor?: string; why_human?: string; user_id?: string
    }
    const { id, action, label, payload, executor, why_human } = body
    // Resolve userId for internal calls from body.user_id
    if (isInternal && !userId) {
      userId = body.user_id ?? ''
      if (!userId) return NextResponse.json({ error: 'user_id required for internal calls' }, { status: 400 })
    }
    if (!id || !action || !label) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    // Ensure payload is stored as a proper JSON object (not double-stringified)
    // If the AI sends payload as a JSON string, parse it first so Postgres JSONB gets an object
    let payloadObj: Record<string, unknown>
    if (typeof payload === 'string') {
      try { payloadObj = JSON.parse(payload) } catch { payloadObj = { raw: payload } }
    } else {
      payloadObj = payload ?? {}
    }

    await query(
      `INSERT INTO sparkie_tasks (id, user_id, action, label, payload, status, executor, why_human)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'pending', $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [id, userId, action, label, JSON.stringify(payloadObj), executor ?? 'human', why_human ?? null]
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('tasks POST error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// GET /api/tasks?id=xxx — get single task
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as { id?: string } | undefined)?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await ensureTable()
    const id = req.nextUrl.searchParams.get('id')
    const statusFilter = req.nextUrl.searchParams.get('status')
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '30'), 100)

    if (id) {
      const res = await query<{ id: string; status: string; action: string; label: string; payload: unknown }>(
        `SELECT id, status, action, label, payload FROM sparkie_tasks WHERE id = $1 AND user_id = $2`,
        [id, userId]
      )
      if (res.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json(res.rows[0])
    }

    let whereClause = 'user_id = $1'
    const params: unknown[] = [userId]

    if (statusFilter && statusFilter !== 'all') {
      whereClause += ' AND status = $2'
      params.push(statusFilter)
    } else {
      whereClause += ` AND created_at > NOW() - INTERVAL '7 days'`
    }

    const res = await query(
      `SELECT id, label, action, status, executor, trigger_type, scheduled_at, created_at, resolved_at, payload, why_human
       FROM sparkie_tasks WHERE ${whereClause}
       ORDER BY
         CASE status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
         created_at DESC
       LIMIT $${params.length + 1}`,
      [...params, limit]
    )

    return NextResponse.json({ tasks: res.rows })
  } catch (e) {
    console.error('tasks GET error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// DELETE /api/tasks?id=xxx
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as { id?: string } | undefined)?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await ensureTable()
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    await query(
      `UPDATE sparkie_tasks SET status = 'cancelled', resolved_at = NOW() WHERE id = $1 AND user_id = $2`,
      [id, userId]
    )
    return NextResponse.json({ ok: true, status: 'cancelled' })
  } catch (e) {
    console.error('tasks DELETE error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// Look up the Composio Gmail connectedAccountId for a user entity.
async function getGmailConnectedAccountId(entityId: string, composioKey: string): Promise<string | null> {
  const headers = { 'x-api-key': composioKey }
  // 1) Entity-scoped: use user_id param (NOT entityId)
  try {
    const res = await fetch(
      `${V3}/connected_accounts?user_id=${encodeURIComponent(entityId)}&status=ACTIVE&limit=50`,
      { headers }
    )
    if (res.ok) {
      const d = await res.json() as { items?: Array<{ id: string; toolkit?: { slug: string } }> }
      const gmailConn = d.items?.find(c => c.toolkit?.slug?.toLowerCase() === 'gmail')
      if (gmailConn?.id) {
        console.log('[tasks PATCH] Found Gmail connectedAccountId (entity-scoped):', gmailConn.id)
        return gmailConn.id
      }
    } else {
      const t = await res.text()
      console.log('[tasks PATCH] entity-scoped connectedAccounts:', res.status, t.slice(0, 200))
    }
  } catch (e) {
    console.error('[tasks PATCH] entity-scoped connectedAccounts error:', e)
  }

  // 2) Global fallback (covers admin/dashboard-created connections)
  try {
    const res = await fetch(
      `${V3}/connected_accounts?status=ACTIVE&limit=50`,
      { headers }
    )
    if (res.ok) {
      const d = await res.json() as { items?: Array<{ id: string; toolkit?: { slug: string } }> }
      const gmailConn = d.items?.find(c => c.toolkit?.slug?.toLowerCase() === 'gmail')
      if (gmailConn?.id) {
        console.log('[tasks PATCH] Found Gmail connectedAccountId (global fallback):', gmailConn.id)
        return gmailConn.id
      }
      console.log('[tasks PATCH] Global connections list:', d.items?.map(c => c.toolkit?.slug))
    } else {
      const t = await res.text()
      console.log('[tasks PATCH] global connectedAccounts:', res.status, t.slice(0, 200))
    }
  } catch (e) {
    console.error('[tasks PATCH] global connectedAccounts error:', e)
  }

  return null
}

// Normalize payload — handles Postgres returning JSONB as either object or string
function normalizePayload(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as Record<string, unknown> } catch { return {} }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  return {}
}

// PATCH /api/tasks — approve/reject task; auto-sends email for create_email_draft tasks
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as { id?: string } | undefined)?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await ensureTable()
    const body = await req.json() as {
      id: string
      status: string
      attachment?: { name: string; filename?: string; dataUrl?: string; base64Data?: string; mimeType?: string; mimetype?: string; s3key?: string }
    }
    const { id, status, attachment } = body
    if (!id || !status) return NextResponse.json({ error: 'Missing id or status' }, { status: 400 })

    const validStatuses = ['approved', 'rejected', 'completed', 'failed', 'skipped', 'pending', 'cancelled', 'paused']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const resolvedStatus = status === 'approved' ? 'completed' : status === 'rejected' ? 'skipped' : status
    const setResolved = ['completed', 'skipped', 'failed', 'cancelled'].includes(resolvedStatus)

    if (status === 'approved') {
      const taskRes = await query<{ action: string; payload: unknown }>(
        `SELECT action, payload FROM sparkie_tasks WHERE id = $1 AND user_id = $2`,
        [id, userId]
      )
      const task = taskRes.rows[0]

      // Calendar event approval — action is stored as executeConnectorTool('GOOGLECALENDAR_CREATE_EVENT', {...})
      if (task && task.action.startsWith("executeConnectorTool('GOOGLECALENDAR_CREATE_EVENT'")) {
        const payload = normalizePayload(task.payload)
        const composioKey = process.env.COMPOSIO_API_KEY
        const entityId = `sparkie_user_${userId}`
        if (composioKey) {
          const createArgs: Record<string, unknown> = {}
          if (payload.summary)        createArgs.summary = payload.summary
          if (payload.start_datetime) createArgs.start_datetime = payload.start_datetime
          if (payload.end_datetime)   createArgs.end_datetime = payload.end_datetime
          if (payload.description)    createArgs.description = payload.description
          if (payload.location)       createArgs.location = payload.location
          if (payload.attendees)      createArgs.attendees = (payload.attendees as string).split(',').map((a: string) => a.trim())
          try {
            const calRes = await fetch(`${V3}/tools/execute/GOOGLECALENDAR_CREATE_EVENT`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-api-key': composioKey },
              body: JSON.stringify({ entity_id: entityId, arguments: createArgs }),
            })
            const calText = await calRes.text()
            if (!calRes.ok) {
              console.error('[tasks PATCH] Calendar create failed:', calRes.status, calText.slice(0, 300))
            } else {
              console.log('[tasks PATCH] Calendar event created:', calRes.status, calText.slice(0, 200))
            }
          } catch (e) {
            console.error('[tasks PATCH] Calendar create error:', e)
          }
        }
      }

      if (task && (task.action === 'create_email_draft' || task.action === 'send_email')) {
        // Normalize payload — Postgres JSONB may come back as object or string depending on pg driver
        const payload = normalizePayload(task.payload)
        const composioKey = process.env.COMPOSIO_API_KEY
        const entityId = `sparkie_user_${userId}`

        // Log full payload for diagnosis
        console.log('[tasks PATCH] Email task payload keys:', Object.keys(payload), 'values:', JSON.stringify(payload).slice(0, 300))

        const recipientEmail = (payload.to ?? payload.recipient_email ?? payload.email ?? payload.recipient) as string | undefined
        console.log('[tasks PATCH] Email send attempt — recipient:', recipientEmail, 'action:', task.action, 'hasAttachment:', !!attachment)

        if (composioKey && recipientEmail) {
          try {
            const emailBody = (payload.body ?? payload.message ?? payload.content ?? '') as string
            const emailSubject = (payload.subject ?? payload.title ?? '(no subject)') as string
            const attData = attachment as Record<string, string> | null | undefined
            const hasAttachment = !!attData?.base64Data && !!(attData?.filename || attData?.name)

            if (!hasAttachment) {
              // Plain send — use Composio GMAIL_SEND_EMAIL tool directly
              const composioRes = await fetch(`${V3}/tools/execute/GMAIL_SEND_EMAIL`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': composioKey },
                body: JSON.stringify({
                  entity_id: entityId,
                  arguments: {
                    recipient_email: recipientEmail,
                    subject: emailSubject,
                    body: emailBody,
                    is_html: false,
                  },
                }),
              })
              const composioText = await composioRes.text()
              if (!composioRes.ok) {
                console.error('[tasks PATCH] Gmail plain send failed:', composioRes.status, composioText)
              } else {
                console.log('[tasks PATCH] Gmail plain send success:', composioRes.status, composioText.slice(0, 200))
              }
            } else {
              // Attachment send — build raw RFC 2822 MIME + send via Composio proxy
              const boundary = `sparkie_${Date.now()}_boundary`
              const mimeType = attData.mimeType || attData.mimetype || 'application/octet-stream'
              const filename = attData.filename || attData.name || 'attachment'
              const fileBase64 = attData.base64Data

              const mimeLines = [
                `From: me`,
                `To: ${recipientEmail}`,
                `Subject: ${emailSubject}`,
                `MIME-Version: 1.0`,
                `Content-Type: multipart/mixed; boundary="${boundary}"`,
                ``,
                `--${boundary}`,
                `Content-Type: text/plain; charset="UTF-8"`,
                `Content-Transfer-Encoding: 7bit`,
                ``,
                emailBody,
                ``,
                `--${boundary}`,
                `Content-Type: ${mimeType}; name="${filename}"`,
                `Content-Disposition: attachment; filename="${filename}"`,
                `Content-Transfer-Encoding: base64`,
                ``,
                fileBase64.match(/.{1,76}/g)?.join('\r\n') ?? fileBase64,
                ``,
                `--${boundary}--`,
              ]

              const rawMessage = mimeLines.join('\r\n')
              const rawBase64url = Buffer.from(rawMessage).toString('base64')
                .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

              console.log('[tasks PATCH] MIME assembled, rawBase64url length:', rawBase64url.length)

              const connectedAccountId = await getGmailConnectedAccountId(entityId, composioKey)

              if (!connectedAccountId) {
                console.warn('[tasks PATCH] No Gmail connectedAccountId — falling back to plain send')
                const fallbackRes = await fetch(`${V3}/tools/execute/GMAIL_SEND_EMAIL`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'x-api-key': composioKey },
                  body: JSON.stringify({
                    entity_id: entityId,
                    arguments: {
                      recipient_email: recipientEmail,
                      subject: emailSubject,
                      body: `${emailBody}\n\n[Attachment could not be delivered — image omitted]`,
                      is_html: false,
                    },
                  }),
                })
                const fallbackText = await fallbackRes.text()
                console.log('[tasks PATCH] Fallback plain send:', fallbackRes.status, fallbackText.slice(0, 200))
              } else {
                try {
                  const proxyRes = await fetch('https://backend.composio.dev/api/v2/actions/proxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': composioKey },
                    body: JSON.stringify({
                      endpoint: '/gmail/v1/users/me/messages/send',
                      method: 'POST',
                      connectedAccountId,
                      body: { raw: rawBase64url },
                    }),
                  })
                  const proxyText = await proxyRes.text()
                  if (!proxyRes.ok) {
                    console.error('[tasks PATCH] Gmail proxy send failed:', proxyRes.status, proxyText.slice(0, 400))
                    const fallbackRes = await fetch(`${V3}/tools/execute/GMAIL_SEND_EMAIL`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'x-api-key': composioKey },
                      body: JSON.stringify({
                        entity_id: entityId,
                        arguments: {
                          recipient_email: recipientEmail,
                          subject: emailSubject,
                          body: `${emailBody}\n\n[Attachment could not be delivered]`,
                          is_html: false,
                        },
                      }),
                    })
                    console.log('[tasks PATCH] Proxy-failed fallback plain send:', fallbackRes.status)
                  } else {
                    let proxyData: { id?: string } = {}
                    try { proxyData = JSON.parse(proxyText) } catch { /* ignore */ }
                    console.log('[tasks PATCH] Gmail proxy send success! messageId:', proxyData?.id, 'recipient:', recipientEmail, 'attachment:', filename)
                  }
                } catch (e) {
                  console.error('[tasks PATCH] Gmail proxy send error:', e)
                }
              }
            }
          } catch (e) {
            console.error('[tasks PATCH] Gmail send error:', e)
          }
        } else {
          console.warn('[tasks PATCH] Gmail send skipped — composioKey:', !!composioKey, 'recipient:', recipientEmail)
        }
      }
    }

    await query(
      `UPDATE sparkie_tasks SET status = $1 ${setResolved ? ', resolved_at = NOW()' : ''}
       WHERE id = $2 AND user_id = $3`,
      [resolvedStatus, id, userId]
    )

    return NextResponse.json({ ok: true, status: resolvedStatus })
  } catch (e) {
    console.error('tasks PATCH error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
