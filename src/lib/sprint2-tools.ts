// Sprint 2 — P1 Tool Definitions
// Imported and spread into SPARKIE_TOOLS in route.ts

export const SPARKIE_TOOLS_S2 = [
  {
    type: 'function',
    function: {
      name: 'get_schema',
      description: 'Read the schema of one or more database tables — column names, types, and constraints. Use before write_database to verify columns exist. Returns table definitions from information_schema.',
      parameters: {
        type: 'object',
        properties: {
          tables: { type: 'string', description: 'Comma-separated table names to inspect, e.g. "sparkie_tasks,sparkie_worklog". Leave empty to list all tables.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_deployment_history',
      description: 'List recent DigitalOcean App Platform deployments for Sparkie Studio — phase, cause, timing, and ID. Use to find the last-known-good deployment ID before a rollback, or to audit deploy frequency.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of recent deployments to return (default 5, max 20)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_github',
      description: 'Search for files or code inside the Sparkie Studio GitHub repository. Use to locate where a function is defined, find files by name pattern, or check if a module exists before patching.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query — filename, function name, or code snippet to find' },
          path: { type: 'string', description: 'Optional: restrict search to a subdirectory, e.g. "src/lib" or "src/app/api"' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_calendar_event',
      description: "Create a new event on Michael's Google Calendar. HITL-gated — queues for approval before creating. Provide title, start/end datetime (ISO 8601), and optional description or attendees.",
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Event title' },
          start_datetime: { type: 'string', description: 'Start time in ISO 8601 format, e.g. "2026-03-10T14:00:00-05:00"' },
          end_datetime: { type: 'string', description: 'End time in ISO 8601 format' },
          description: { type: 'string', description: 'Optional event description or agenda' },
          attendees: { type: 'string', description: 'Optional comma-separated email addresses of attendees' },
          location: { type: 'string', description: 'Optional event location or video call link' },
        },
        required: ['summary', 'start_datetime', 'end_datetime'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'transcribe_audio',
      description: 'Transcribe audio from a URL using Deepgram nova-2. Returns a text transcript. Use for voice memos, recordings, or any audio file accessible via URL.',
      parameters: {
        type: 'object',
        properties: {
          audio_url: { type: 'string', description: 'Publicly accessible URL of the audio file (MP3, WAV, M4A, etc.)' },
          language: { type: 'string', description: 'Optional language code, e.g. "en" (default), "es", "fr"' },
        },
        required: ['audio_url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'text_to_speech',
      description: "Convert text to speech using MiniMax speech-02. Returns a playable audio URL. Use to voice Sparkie's responses, narrate content, or generate audio for any purpose.",
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to synthesize (max 2000 characters)' },
          voice_id: { type: 'string', description: 'Optional MiniMax voice ID (default: English_Graceful_Lady). Other options: English_expressive_narrator, English_Trustworthy_Man' },
        },
        required: ['text'],
      },
    },
  },
] as const
