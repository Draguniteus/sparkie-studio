// Sprint 2 — P1 Case Handlers
// Called from executeTool() default branch in route.ts

import { query } from '@/lib/db'
import { writeWorklog } from '@/lib/worklog'

const MINIMAX_BASE = 'https://api.minimax.io/v1'

export async function executeSprint2Tool(
  name: string,
  args: Record<string, unknown>,
  userId: string | null
): Promise<string | null> {
  switch (name) {
    case 'get_schema': {
      if (!userId) return 'Not authenticated'
      const { tables } = args as { tables?: string }
      try {
        if (tables && tables.trim()) {
          const tableList = tables.split(',').map((t: string) => t.trim()).filter(Boolean)
          const rows: Array<Record<string, string | null>> = []
          for (const tbl of tableList) {
            const res = await query(
              `SELECT column_name, data_type, is_nullable, column_default
               FROM information_schema.columns
               WHERE table_name = $1 AND table_schema = 'public'
               ORDER BY ordinal_position`,
              [tbl]
            )
            rows.push(...res.rows.map((r: any) => ({ table_name: tbl, ...r } as Record<string, string | null>)))
          }
          if (!rows.length) return `No columns found for table(s): ${tables}. Check table names.`
          const grouped: Record<string, string[]> = {}
          for (const r of rows) {
            if (!grouped[r.table_name!]) grouped[r.table_name!] = []
            grouped[r.table_name!].push(`  ${r.column_name} ${String(r.data_type).toUpperCase()}${r.is_nullable === 'NO' ? ' NOT NULL' : ''}${r.column_default ? ' DEFAULT ' + r.column_default : ''}`)
          }
          return Object.entries(grouped).map(([t, cols]) => `TABLE ${t}:\n${cols.join('\n')}`).join('\n\n')
        } else {
          const res = await query(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema = 'public' ORDER BY table_name`
          )
          return 'Tables: ' + res.rows.map((r: any) => String(r.table_name)).join(', ')
        }
      } catch (e) {
        return `get_schema error: ${String(e)}`
      }
    }

    case 'get_deployment_history': {
      const { limit = 5 } = args as { limit?: number }
      const n = Math.min(Number(limit) || 5, 20)
      try {
        const doToken = process.env.DO_API_TOKEN
        if (!doToken) return 'get_deployment_history: DO_API_TOKEN not configured'
        const appId = 'fb3d58ac-f1b5-4e65-89b5-c12834d8119a'
        const r = await fetch(
          `https://api.digitalocean.com/v2/apps/${appId}/deployments?page=1&per_page=${n}`,
          { headers: { Authorization: `Bearer ${doToken}` } }
        )
        if (!r.ok) return `get_deployment_history: DO API error ${r.status}`
        const d = await r.json() as { deployments?: Array<{ id: string; phase: string; cause: string; updated_at: string; created_at: string }> }
        const deps = d.deployments ?? []
        if (!deps.length) return 'No deployments found.'
        return deps.map((dep, i) =>
          `${i + 1}. ${dep.phase.padEnd(12)} | ${dep.cause?.slice(0, 40) ?? 'manual'} | ${dep.updated_at?.slice(0, 16)} | ID: ${dep.id.slice(0, 8)}`
        ).join('\n')
      } catch (e) {
        return `get_deployment_history error: ${String(e)}`
      }
    }

    case 'search_github': {
      if (!userId) return 'Not authenticated'
      const { query: searchQ, path: searchPath } = args as { query: string; path?: string }
      if (!searchQ) return 'search_github: query is required'
      try {
        const ghToken = process.env.GITHUB_TOKEN
        if (!ghToken) return 'search_github: GITHUB_TOKEN not configured'
        const q = encodeURIComponent(`${searchQ} repo:Draguniteus/sparkie-studio${searchPath ? ' path:' + searchPath : ''}`)
        const r = await fetch(
          `https://api.github.com/search/code?q=${q}&per_page=10`,
          { headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } }
        )
        if (!r.ok) return `search_github: GitHub API error ${r.status}`
        const d = await r.json() as { items?: Array<{ path: string; name: string; html_url: string; text_matches?: Array<{ fragment: string }> }>; total_count?: number }
        const items = d.items ?? []
        if (!items.length) return `No results for "${searchQ}"`
        const lines = items.slice(0, 8).map((it, i) => {
          const frag = it.text_matches?.[0]?.fragment?.slice(0, 80).replace(/\n/g, ' ') ?? ''
          return `${i + 1}. ${it.path}${frag ? '\n   ...' + frag : ''}`
        })
        return `Found ${d.total_count ?? items.length} result(s) for "${searchQ}":\n\n${lines.join('\n')}`
      } catch (e) {
        return `search_github error: ${String(e)}`
      }
    }

    case 'create_calendar_event': {
      if (!userId) return 'Not authenticated'
      const { summary, start_datetime, end_datetime, description: evDesc, attendees, location } = args as {
        summary: string; start_datetime: string; end_datetime: string
        description?: string; attendees?: string; location?: string
      }
      if (!summary || !start_datetime || !end_datetime) return 'create_calendar_event: summary, start_datetime, and end_datetime are required'
      const taskId = `hitl_calendar_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const payload = { summary, start_datetime, end_datetime, description: evDesc, attendees, location }
      const label = `Create calendar event: "${summary}" on ${start_datetime.slice(0, 16)}`
      await query(
        `INSERT INTO sparkie_tasks (id, user_id, action, label, payload, status, executor, trigger_type, why_human, created_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', 'human', 'manual', $6, NOW())`,
        [taskId, userId,
         `executeConnectorTool('GOOGLECALENDAR_CREATE_EVENT', ${JSON.stringify(payload)})`,
         label,
         JSON.stringify(payload),
         'Calendar event creation — requires your approval before adding to calendar']
      ).catch(() => {})
      return `HITL_TASK:${JSON.stringify({ id: taskId, action: 'GOOGLECALENDAR_CREATE_EVENT', label, payload, status: 'pending' })}`
    }

    case 'transcribe_audio': {
      if (!userId) return 'Not authenticated'
      const { audio_url, language = 'en' } = args as { audio_url: string; language?: string }
      if (!audio_url) return 'transcribe_audio: audio_url is required'
      try {
        const dgKey = process.env.DEEPGRAM_API_KEY
        if (!dgKey) return 'transcribe_audio: DEEPGRAM_API_KEY not configured'
        const r = await fetch(
          `https://api.deepgram.com/v1/listen?model=nova-2&language=${language}&smart_format=true&punctuate=true`,
          {
            method: 'POST',
            headers: { Authorization: `Token ${dgKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: audio_url }),
          }
        )
        if (!r.ok) return `transcribe_audio: Deepgram error ${r.status}`
        const d = await r.json() as { results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string; confidence?: number }> }> } }
        const transcript = d.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''
        const confidence = d.results?.channels?.[0]?.alternatives?.[0]?.confidence ?? 0
        if (!transcript) return 'transcribe_audio: No transcript returned'
        writeWorklog(userId, 'task_executed', `Transcribed audio (${Math.round(confidence * 100)}% confidence)`, { decision_type: 'action', signal_priority: 'P2' }).catch(() => {})
        return `**Transcript** (${Math.round(confidence * 100)}% confidence):\n\n${transcript}`
      } catch (e) {
        return `transcribe_audio error: ${String(e)}`
      }
    }

    case 'text_to_speech': {
      if (!userId) return 'Not authenticated'
      const { text: ttsText, voice_id = 'English_Graceful_Lady' } = args as { text: string; voice_id?: string }
      if (!ttsText) return 'text_to_speech: text is required'
      if (ttsText.length > 2000) return 'text_to_speech: text must be 2000 characters or fewer'
      try {
        const mmKey = process.env.MINIMAX_API_KEY
        if (!mmKey) return 'text_to_speech: MINIMAX_API_KEY not configured'
        const r = await fetch(`${MINIMAX_BASE}/t2a_v2`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${mmKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'speech-02',
            text: ttsText,
            stream: false,
            voice_setting: { voice_id, speed: 1.0, vol: 1.0, pitch: 0 },
            audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3' },
          }),
        })
        if (!r.ok) return `text_to_speech: MiniMax error ${r.status}`
        const d = await r.json() as { audio_file?: string; base_resp?: { status_code?: number; status_msg?: string } }
        if (!d.audio_file) return `text_to_speech: No audio returned${d.base_resp?.status_msg ? ' — ' + d.base_resp.status_msg : ''}`
        writeWorklog(userId, 'task_executed', `TTS synthesized: "${ttsText.slice(0, 60)}${ttsText.length > 60 ? '...' : ''}"`, { decision_type: 'action', signal_priority: 'P3' }).catch(() => {})
        return `AUDIO_URL:data:audio/mp3;base64,${d.audio_file}`
      } catch (e) {
        return `text_to_speech error: ${String(e)}`
      }
    }

    default:
      return null // not a Sprint 2 tool
  }
}
