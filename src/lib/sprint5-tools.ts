// Sprint 5 — SureThing Full Parity: Discovery, Topics, Contacts, Execution
// Tool definitions only. Case handlers in sprint5-cases.ts

export const SPARKIE_TOOLS_S5 = [
  // ── Composio Discovery ────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'composio_discover',
      description: 'Discover available Composio tools by searching for a use case. Returns matching tool slugs, descriptions, and input schemas. ALWAYS use this before calling composio_execute when you don\'t know the exact slug. Search before you call — never guess slugs. Examples: "send a discord message", "post a tweet", "list github repos", "get youtube channel info".',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language description of what you want to do, e.g. "post a tweet", "send discord message", "list GitHub pull requests"' },
          app: { type: 'string', description: 'Optional: constrain search to a specific app, e.g. "twitter", "discord", "github", "youtube", "reddit", "instagram", "tiktok"' },
          limit: { type: 'number', description: 'Max tools to return (default 5, max 10)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'composio_execute',
      description: 'Execute any Composio tool by exact slug with its required arguments. Use composio_discover first to find the slug and required fields. Supports all 992+ connected apps. The entity_id is automatically set to sparkie_user_{userId}. Returns the raw tool response. Use for any external app action that doesn\'t have a dedicated Sparkie tool.',
      parameters: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'Exact Composio tool slug, e.g. "TWITTER_CREATE_TWEET", "DISCORD_SEND_CHANNEL_MESSAGE". Get from composio_discover.' },
          args: { type: 'object', description: 'Arguments for the tool. Must match the tool\'s input schema exactly. Get the schema from composio_discover.' },
        },
        required: ['slug', 'args'],
      },
    },
  },
  // ── Topic / Context Clusters ───────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'manage_topic',
      description: 'Create, update, or list semantic context clusters (topics). A topic groups related emails, tasks, and conversations under a named context — like "Sparkie Studio Development", "Music Releases", "Client Project X". Topics persist across sessions and carry a summary and notification preference. Use to organize ongoing work into named contexts that Sparkie can reference and build upon over time.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: '"create" | "update" | "list" | "get" | "archive"' },
          id: { type: 'string', description: 'Topic ID (for update/get/archive)' },
          name: { type: 'string', description: 'Human-readable topic name (for create/update)' },
          fingerprint: { type: 'string', description: 'Short identity string for email routing, e.g. "sparkie-studio deployment" (for create/update)' },
          aliases: { type: 'array', items: { type: 'string' }, description: 'Alternative names/keywords for routing (for create/update)' },
          summary: { type: 'string', description: 'Current status summary (for create/update)' },
          notification_policy: { type: 'string', description: '"immediate" | "defer" | "auto" — when to notify Michael about new signals in this topic (default: auto)' },
          status: { type: 'string', description: '"active" | "archived" (for update/archive)' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'link_to_topic',
      description: 'Associate an email thread, task, or calendar event with a topic. This builds the topic\'s context over time — Sparkie can then retrieve all related signals for a topic. Use after reading an email that belongs to an existing topic, or after creating a task that\'s part of ongoing project work.',
      parameters: {
        type: 'object',
        properties: {
          topic_id: { type: 'string', description: 'Topic ID to link to' },
          source_type: { type: 'string', description: '"email" | "task" | "calendar"' },
          source_id: { type: 'string', description: 'Email thread ID, task ID, or calendar event ID' },
          summary: { type: 'string', description: 'Brief description of what this signal adds to the topic context' },
        },
        required: ['topic_id', 'source_type', 'source_id'],
      },
    },
  },
  // ── Contact Notes ─────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'manage_contact',
      description: 'Save, update, or retrieve per-contact notes. Contact notes store relationship context, CC preferences, response SLAs, and custom notes about specific email contacts. Check contact notes before drafting replies to apply correct CC rules. Use "get" before every email draft to check if a CC preference exists.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: '"save" | "get" | "list" | "delete"' },
          email: { type: 'string', description: 'Contact email address (for save/get/delete)' },
          display_name: { type: 'string', description: 'Contact display name (for save)' },
          cc_preference: { type: 'string', description: 'Who to CC on replies, e.g. "always CC angelique@gmail.com" (for save)' },
          response_sla: { type: 'string', description: 'Expected reply window, e.g. "reply within 24h" (for save)' },
          notes: { type: 'string', description: 'Freeform relationship notes (for save)' },
          priority: { type: 'string', description: '"critical" | "normal" | "low" (for save)' },
        },
        required: ['action'],
      },
    },
  },
  // ── User Memory (Supermemory) ─────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'save_user_memory',
      description: 'Save a memory about Michael (the user) — facts, preferences, behavioral patterns, and rules. Categorize by type: profile (who he is), time_pref (time/schedule preferences), comm_style (communication and tone preferences), work_rule (operational rules for how Sparkie should work). These memories persist forever and are injected into every session.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The memory to save, written as a clear statement, e.g. "Michael prefers dark themes in all UI"' },
          category: { type: 'string', description: '"profile" | "time_pref" | "comm_style" | "work_rule"' },
          source: { type: 'string', description: 'Context for where this was learned (optional), e.g. "user stated in conversation"' },
        },
        required: ['content', 'category'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_user_memory',
      description: 'Search saved memories about Michael by keyword or category. Use to retrieve preferences, rules, and patterns before making decisions. Check memories before drafting emails, planning tasks, or making behavioral decisions.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query, e.g. "email preferences", "coding rules", "schedule"' },
          category: { type: 'string', description: 'Filter by category: "profile" | "time_pref" | "comm_style" | "work_rule" (optional)' },
        },
        required: ['query'],
      },
    },
  },
  // ── Workbench ─────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'run_workbench',
      description: 'Execute Python code in a persistent E2B workbench with pre-loaded helpers. Unlike execute_terminal (raw bash), the workbench provides: run_composio_tool(slug, args) to call any Composio tool, invoke_llm(query) for inline AI analysis, upload_file(path) to upload generated artifacts to CDN. Use for bulk operations, data processing, multi-step scripts, parallel Composio calls, and tasks that need the run_composio_tool helper to loop over app APIs.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Python code to execute. Has access to: run_composio_tool(slug, args), invoke_llm(query), upload_file(path). Standard libraries + pandas, numpy, requests, PIL available.' },
          description: { type: 'string', description: 'What this workbench run is doing (for worklog)' },
        },
        required: ['code'],
      },
    },
  },
  // ── Composio Search (Structured Discovery) ─────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'COMPOSIO_SEARCH_TOOLS',
      description: 'Structured Composio tool discovery — returns tool slugs, schemas, connection state, execution plan, and pitfalls. Unlike composio_discover (natural language search), this returns structured results with connection status and recommended execution path. Use when you need a complete picture of how to execute an external app action including whether it is connected.',
      parameters: {
        type: 'object',
        properties: {
          queries: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                use_case: { type: 'string', description: 'Natural language description of the action needed, e.g. "send a tweet", "create a GitHub issue", "send a Slack message"' },
                known_fields: { type: 'string', description: 'Fields you already know, e.g. "channel_id, text" — Composio will fill in the rest' },
              },
              required: ['use_case'],
            },
            description: 'Array of discovery queries. Each returns a structured result with tools, connection state, execution plan, and pitfalls.',
          },
        },
        required: ['queries'],
      },
    },
  },
  // ── Composio Connection Management ─────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'COMPOSIO_MANAGE_CONNECTIONS',
      description: 'Manage OAuth/API key connections for external apps via Composio. Use to check connection status, initiate OAuth flows, or disconnect an app. After calling connect, present the returned auth URL to the user for approval.',
      parameters: {
        type: 'object',
        properties: {
          toolkit: { type: 'string', description: 'The Composio toolkit name, e.g. "gmail", "github", "twitter", "discord", "slack", "googlecalendar", "linkedin", "instagram", "reddit"' },
          action: { type: 'string', enum: ['connect', 'disconnect', 'status'], description: '"connect" — initiate OAuth or API key flow (returns auth URL); "disconnect" — remove connection; "status" — check if connected' },
        },
        required: ['toolkit', 'action'],
      },
    },
  },
  // ── Topic Search ───────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'topic_search',
      description: 'Search and filter Sparkie topics (context clusters) by name, status, category, or keyword. Topics organize related emails, tasks, and conversations under named contexts. Use this to find or resume work on a specific project/topic, or to look up a topic\'s notification policy and current state.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query — matches against topic name, fingerprint, aliases, and summary' },
          status: { type: 'string', description: 'Filter by status: "active" | "archived" | "all" (default: active)' },
          notification_policy: { type: 'string', description: 'Filter by notification policy: "immediate" | "defer" | "auto"' },
          topic_type: { type: 'string', description: 'Filter by topic type, e.g. "project", "area", "person"' },
          limit: { type: 'number', description: 'Max results to return (default 20, max 50)' },
        },
        required: [],
      },
    },
  },
  // ── Chat History Search ────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'chat_history_search',
      description: 'Search past conversation messages in Sparkie\'s thread store. Use to find earlier context, decisions, or information without re-executing tools. Searches message content with optional filters for role (user/assistant), date range, or tool call ID.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query — matches against message content' },
          role: { type: 'string', description: 'Filter by message role: "user" | "assistant" (default: both)' },
          tool_call_id: { type: 'string', description: 'Filter to messages from a specific tool call session' },
          since_hours: { type: 'number', description: 'Limit to messages within the last N hours (default: all time)' },
          limit: { type: 'number', description: 'Max messages to return (default 20, max 100)' },
        },
        required: ['query'],
      },
    },
  },
  // ── GitHub Actions ────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'github_push_commit',
      description: 'Push one or more file changes as a single atomic commit to a GitHub branch. Creates or updates multiple files in one commit using the Git Data API. Use git_ops(create_branch) first if pushing to a new branch. This is how Sparkie writes code fixes directly to the repo — branch → commit → PR.',
      parameters: {
        type: 'object',
        properties: {
          branch: { type: 'string', description: 'Target branch to push to, e.g. "sparkie/fix-inbox-sweep". Must already exist — use git_ops(create_branch) first.' },
          message: { type: 'string', description: 'Commit message, e.g. "fix: resolve inbox sweep timing issue\\n\\nRoot cause: ..."' },
          files: {
            type: 'array',
            description: 'Files to create or update in this commit.',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Repo-relative file path, e.g. "src/lib/scheduler.ts"' },
                content: { type: 'string', description: 'Complete file content (UTF-8). Replaces the entire file.' },
              },
              required: ['path', 'content'],
            },
          },
        },
        required: ['branch', 'message', 'files'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_open_pr',
      description: 'Open a Pull Request on GitHub from a feature branch into the base branch. Use after github_push_commit. The head branch must have commits ahead of base. Returns the PR URL and number.',
      parameters: {
        type: 'object',
        properties: {
          head: { type: 'string', description: 'Source branch with your changes, e.g. "sparkie/fix-inbox-sweep"' },
          base: { type: 'string', description: 'Target branch to merge into. Defaults to "master".' },
          title: { type: 'string', description: 'PR title, e.g. "fix: resolve inbox sweep timing issue"' },
          body: { type: 'string', description: 'PR description — what changed, why, and how it was tested.' },
          draft: { type: 'boolean', description: 'Open as draft PR so Michael can review before merging (default: true for Sparkie-authored PRs).' },
        },
        required: ['head', 'title'],
      },
    },
  },
]
