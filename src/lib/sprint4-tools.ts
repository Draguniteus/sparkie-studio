// Sprint 4 — P3 + SureThing Parity Tool Definitions

export const SPARKIE_TOOLS_S4 = [
  {
    type: 'function',
    function: {
      name: 'read_email_thread',
      description: 'Read a full Gmail email thread by thread ID. Returns all messages in the thread with sender, date, and body. Use when Sparkie needs to understand a conversation before replying or summarizing.',
      parameters: {
        type: 'object',
        properties: {
          thread_id: { type: 'string', description: 'Gmail thread ID to read' },
        },
        required: ['thread_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_email',
      description: 'Perform email management actions: mark as read/unread, archive, label, delete, or search emails. Use to organize Michael\'s inbox.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: '"mark_read" | "mark_unread" | "archive" | "label" | "delete" | "search"' },
          message_id: { type: 'string', description: 'Gmail message ID (for mark_read, mark_unread, archive, label, delete)' },
          label: { type: 'string', description: 'Label name to apply (for label action)' },
          query: { type: 'string', description: 'Gmail search query (for search action), e.g. "from:digitalocean is:unread"' },
          max_results: { type: 'number', description: 'Max results to return for search (default 10)' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rsvp_event',
      description: 'RSVP to a Google Calendar event — accept, decline, or mark tentative. Use when Michael asks to accept or decline a meeting invite.',
      parameters: {
        type: 'object',
        properties: {
          event_id: { type: 'string', description: 'Google Calendar event ID' },
          response: { type: 'string', description: '"accepted" | "declined" | "tentative"' },
        },
        required: ['event_id', 'response'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_calendar_event',
      description: 'Create, update, or delete a Google Calendar event. Use to schedule meetings, update event details, or remove events.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: '"create" | "update" | "delete"' },
          event_id: { type: 'string', description: 'Event ID (required for update/delete)' },
          summary: { type: 'string', description: 'Event title' },
          start_datetime: { type: 'string', description: 'Start time ISO 8601, e.g. "2026-03-10T10:00:00-05:00"' },
          end_datetime: { type: 'string', description: 'End time ISO 8601' },
          description: { type: 'string', description: 'Event description/notes' },
          attendees: { type: 'string', description: 'Comma-separated attendee email addresses' },
          location: { type: 'string', description: 'Event location' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_file',
      description: 'Analyze a file from a URL: summarize documents, extract data from PDFs, describe images, or transcribe audio. Fetches the file and uses AI to analyze it. Supports PDF, images (JPG/PNG), audio (MP3/WAV), and text files.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Direct URL to the file to analyze' },
          prompt: { type: 'string', description: 'What to extract or analyze, e.g. "Summarize this PDF", "What is shown in this image?", "Transcribe this audio"' },
          file_type: { type: 'string', description: 'Optional: "pdf" | "image" | "audio" | "text" (auto-detected if omitted)' },
        },
        required: ['url', 'prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetch and extract readable text content from any URL. Use to read web pages, documentation, articles, or any public URL without needing a browser session.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch and read' },
          extract_markdown: { type: 'boolean', description: 'Return content as markdown (default true)' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'research',
      description: 'Perform deep web research on a topic by searching multiple sources and synthesizing results. Use when Michael asks to "research", "look into", or "find out about" something that requires multiple sources.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The research question or topic to investigate' },
          depth: { type: 'string', description: '"quick" (3 sources, fast) or "deep" (8+ sources, comprehensive). Default: "quick"' },
        },
        required: ['query'],
      },
    },
  },
] as const
