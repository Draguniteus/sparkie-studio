// Sprint 4 — P3 + SureThing Parity Case Handlers

export async function executeSprint4Tool(
  name: string,
  args: Record<string, unknown>,
  userId: string | null,
  baseUrl: string,
  executeConnector: (slug: string, args: Record<string, unknown>, uid: string) => Promise<string>
): Promise<string | null> {
  switch (name) {

    case 'read_email_thread': {
      if (!userId) return 'Not authenticated'
      const { thread_id } = args as { thread_id: string }
      if (!thread_id) return 'read_email_thread: thread_id is required'
      return executeConnector('GMAIL_GET_THREAD', { thread_id }, userId)
    }

    case 'manage_email': {
      if (!userId) return 'Not authenticated'
      const { action, message_id, label, query, max_results = 10 } = args as {
        action: string; message_id?: string; label?: string; query?: string; max_results?: number
      }
      if (!action) return 'manage_email: action is required'
      try {
        if (action === 'search') {
          if (!query) return 'manage_email search: query is required'
          // GMAIL_FETCH_EMAILS supports query param with full Gmail search syntax
          return executeConnector('GMAIL_FETCH_EMAILS', { query, max_results: Math.min(Number(max_results), 50) }, userId)
        }
        if (!message_id) return `manage_email ${action}: message_id is required`
        // Use GMAIL_MODIFY_THREAD_LABELS for all label operations (star/unstar/read/unread/archive/delete)
        // actionMap uses add_label_ids / remove_label_ids per Composio v3 GMAIL_MODIFY_THREAD_LABELS schema
        if (action === 'mark_read') {
          return executeConnector('GMAIL_MODIFY_THREAD_LABELS', { thread_id: message_id, remove_label_ids: ['UNREAD'] }, userId)
        }
        if (action === 'mark_unread') {
          return executeConnector('GMAIL_MODIFY_THREAD_LABELS', { thread_id: message_id, add_label_ids: ['UNREAD'] }, userId)
        }
        if (action === 'archive') {
          return executeConnector('GMAIL_MODIFY_THREAD_LABELS', { thread_id: message_id, remove_label_ids: ['INBOX'] }, userId)
        }
        if (action === 'label') {
          if (!label) return 'manage_email label: label name is required'
          return executeConnector('GMAIL_ADD_LABEL_TO_EMAIL', { message_id, label_name: label }, userId)
        }
        if (action === 'delete') {
          return executeConnector('GMAIL_MOVE_TO_TRASH', { message_id }, userId)
        }
        return `manage_email: unknown action "${action}". Valid: search, mark_read, mark_unread, archive, label, delete`
      } catch (e) {
        return `manage_email error: ${String(e)}`
      }
    }

    case 'rsvp_event': {
      if (!userId) return 'Not authenticated'
      const { event_id, response } = args as { event_id: string; response: string }
      if (!event_id || !response) return 'rsvp_event: event_id and response are required'
      const validResponses = ['accepted', 'declined', 'tentative']
      if (!validResponses.includes(response)) {
        return `rsvp_event: response must be one of: ${validResponses.join(', ')}`
      }
      try {
        return executeConnector('GOOGLECALENDAR_RSVP_TO_EVENT', { event_id, response }, userId)
      } catch (e) {
        return `rsvp_event error: ${String(e)}`
      }
    }

    case 'manage_calendar_event': {
      if (!userId) return 'Not authenticated'
      const { action, event_id, summary, start_datetime, end_datetime, description, attendees, location } = args as {
        action: string; event_id?: string; summary?: string; start_datetime?: string
        end_datetime?: string; description?: string; attendees?: string; location?: string
      }
      if (!action) return 'manage_calendar_event: action is required'
      try {
        if (action === 'create') {
          if (!summary || !start_datetime || !end_datetime) {
            return 'manage_calendar_event create: summary, start_datetime, and end_datetime are required'
          }
          const createArgs: Record<string, unknown> = { summary, start_datetime, end_datetime }
          if (description) createArgs.description = description
          if (location) createArgs.location = location
          if (attendees) createArgs.attendees = attendees.split(',').map((a: string) => a.trim())
          return executeConnector('GOOGLECALENDAR_CREATE_EVENT', createArgs, userId)
        }
        if (action === 'update') {
          if (!event_id) return 'manage_calendar_event update: event_id is required'
          const updateArgs: Record<string, unknown> = { event_id }
          if (summary) updateArgs.summary = summary
          if (start_datetime) updateArgs.start_datetime = start_datetime
          if (end_datetime) updateArgs.end_datetime = end_datetime
          if (description) updateArgs.description = description
          if (location) updateArgs.location = location
          if (attendees) updateArgs.attendees = attendees.split(',').map((a: string) => a.trim())
          return executeConnector('GOOGLECALENDAR_UPDATE_EVENT', updateArgs, userId)
        }
        if (action === 'delete') {
          if (!event_id) return 'manage_calendar_event delete: event_id is required'
          return executeConnector('GOOGLECALENDAR_DELETE_EVENT', { event_id }, userId)
        }
        return `manage_calendar_event: unknown action "${action}". Valid: create, update, delete`
      } catch (e) {
        return `manage_calendar_event error: ${String(e)}`
      }
    }

    case 'analyze_file': {
      if (!userId) return 'Not authenticated'
      const { url: fileUrl, prompt: filePrompt, file_type } = args as {
        url: string; prompt: string; file_type?: string
      }
      if (!fileUrl || !filePrompt) return 'analyze_file: url and prompt are required'
      try {
        const ext = fileUrl.split('?')[0].split('.').pop()?.toLowerCase() ?? ''
        const typeMap: Record<string, string> = {
          pdf: 'pdf', png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image',
          mp3: 'audio', wav: 'audio', aac: 'audio', m4a: 'audio', ogg: 'audio',
          txt: 'text', csv: 'text', json: 'text', html: 'text', md: 'text',
        }
        const detectedType = file_type ?? typeMap[ext] ?? 'text'
        const apiRes = await fetch(`${baseUrl}/api/analyze-file`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: fileUrl, prompt: filePrompt, type: detectedType, userId }),
        })
        if (!apiRes.ok) {
          if (detectedType === 'text') {
            const raw = await fetch(fileUrl)
            if (!raw.ok) return `analyze_file: fetch failed (${raw.status})`
            const text = (await raw.text()).slice(0, 8000)
            return `File content (${ext}):\n\n${text}`
          }
          return `analyze_file: API error ${apiRes.status} \u2014 ${await apiRes.text()}`
        }
        const result = await apiRes.json() as { analysis?: string; text?: string; error?: string }
        if (result.error) return `analyze_file error: ${result.error}`
        return result.analysis ?? result.text ?? 'No analysis returned'
      } catch (e) {
        return `analyze_file error: ${String(e)}`
      }
    }

    case 'fetch_url': {
      if (!userId) return 'Not authenticated'
      const { url: fetchTarget } = args as { url: string }
      if (!fetchTarget) return 'fetch_url: url is required'
      try {
        const res = await fetch(fetchTarget, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Sparkie/1.0)',
            Accept: 'text/html,application/xhtml+xml,text/plain,*/*',
          },
          signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) return `fetch_url: HTTP ${res.status} \u2014 ${res.statusText}`
        const raw = await res.text()
        const cleaned = raw
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s{3,}/g, '\n\n')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
          .trim()
        const preview = cleaned.slice(0, 6000)
        return `URL: ${fetchTarget}\n\n${preview}${cleaned.length > 6000 ? `\n\n[...${cleaned.length - 6000} more chars truncated]` : ''}`
      } catch (e) {
        return `fetch_url error: ${String(e)}`
      }
    }

    case 'research': {
      if (!userId) return 'Not authenticated'
      const { query: researchQuery, depth = 'quick' } = args as { query: string; depth?: string }
      if (!researchQuery) return 'research: query is required'
      const maxResults = depth === 'deep' ? 8 : 4
      try {
        return executeConnector('TAVILY_SEARCH', {
          query: researchQuery,
          max_results: maxResults,
          search_depth: depth === 'deep' ? 'advanced' : 'basic',
        }, userId)
      } catch (e) {
        return `research error: ${String(e)}`
      }
    }

    default:
      return null
  }
}
