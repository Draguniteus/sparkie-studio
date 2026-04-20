import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

export const runtime = 'nodejs'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const BROKEN_HOST = 'media.sparkiestudio.com'

export async function GET(req: NextRequest) {
  const secret       = req.nextUrl.searchParams.get('secret')
  const headerSecret = req.headers.get('x-sparkie-secret')
  const doFix        = req.nextUrl.searchParams.get('fix') === 'true'
  const dryRun       = !doFix
  const inspectId    = req.nextUrl.searchParams.get('inspect')

  const validSecret = secret === (process.env.MIGRATE_SECRET ?? 'sparkie-migrate')
  const validHeader = headerSecret === process.env.SPARKIE_INTERNAL_SECRET
  const validInternalAsSecret = secret === process.env.SPARKIE_INTERNAL_SECRET

  if (!validSecret && !validHeader && !validInternalAsSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
  const client = await pool.connect()
  try {
    if (inspectId) {
      const row = await client.query(`
        SELECT id::text, content FROM chat_messages WHERE id::text = $1
        UNION ALL
        SELECT id::text, content FROM sparkie_assets WHERE id::text = $1
      `, [inspectId])
      if (!row.rows.length) return NextResponse.json({ inspect: inspectId, found: false })
      const content = row.rows[0].content as string
      const proxyMatches = content.match(/https?:\/\/[^\s'"]+/g) || []
      return NextResponse.json({
        inspect: inspectId,
        found: true,
        content_preview: content.slice(0, 600),
        all_urls: proxyMatches,
      })
    }

    const findings: Array<{ table: string; column: string; id: string; preview: string }> = []
    const tables = ['chat_messages', 'sparkie_assets', 'sparkie_feed', 'sparkie_radio_tracks']

    for (const table of tables) {
      const cols = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
          AND data_type IN ('text', 'character varying', 'jsonb', 'character')
        ORDER BY ordinal_position
      `, [table])

      for (const { column_name, data_type } of cols.rows as { column_name: string; data_type: string }[]) {
        try {
          let rows: { id: string; preview: string }[] = []
          if (data_type === 'jsonb') {
            rows = (await client.query(`
              SELECT id::text, substring(content::text, 1, 200) as preview
              FROM ${table} WHERE content::text ILIKE $1
            `, [`%${BROKEN_HOST}%`])).rows as { id: string; preview: string }[]
          } else {
            rows = (await client.query(`
              SELECT id::text, substring(${column_name}::text, 1, 200) as preview
              FROM ${table} WHERE ${column_name} ILIKE $1
            `, [`%${BROKEN_HOST}%`])).rows as { id: string; preview: string }[]
          }
          for (const row of rows) {
            const brokenMatches = (row.preview as string).match(new RegExp(`https://${BROKEN_HOST}/([^?|\\s]+)`, 'g')) || []
            const filenames = brokenMatches.map((u: string) => u.replace(`https://${BROKEN_HOST}/`, ''))
            findings.push({
              table, column: column_name, id: row.id,
              preview: row.preview + (filenames.length ? ` → files: ${filenames.join(', ')}` : ''),
            })
          }
        } catch {}
      }
    }

    if (dryRun) {
      return NextResponse.json({
        dry_run: true,
        broken_host: BROKEN_HOST,
        records_found: findings.length,
        findings,
        note: 'Records with 0 here = no raw media.sparkiestudio.com URLs remaining. Malformed proxy URLs need inspect mode.',
      })
    }

    const appUrl = process.env.NEXTAUTH_URL ?? 'https://sparkie-studio-mhouq.ondigitalocean.app'
    let updated = 0
    const details: Array<{ id: string; filename: string; new_url: string }> = []

    for (const { table, column, id } of findings) {
      try {
        if (column !== 'content') continue
        const row = await client.query(`SELECT content FROM ${table} WHERE id::text = $1`, [id])
        if (!row.rows.length) continue
        const rawContent = row.rows[0].content as string

        const brokenUrlMatches = rawContent.match(new RegExp(`https://${BROKEN_HOST}/([^?|\\s]+)`, 'g'))
        if (!brokenUrlMatches) continue

        for (const brokenUrl of brokenUrlMatches) {
          const filename = brokenUrl.replace(`https://${BROKEN_HOST}/`, '')
          const isAudio = filename.endsWith('.mp3') || filename.endsWith('.wav') || filename.endsWith('.m4a')
          const newBase = isAudio ? `${appUrl}/api/assets-audio` : `${appUrl}/api/assets-image`
          const newUrl = `${newBase}?file=${encodeURIComponent(filename)}`

          const updatedContent = rawContent.replace(brokenUrl, newUrl)
          if (updatedContent === rawContent) continue

          await client.query(`UPDATE ${table} SET ${column} = $1 WHERE id::text = $2`, [updatedContent, id])
          details.push({ id, filename, new_url: newUrl })
          updated++
        }
      } catch (e) {
        console.error(`Failed to update ${table}.${column} id=${id}:`, e)
      }
    }

    return NextResponse.json({ fixed: true, broken_host: BROKEN_HOST, records_updated: updated, details })
  } finally {
    client.release()
    await pool.end()
  }
}
