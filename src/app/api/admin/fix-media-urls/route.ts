import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

export const runtime = 'nodejs'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const BROKEN_HOST = 'media.sparkiestudio.com'

// GET /api/admin/fix-media-urls?dry_run=true  — report only
// GET /api/admin/fix-media-urls?fix=true     — actually fix (requires MIGRATE_SECRET)
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  const doFix  = req.nextUrl.searchParams.get('fix') === 'true'
  const dryRun = !doFix

  if (secret !== (process.env.MIGRATE_SECRET ?? 'sparkie-migrate')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
  })

  const client = await pool.connect()
  try {
    // Search all text columns in relevant tables for the broken hostname
    const findings: Array<{ table: string; column: string; id: string; preview: string }> = []

    const tables = ['chat_messages', 'sparkie_assets', 'sparkie_feed', 'sparkie_radio_tracks']

    for (const table of tables) {
      // Dynamically find text/jsonb columns in this table
      const cols = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND data_type IN ('text', 'character varying', 'jsonb', 'character')
        ORDER BY ordinal_position
      `, [table])

      for (const { column_name, data_type } of cols.rows as { column_name: string; data_type: string }[]) {
        try {
          let rows: { id: string; preview: string }[] = []
          if (data_type === 'jsonb') {
            rows = (await client.query(`
              SELECT id::text,
                     substring(content::text, 1, 200) as preview
              FROM ${table}
              WHERE content::text ILIKE $1
            `, [`%${BROKEN_HOST}%`])).rows as { id: string; preview: string }[]
          } else {
            rows = (await client.query(`
              SELECT id::text,
                     substring(${column_name}::text, 1, 200) as preview
              FROM ${table}
              WHERE ${column_name} ILIKE $1
            `, [`%${BROKEN_HOST}%`])).rows as { id: string; preview: string }[]
          }
          for (const row of rows) {
            findings.push({ table, column: column_name, id: row.id, preview: row.preview })
          }
        } catch {
          // column might not exist or be queryable — skip
        }
      }
    }

    if (dryRun) {
      return NextResponse.json({
        dry_run: true,
        broken_host: BROKEN_HOST,
        records_found: findings.length,
        findings,
        message: `Found ${findings.length} records with ${BROKEN_HOST}. Add ?fix=true to actually update them.`,
      })
    }

    // Actually fix: replace broken CDN URL with the app's audio proxy
    const appUrl = process.env.NEXTAUTH_URL ?? 'https://sparkie-studio-mhouq.ondigitalocean.app'
    let updated = 0

    for (const { table, column, id } of findings) {
      try {
        if (column === 'content' && (table === 'sparkie_assets' || table === 'chat_messages')) {
          await client.query(`
            UPDATE ${table}
            SET ${column} = replace(${column}::text, $1, $2)::text
            WHERE id::text = $3
          `, [BROKEN_HOST, `${appUrl}/api/assets-audio`, id])
          updated++
        }
      } catch (e) {
        console.error(`Failed to update ${table}.${column} id=${id}:`, e)
      }
    }

    return NextResponse.json({
      fixed: true,
      broken_host: BROKEN_HOST,
      records_updated: updated,
      replacement: `${appUrl}/api/assets-audio`,
    })
  } finally {
    client.release()
    await pool.end()
  }
}
