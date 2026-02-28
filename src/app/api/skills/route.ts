import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

async function ensureSkillsTable() {
  await query(`CREATE TABLE IF NOT EXISTS sparkie_skills (
    id SERIAL PRIMARY KEY,
    user_id TEXT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    source_url TEXT DEFAULT '',
    category TEXT DEFAULT 'Custom',
    content TEXT DEFAULT '',
    installed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name)
  )`).catch(() => {})
}

export async function GET() {
  await ensureSkillsTable()
  try {
    const result = await query(
      `SELECT id, name, description, source_url, category, installed_at
       FROM sparkie_skills ORDER BY installed_at DESC LIMIT 100`
    )
    return NextResponse.json({ skills: result.rows })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  await ensureSkillsTable()
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string } | undefined
  const userId = user?.id

  try {
    const { url, name, description = '' } = await req.json() as { url: string; name: string; description?: string }
    if (!url || !name) return NextResponse.json({ ok: false, error: 'url and name required' }, { status: 400 })

    // Fetch the skill content
    const fetchRes = await fetch(url, {
      headers: { 'User-Agent': 'Sparkie-Studio/1.0' },
      signal: AbortSignal.timeout(15000),
    })
    if (!fetchRes.ok) return NextResponse.json({ ok: false, error: `Could not fetch URL: ${fetchRes.status}` }, { status: 400 })

    const rawContent = await fetchRes.text()
    const skillContent = rawContent.slice(0, 10000)

    // Detect category from URL/content
    const categoryMap: Record<string, string> = {
      music: 'Music', payment: 'Payments', email: 'Email', sms: 'Messaging',
      voice: 'Voice', vector: 'Database', openai: 'AI', github: 'DevOps',
      stripe: 'Payments', twilio: 'Messaging', sendgrid: 'Email', supabase: 'Database',
    }
    let category = 'Custom'
    for (const [kw, cat] of Object.entries(categoryMap)) {
      if (url.toLowerCase().includes(kw) || name.toLowerCase().includes(kw)) { category = cat; break }
    }

    // Save to sparkie_skills table
    await query(
      `INSERT INTO sparkie_skills (user_id, name, description, source_url, category, content)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (name) DO UPDATE SET description = $3, source_url = $4, content = $6, installed_at = NOW()`,
      [userId ?? 'global', name, description, url, category, skillContent]
    )

    // Also save to user_memories as procedure so Sparkie knows about it in conversations
    if (userId) {
      await query(
        `INSERT INTO user_memories (user_id, category, content, created_at)
         VALUES ($1, 'procedure', $2, NOW())`,
        [userId, `[SKILL: ${name}]\nPurpose: ${description}\nSource: ${url}\nDocumentation (first 10000 chars):\n${skillContent}`]
      ).catch(() => {})
    }

    return NextResponse.json({
      ok: true,
      message: `Skill "${name}" installed. Sparkie has read ${skillContent.length} chars from ${url}.`,
      category
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
