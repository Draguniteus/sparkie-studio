import { query } from '@/lib/db'

export type IdentityFileType = 'user' | 'memory' | 'session' | 'heartbeat' | 'context' | 'actions'

export interface IdentityFiles {
  user: string
  memory: string
  session: string
  heartbeat: string
  context: string   // L3: live state — what's currently happening, active threads, known blockers
  actions: string   // L6: action chain — what Sparkie is tracking, next steps, pending items
}

/**
 * Load all identity files for a user from the DB.
 * Returns empty strings for any file not yet written.
 */
export async function loadIdentityFiles(userId: string): Promise<IdentityFiles> {
  try {
    const result = await query(
      'SELECT file_type, content FROM user_identity_files WHERE user_id = $1',
      [userId]
    )
    const files: Partial<IdentityFiles> = {}
    for (const row of result.rows) {
      files[row.file_type as IdentityFileType] = row.content
    }
    return {
      user:      files.user      ?? '',
      memory:    files.memory    ?? '',
      session:   files.session   ?? '',
      heartbeat: files.heartbeat ?? '',
      context:   files.context   ?? '',
      actions:   files.actions   ?? '',
    }
  } catch {
    return { user: '', memory: '', session: '', heartbeat: '', context: '', actions: '' }
  }
}

/**
 * Upsert a single identity file.
 */
export async function saveIdentityFile(
  userId: string,
  type: IdentityFileType,
  content: string
): Promise<void> {
  await query(
    `INSERT INTO user_identity_files (user_id, file_type, content, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, file_type)
     DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
    [userId, type, content]
  )
}

/**
 * Append a timestamped entry to a file (used for MEMORY.md and HEARTBEAT.md).
 */
export async function appendIdentityEntry(
  userId: string,
  type: IdentityFileType,
  entry: string
): Promise<void> {
  const current = await query(
    'SELECT content FROM user_identity_files WHERE user_id = $1 AND file_type = $2',
    [userId, type]
  )
  const existing: string = current.rows[0]?.content ?? ''
  const timestamp = new Date().toISOString().split('T')[0]
  const newLine = `- [${timestamp}] ${entry.trim()}`
  const updated = existing ? `${existing}\n${newLine}` : newLine
  await saveIdentityFile(userId, type, updated)
}

/**
 * Build the identity block injected into the system prompt.
 * Includes L3 (context) and L6 (actions) cognition layers.
 * Returns empty string if all files are empty (new user, no data yet).
 */
export function buildIdentityBlock(files: IdentityFiles, username?: string): string {
  const sections: string[] = []

  if (files.user) {
    sections.push(`## USER PROFILE\n${files.user}`)
  }

  if (files.memory) {
    sections.push(`## LONG-TERM MEMORIES\n${files.memory}`)
  }

  if (files.context) {
    sections.push(
      `## LIVE STATE (L3 — What's Happening Right Now)\n` +
      `This is your compressed live state. Read it before every response.\n` +
      `It tells you: active projects, open threads, known blockers, recent decisions.\n\n` +
      files.context
    )
  }

  if (files.actions) {
    sections.push(
      `## ACTION CHAIN (L6 — What You're Tracking)\n` +
      `These are your tracked next steps and pending items.\n` +
      `Items marked (AI) you can execute. Items marked (Waiting) are blocked. Items marked (User) need their input.\n\n` +
      files.actions
    )
  }

  if (files.session) {
    sections.push(`## RECENT SESSION\n${files.session}`)
  }

  if (files.heartbeat) {
    sections.push(`## THINGS TO WATCH FOR\n${files.heartbeat}`)
  }

  if (sections.length === 0) return ''

  const name = username ? ` for ${username}` : ''
  return `\n\n---\n## YOUR LIVING KNOWLEDGE${name}\n${sections.join('\n\n')}\n---`
}

/**
 * Called from the chat route after Sparkie's response completes.
 * Writes a rolling SESSION.md: last 10 turns discussed.
 */
export async function updateSessionFile(
  userId: string,
  userMessage: string,
  sparkieResponse: string
): Promise<void> {
  try {
    const current = await query(
      'SELECT content FROM user_identity_files WHERE user_id = $1 AND file_type = $2',
      [userId, 'session']
    )
    const existing: string = current.rows[0]?.content ?? ''

    const now = new Date()
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    const dateStr = now.toISOString().split('T')[0]

    // Keep a rolling log of the last 10 turns (each turn = ~6 lines)
    const lines = existing ? existing.split('\n') : []
    const MAX_LINES = 60 // ~10 turns

    const sparkie_summary = sparkieResponse.slice(0, 200).replace(/\n/g, ' ')
    const newEntry = [
      `### ${dateStr} ${timeStr}`,
      `**You:** ${userMessage.slice(0, 150)}`,
      `**Sparkie:** ${sparkie_summary}${sparkieResponse.length > 200 ? '...' : ''}`,
      ''
    ].join('\n')

    lines.push(...newEntry.split('\n'))
    const trimmed = lines.slice(-MAX_LINES)
    await saveIdentityFile(userId, 'session', trimmed.join('\n'))
  } catch {
    // Non-fatal
  }
}

/**
 * Update Sparkie's live context state (L3).
 * Called by Sparkie via the update_context tool.
 */
export async function updateContextFile(userId: string, content: string): Promise<void> {
  await saveIdentityFile(userId, 'context', content)
}

/**
 * Update Sparkie's action chain (L6).
 * Called by Sparkie via the update_actions tool.
 */
export async function updateActionsFile(userId: string, content: string): Promise<void> {
  await saveIdentityFile(userId, 'actions', content)
}
