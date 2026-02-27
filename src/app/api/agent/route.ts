import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 30

// ── POST /api/agent ────────────────────────────────────────────────────────────
// Sparkie-initiated outreach: check if Sparkie has anything proactive to say
// Called by the client on a polling interval (every 60s when tab is focused)
// Returns { message: string | null, type: 'brief' | 'followup' | 'reminder' | null }
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as { id?: string } | undefined)?.id
    if (!userId) return NextResponse.json({ message: null, type: null })

    const { lastMessageAt, currentHour } = await req.json() as {
      lastMessageAt?: string
      currentHour?: number
    }

    // Auto-create tables if needed
    await query(`CREATE TABLE IF NOT EXISTS sparkie_outreach_log (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      sent_at TIMESTAMPTZ DEFAULT NOW()
    )`)
    await query(`CREATE INDEX IF NOT EXISTS idx_outreach_user ON sparkie_outreach_log(user_id, sent_at)`)

    const hour = currentHour ?? new Date().getHours()

    // Check what we've already sent today to avoid spam
    const sentToday = await query<{ type: string }>(
      `SELECT type FROM sparkie_outreach_log
       WHERE user_id = $1 AND sent_at > NOW() - INTERVAL '12 hours'`,
      [userId]
    )
    const sentTypes = new Set(sentToday.rows.map(r => r.type))

    // ── Morning brief trigger (8am-11am, once per morning) ────────────────────
    if (hour >= 8 && hour < 11 && !sentTypes.has('morning_brief')) {
      // Check if user hasn't sent a message yet this morning
      const recentActivity = await query<{ last_seen_at: Date }>(
        'SELECT last_seen_at FROM user_sessions WHERE user_id = $1',
        [userId]
      )
      const lastSeen = recentActivity.rows[0]?.last_seen_at
      const hoursSinceLastSeen = lastSeen
        ? (Date.now() - new Date(lastSeen).getTime()) / (1000 * 60 * 60)
        : 999

      if (hoursSinceLastSeen > 5) {
        await query(
          'INSERT INTO sparkie_outreach_log (user_id, type) VALUES ($1, $2)',
          [userId, 'morning_brief']
        )
        return NextResponse.json({
          type: 'morning_brief',
          message: 'morning_brief',
          trigger: true,
        })
      }
    }

    // ── Inactivity check-in (after 3+ days away, once per week) ───────────────
    if (!sentTypes.has('checkin')) {
      const sessions = await query<{ last_seen_at: Date; session_count: number }>(
        'SELECT last_seen_at, session_count FROM user_sessions WHERE user_id = $1',
        [userId]
      )
      const lastSeen = sessions.rows[0]?.last_seen_at
      if (lastSeen) {
        const daysSince = (Date.now() - new Date(lastSeen).getTime()) / (1000 * 60 * 60 * 24)
        if (daysSince >= 3) {
          // Load memories to personalize check-in
          const memories = await query<{ content: string }>(
            'SELECT content FROM user_memories WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3',
            [userId]
          )
          const memoryHints = memories.rows.map(r => r.content).join('; ')
          await query(
            'INSERT INTO sparkie_outreach_log (user_id, type) VALUES ($1, $2)',
            [userId, 'checkin']
          )
          return NextResponse.json({
            type: 'checkin',
            message: 'checkin',
            daysSince: Math.floor(daysSince),
            memoryHints,
            trigger: true,
          })
        }
      }
    }

    return NextResponse.json({ message: null, type: null, trigger: false })
  } catch {
    return NextResponse.json({ message: null, type: null, trigger: false })
  }
}
