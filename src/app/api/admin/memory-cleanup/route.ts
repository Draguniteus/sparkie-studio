import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

// One-time memory cleanup endpoint — call once after deploy to fix bad DB entries.
// Protected by ADMIN_SECRET env var.
export async function POST(req: NextRequest) {
  const { secret } = await req.json().catch(() => ({}))
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, number> = {}

  try {
    // 1. Delete "Completed tool session" entries from sparkie_self_memory
    const r1 = await query(
      `DELETE FROM sparkie_self_memory WHERE content ILIKE 'Completed tool session%'`
    )
    results.deleted_session_logs = r1.rowCount ?? 0

    // 2. Delete template string entries (contain "${") from user_memories
    const r2 = await query(
      `DELETE FROM user_memories WHERE content LIKE '%\${%'`
    )
    results.deleted_template_strings_user = r2.rowCount ?? 0

    // 3. Delete template string entries from sparkie_self_memory
    const r3 = await query(
      `DELETE FROM sparkie_self_memory WHERE content LIKE '%\${%'`
    )
    results.deleted_template_strings_self = r3.rowCount ?? 0

    // 4. Delete [SKILL: ...] entries from user_memories (they belong in self_memory)
    const r4 = await query(
      `DELETE FROM user_memories WHERE content ILIKE '[SKILL:%'`
    )
    results.deleted_skill_docs_from_user = r4.rowCount ?? 0

    // 5. Replace "They " / "Their " / "the user" with "Michael " in user_memories
    const r5 = await query(
      `UPDATE user_memories
       SET content = regexp_replace(
         regexp_replace(
           regexp_replace(content, '\\bThey\\b', 'Michael', 'g'),
           '\\bTheir\\b', 'Michael''s', 'g'
         ),
         '\\bThe user\\b', 'Michael', 'g'
       )
       WHERE content ~* '\\b(They|Their|The user)\\b'`
    )
    results.fixed_pronouns = r5.rowCount ?? 0

    return NextResponse.json({ ok: true, results })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
