import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export const runtime = 'nodejs'

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
  // Add missing columns to existing tables gracefully
  await query(`ALTER TABLE sparkie_tasks ADD COLUMN IF NOT EXISTS executor TEXT NOT NULL DEFAULT 'human'`).catch(() => {})
  await query(`ALTER TABLE sparkie_tasks ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'manual'`).catch(() => {})
  await query(`ALTER TABLE sparkie_tasks ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ`).catch(() => {})
}

// POST /api/tasks — create a new pending task
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as { id?: string } | undefined)?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await ensureTable()
    const { id, action, label, payload, executor, why_human } = await req.json() as {
      id: string; action: string; label: string; payload: Record<string, unknown>
      executor?: string; why_human?: string
    }
    if (!id || !action || !label) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    await query(
      `INSERT INTO sparkie_tasks (id, user_id, action, label, payload, status, executor, why_human)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [id, userId, action, label, JSON.stringify(payload), executor ?? 'human', why_human ?? null]
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('tasks POST error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// GET /api/tasks?id=xxx — get single task
// GET /api/tasks?status=all|pending&limit=N — list tasks for TaskQueuePanel
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as { id?: string } | undefined)?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await ensureTable()
    const id = req.nextUrl.searchParams.get('id')
    const statusFilter = req.nextUrl.searchParams.get('status')
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '30'), 100)

    // Single task lookup
    if (id) {
      const res = await query<{ id: string; status: string; action: string; label: string; payload: unknown }>(
        `SELECT id, status, action, label, payload FROM sparkie_tasks WHERE id = $1 AND user_id = $2`,
        [id, userId]
      )
      if (res.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json(res.rows[0])
    }

    // List tasks for queue panel
    let whereClause = 'user_id = $1'
    const params: unknown[] = [userId]

    if (statusFilter && statusFilter !== 'all') {
      whereClause += ' AND status = $2'
      params.push(statusFilter)
    } else {
      // Default: show recent tasks (all statuses, last 7 days)
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

// DELETE /api/tasks?id=xxx — cancel/stop a task immediately
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

// PATCH /api/tasks — respond to a task (approve/reject) or update status
// For email draft tasks: also accepts `attachment` field to pass to Gmail send
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

    const validStatuses = ['approved', 'rejected', 'completed', 'failed', 'skipped', 'pending', 'cancelled']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    // Map approved → completed for human tasks
    const resolvedStatus = status === 'approved' ? 'completed' : status === 'rejected' ? 'skipped' : status
    const setResolved = ['completed', 'skipped', 'failed', 'cancelled'].includes(resolvedStatus)

    // For email draft tasks being approved: auto-send via Gmail
    if (status === 'approved') {
      const taskRes = await query<{ action: string; payload: Record<string, unknown> }>(
        `SELECT action, payload FROM sparkie_tasks WHERE id = $1 AND user_id = $2`,
        [id, userId]
      )
      const task = taskRes.rows[0]

      if (task && (task.action === 'create_email_draft' || task.action === 'send_email')) {
        const payload = task.payload as { to?: string; recipient_email?: string; subject?: string; body?: string }
        // Support both 'to' and 'recipient_email' payload keys
        const recipientEmail = payload.to ?? payload.recipient_email
        const composioKey = process.env.COMPOSIO_API_KEY
        const entityId = `sparkie_user_${userId}`

        console.log('[tasks PATCH] Email send attempt — recipient:', recipientEmail, 'action:', task.action, 'payload keys:', Object.keys(payload))

        if (composioKey && recipientEmail) {
          try {
            const emailBody = payload.body ?? ''

            // Build attachment type from PATCH body
            // attachment may have: { name, base64Data, mimeType } (from upload-attachment echo)
            // OR: { name, s3key, mimeType } (legacy Composio path - kept for compat)
            const attData = attachment as Record<string, string> | null | undefined
            const hasAttachment = !!attData?.base64Data && !!attData?.filename

            if (!hasAttachment) {
              // No attachment — use simple Composio GMAIL_SEND_EMAIL call
              const composioRes = await fetch('https://backend.composio.dev/api/v3/tools/execute/GMAIL_SEND_EMAIL', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': composioKey },
                body: JSON.stringify({
                  entity_id: entityId,
                  arguments: {
                    recipient_email: recipientEmail,
                    subject: payload.subject ?? '(no subject)',
                    body: emailBody,
                    is_html: false,
                  },
                }),
              })
              if (!composioRes.ok) {
                const errText = await composioRes.text()
                console.error('[tasks PATCH] Gmail send failed:', composioRes.status, errText)
              } else {
                console.log('[tasks PATCH] Gmail send success for:', recipientEmail)
              }
            } else {
              // Has attachment — build raw RFC 2822 MIME message and send via Gmail API directly
              const boundary = `sparkie_${Date.now()}_boundary`
              const subject = payload.subject ?? '(no subject)'
              const mimeType = attData.mimeType || attData.mimetype || 'application/octet-stream'
              const filename = attData.filename || attData.name || 'attachment'
              const fileBase64 = attData.base64Data

              // Build RFC 2822 MIME multipart message
              const mimeLines = [
                `From: me`,
                `To: ${recipientEmail}`,
                `Subject: ${subject}`,
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
                // Split base64 into 76-char lines (RFC 2822)
                fileBase64.match(/.{1,76}/g)?.join('\r\n') ?? fileBase64,
                ``,
                `--${boundary}--`,
              ]

              const rawMessage = mimeLines.join('\r\n')
              // Base64url encode (URL-safe, no padding)
              const rawBase64url = Buffer.from(rawMessage).toString('base64')
                .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

              // Send via Composio GMAIL_SEND_EMAIL using 'raw' field ONLY
              // IMPORTANT: when 'raw' is present, Gmail API uses it exclusively.
              // Passing other fields (recipient_email, subject, body) alongside 'raw'
              // causes Composio to use the simple send path and ignore the MIME raw payload.
              const composioRes = await fetch('https://backend.composio.dev/api/v3/tools/execute/GMAIL_SEND_EMAIL', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': composioKey },
                body: JSON.stringify({
                  entity_id: entityId,
                  arguments: {
                    raw: rawBase64url,
                  },
                }),
              })
              if (!composioRes.ok) {
                const errText = await composioRes.text()
                console.error('[tasks PATCH] Gmail send (with attachment) failed:', composioRes.status, errText)
              } else {
                console.log('[tasks PATCH] Gmail send with attachment success for:', recipientEmail, 'file:', filename)
              }
            }
          } catch (e) {
            console.error('[tasks PATCH] Gmail send error:', e)
            // Don't block task update — still mark as completed
          }
        } else {
          console.warn('[tasks PATCH] Gmail send skipped — missing composioKey or recipient. composioKey:', !!composioKey, 'recipient:', recipientEmail)
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
