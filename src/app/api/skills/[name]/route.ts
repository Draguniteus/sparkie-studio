import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: { name: string } }
) {
  try {
    const result = await query(
      `SELECT name, description, category, content, installed_at
       FROM sparkie_skills WHERE name = $1 LIMIT 1`,
      [params.name]
    )
    if (!result.rows[0]) {
      return NextResponse.json({ error: `Skill '${params.name}' not found` }, { status: 404 })
    }
    return NextResponse.json({ skill: result.rows[0] })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
