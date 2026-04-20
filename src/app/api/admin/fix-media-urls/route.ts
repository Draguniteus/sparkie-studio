import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

export const runtime = 'nodejs'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const BROKEN_HOST = 'media.sparkiestudio.com'

// GET /api/admin/fix-media-urls?dry_run=true  — report only
// GET /api/admin/fix-media-urls?fix=true     — actually fix (requires MIGRATE_SECRET)
export async function GET(req: NextRequest) {
  const secret       = req.nextUrl.searchParams.get('secret')
  const headerSecret = req.headers.get('x-sparkie-secret')
  const doFix  = req.nextUrl.searchParams.get('fix') === 'true'
  const dryRun = !doFix

  const validSecret = secret === (process.env.MIGRATE_SECRET ?? 'sparkie-migrate')
  const validHeader = headerSecret === process.env.SPARKIE_INTERNAL_SECRET
  // Allow SPARKIE_INTERNAL_SECRET as ?secret= for easy browser testing
  const validInternalAsSecret = secret === process.env.SPARKIE_INTERNAL_SECRET

  if (!validSecret && !validHeader && !validInternalAsSecret) {
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
            // Extract any broken URLs from the preview to show filenames
            const brokenMatches = (row.preview as string).match(new RegExp(`https://${BROKEN_HOST}/([^?|\\s]+)`, 'g')) || []
            const filenames = brokenMatches.map((u: string) => u.replace(`https://${BROKEN_HOST}/`, ''))
            findings.push({
              table,
              column: column_name,
              id: row.id,
              preview: row.preview + (filenames.length ? ` → files: ${filenames.join(', ')}` : ''),
            })
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
    // Strategy: extract filename from broken URL → look up file_id from sparkie_assets → build proper proxy URL
    const appUrl = process.env.NEXTAUTH_URL ?? 'https://sparkie-studio-mhouq.ondigitalocean.app'
    let updated = 0
    const details: Array<{ id: string; filename: string; file_id: string | null; new_url: string }> = []

    for (const { table, column, id } of findings) {
      try {
        if (column === 'content') {
          // Get the raw content for this record
          const row = await client.query(`
            SELECT content FROM ${table} WHERE id::text = $1
          `, [id])
          if (!row.rows.length) continue
          const rawContent = row.rows[0].content as string

          // Extract filename(s) from broken CDN URLs in this content
          const brokenUrlMatches = rawContent.match(new RegExp(`https://${BROKEN_HOST}/([^?|\\s]+)`, 'g'))
          if (!brokenUrlMatches) continue

          for (const brokenUrl of brokenUrlMatches) {
            const filename = brokenUrl.replace(`https://${BROKEN_HOST}/`, '')
            // Try to find matching file_id from sparkie_assets using the filename (stored in 'name' column)
            let fileId: string | null = null
            try {
              const assetRow = await client.query(`
                SELECT id::text as file_id FROM sparkie_assets
                WHERE name ILIKE $1 OR content ILIKE $1
                LIMIT 1
              `, [`%${filename}%`])
              if (assetRow.rows.length) {
                fileId = assetRow.rows[0].file_id
              }
            } catch {
              // sparkie_assets lookup failed — continue without file_id
            }

            // Build new URL: either /api/assets-audio?fid=xxx or /api/assets-image?fid=xxx
            const isAudio = filename.endsWith('.mp3') || filename.endsWith('.wav') || filename.endsWith('.m4a')
            const newBase = isAudio ? `${appUrl}/api/assets-audio` : `${appUrl}/api/assets-image`
            const newUrl = fileId
              ? `${newBase}?fid=${fileId}`
              : `${newBase}?file=${encodeURIComponent(filename)}`

            // Replace this specific broken URL in the content
            const updatedContent = rawContent.replace(brokenUrl, newUrl)
            if (updatedContent === rawContent) continue

            await client.query(`
              UPDATE ${table} SET ${column} = $1 WHERE id::text = $2
            `, [updatedContent, id])

            details.push({ id, filename, file_id: fileId, new_url: newUrl })
            updated++
          }
        }
      } catch (e) {
        console.error(`Failed to update ${table}.${column} id=${id}:`, e)
      }
    }

    return NextResponse.json({
      fixed: true,
      broken_host: BROKEN_HOST,
      records_updated: updated,
      replacement_base: `${appUrl}/api/assets-audio`,
      details,
    })
  } finally {
    client.release()
    await pool.end()
  }
}
