// Sprint 5 — SureThing Full Parity: Case Handlers
// composio_discover, composio_execute, manage_topic, link_to_topic,
// manage_contact, save_user_memory, search_user_memory, run_workbench

import { query } from '@/lib/db'

export async function executeSprint5Tool(
  name: string,
  args: Record<string, unknown>,
  userId: string | null,
  baseUrl: string,
  executeConnector: (slug: string, args: Record<string, unknown>, uid: string) => Promise<string>,
  composioApiKey: string
): Promise<string | null> {

  const COMPOSIO_BASE = 'https://backend.composio.dev/api/v3'

  switch (name) {

    // ── composio_discover ───────────────────────────────────────────────────
    case 'composio_discover': {
      const { query: q, app, limit = 5 } = args as { query: string; app?: string; limit?: number }
      if (!q) return 'composio_discover: query is required'
      try {
        const params = new URLSearchParams({ q, limit: String(Math.min(Number(limit), 10)) })
        if (app) params.set('app', app)
        const res = await fetch(`${COMPOSIO_BASE}/tools/search?${params}`, {
          headers: { 'x-api-key': composioApiKey, 'Content-Type': 'application/json' },
        })
        if (!res.ok) return `composio_discover: API error ${res.status}`
        const data = await res.json() as { items?: Array<{ slug: string; description: string; app: string }> }
        const items = (data.items ?? []).slice(0, Number(limit))
        if (items.length === 0) return `composio_discover: No tools found for "${q}". Try a different description.`
        const lines = items.map(t => `• ${t.slug} (${t.app}): ${t.description}`)
        return `Found ${items.length} tools for "${q}":\n${lines.join('\n')}\n\nUse composio_execute with the exact slug.`
      } catch (e) {
        return `composio_discover failed: ${(e as Error).message}`
      }
    }

    // ── composio_execute ────────────────────────────────────────────────────
    case 'composio_execute': {
      if (!userId) return 'Not authenticated'
      const { slug, args: toolArgs } = args as { slug: string; args: Record<string, unknown> }
      if (!slug) return 'composio_execute: slug is required'
      if (!toolArgs || typeof toolArgs !== 'object') return 'composio_execute: args must be an object'
      try {
        return await executeConnector(slug, toolArgs, userId)
      } catch (e) {
        return `composio_execute(${slug}) failed: ${(e as Error).message}`
      }
    }

    // ── manage_topic ────────────────────────────────────────────────────────
    case 'manage_topic': {
      if (!userId) return 'Not authenticated'
      const { action, id, name: topicName, fingerprint, aliases, summary, notification_policy = 'auto', status } =
        args as { action: string; id?: string; name?: string; fingerprint?: string; aliases?: string[]; summary?: string; notification_policy?: string; status?: string }

      // Ensure table exists
      await query(`CREATE TABLE IF NOT EXISTS sparkie_topics (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        fingerprint TEXT,
        aliases JSONB DEFAULT '[]',
        summary TEXT DEFAULT '',
        notification_policy TEXT DEFAULT 'auto',
        status TEXT DEFAULT 'active',
        total_threads INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`).catch(() => {})

      if (action === 'create') {
        if (!topicName) return 'manage_topic create: name is required'
        const topicId = `topic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        await query(
          `INSERT INTO sparkie_topics (id, user_id, name, fingerprint, aliases, summary, notification_policy)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [topicId, userId, topicName, fingerprint ?? '', JSON.stringify(aliases ?? []), summary ?? '', notification_policy]
        )
        return `Topic created: "${topicName}" (id: ${topicId})`
      }

      if (action === 'update') {
        if (!id) return 'manage_topic update: id is required'
        const fields: string[] = []
        const vals: unknown[] = []
        let n = 1
        if (topicName) { fields.push(`name=$${n++}`); vals.push(topicName) }
        if (fingerprint !== undefined) { fields.push(`fingerprint=$${n++}`); vals.push(fingerprint) }
        if (aliases !== undefined) { fields.push(`aliases=$${n++}`); vals.push(JSON.stringify(aliases)) }
        if (summary !== undefined) { fields.push(`summary=$${n++}`); vals.push(summary) }
        if (notification_policy) { fields.push(`notification_policy=$${n++}`); vals.push(notification_policy) }
        if (status) { fields.push(`status=$${n++}`); vals.push(status) }
        if (fields.length === 0) return 'manage_topic update: no fields to update'
        fields.push(`updated_at=NOW()`)
        vals.push(id, userId)
        await query(`UPDATE sparkie_topics SET ${fields.join(', ')} WHERE id=$${n++} AND user_id=$${n}`, vals)
        return `Topic ${id} updated`
      }

      if (action === 'list') {
        const rows = await query(
          `SELECT id, name, fingerprint, summary, status, notification_policy, total_threads, updated_at
           FROM sparkie_topics WHERE user_id=$1 AND status='active' ORDER BY updated_at DESC LIMIT 30`,
          [userId]
        )
        if (!rows.rows.length) return 'No active topics yet. Create one with manage_topic action:"create"'
        const lines = rows.rows.map((r: Record<string, string>) => `• [${r.id}] ${r.name} — ${r.summary || 'no summary'} (policy: ${r.notification_policy})`)
        return `Active topics (${rows.rows.length}):\n${lines.join('\n')}`
      }

      if (action === 'get') {
        if (!id) return 'manage_topic get: id is required'
        const rows = await query(`SELECT * FROM sparkie_topics WHERE id=$1 AND user_id=$2`, [id, userId])
        if (!rows.rows.length) return `Topic ${id} not found`
        return JSON.stringify(rows.rows[0], null, 2)
      }

      if (action === 'archive') {
        if (!id) return 'manage_topic archive: id is required'
        await query(`UPDATE sparkie_topics SET status='archived', updated_at=NOW() WHERE id=$1 AND user_id=$2`, [id, userId])
        return `Topic ${id} archived`
      }

      return `manage_topic: unknown action "${action}"`
    }

    // ── link_to_topic ───────────────────────────────────────────────────────
    case 'link_to_topic': {
      if (!userId) return 'Not authenticated'
      const { topic_id, source_type, source_id, summary: linkSummary = '' } =
        args as { topic_id: string; source_type: string; source_id: string; summary?: string }
      if (!topic_id || !source_type || !source_id) return 'link_to_topic: topic_id, source_type, and source_id are required'

      await query(`CREATE TABLE IF NOT EXISTS sparkie_topic_links (
        id SERIAL PRIMARY KEY,
        topic_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        summary TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(topic_id, source_type, source_id)
      )`).catch(() => {})

      await query(
        `INSERT INTO sparkie_topic_links (topic_id, user_id, source_type, source_id, summary)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (topic_id, source_type, source_id) DO UPDATE SET summary=$5`,
        [topic_id, userId, source_type, source_id, linkSummary]
      )
      // Bump topic thread count
      await query(
        `UPDATE sparkie_topics SET total_threads = total_threads + 1, updated_at=NOW() WHERE id=$1`,
        [topic_id]
      ).catch(() => {})

      return `Linked ${source_type} ${source_id} to topic ${topic_id}`
    }

    // ── manage_contact ──────────────────────────────────────────────────────
    case 'manage_contact': {
      if (!userId) return 'Not authenticated'
      const { action, email, display_name, cc_preference, response_sla, notes, priority = 'normal' } =
        args as { action: string; email?: string; display_name?: string; cc_preference?: string; response_sla?: string; notes?: string; priority?: string }

      await query(`CREATE TABLE IF NOT EXISTS sparkie_contacts (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        display_name TEXT,
        cc_preference TEXT,
        response_sla TEXT,
        notes TEXT,
        priority TEXT DEFAULT 'normal',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, email)
      )`).catch(() => {})

      if (action === 'save') {
        if (!email) return 'manage_contact save: email is required'
        await query(
          `INSERT INTO sparkie_contacts (user_id, email, display_name, cc_preference, response_sla, notes, priority)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (user_id, email) DO UPDATE SET
             display_name=COALESCE($3, sparkie_contacts.display_name),
             cc_preference=COALESCE($4, sparkie_contacts.cc_preference),
             response_sla=COALESCE($5, sparkie_contacts.response_sla),
             notes=COALESCE($6, sparkie_contacts.notes),
             priority=COALESCE($7, sparkie_contacts.priority),
             updated_at=NOW()`,
          [userId, email, display_name ?? null, cc_preference ?? null, response_sla ?? null, notes ?? null, priority]
        )
        return `Contact saved: ${email}${cc_preference ? ` (CC: ${cc_preference})` : ''}`
      }

      if (action === 'get') {
        if (!email) return 'manage_contact get: email is required'
        const rows = await query(`SELECT * FROM sparkie_contacts WHERE user_id=$1 AND email=$2`, [userId, email])
        if (!rows.rows.length) return `No contact notes for ${email}`
        const c = rows.rows[0] as Record<string, string>
        const parts = [`Contact: ${c.email}`]
        if (c.display_name) parts.push(`Name: ${c.display_name}`)
        if (c.cc_preference) parts.push(`CC rule: ${c.cc_preference}`)
        if (c.response_sla) parts.push(`SLA: ${c.response_sla}`)
        if (c.notes) parts.push(`Notes: ${c.notes}`)
        if (c.priority) parts.push(`Priority: ${c.priority}`)
        return parts.join('\n')
      }

      if (action === 'list') {
        const rows = await query(`SELECT * FROM sparkie_contacts WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 50`, [userId])
        if (!rows.rows.length) return 'No contacts saved yet'
        const lines = (rows.rows as Array<Record<string, string>>).map(c =>
          `• ${c.email}${c.display_name ? ` (${c.display_name})` : ''}${c.cc_preference ? ` — CC: ${c.cc_preference}` : ''}${c.priority !== 'normal' ? ` [${c.priority}]` : ''}`
        )
        return `Contacts (${rows.rows.length}):\n${lines.join('\n')}`
      }

      if (action === 'delete') {
        if (!email) return 'manage_contact delete: email is required'
        await query(`DELETE FROM sparkie_contacts WHERE user_id=$1 AND email=$2`, [userId, email])
        return `Contact ${email} deleted`
      }

      return `manage_contact: unknown action "${action}"`
    }

    // ── save_user_memory ────────────────────────────────────────────────────
    case 'save_user_memory': {
      if (!userId) return 'Not authenticated'
      const { content, category = 'profile', source = 'sparkie' } =
        args as { content: string; category?: string; source?: string }
      if (!content) return 'save_user_memory: content is required'

      // Save to user_memories table with category
      await query(`CREATE TABLE IF NOT EXISTS user_memories (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'profile',
        source TEXT DEFAULT 'sparkie',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`).catch(() => {})
      await query(`ALTER TABLE user_memories ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'profile'`).catch(() => {})

      await query(
        `INSERT INTO user_memories (user_id, content, category, source) VALUES ($1, $2, $3, $4)`,
        [userId, content, category, source]
      )
      return `Memory saved [${category}]: "${content.slice(0, 80)}${content.length > 80 ? '...' : ''}"`
    }

    // ── search_user_memory ──────────────────────────────────────────────────
    case 'search_user_memory': {
      if (!userId) return 'Not authenticated'
      const { query: searchQ, category } = args as { query: string; category?: string }
      if (!searchQ) return 'search_user_memory: query is required'
      await query(`ALTER TABLE user_memories ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'profile'`).catch(() => {})

      let sql = `SELECT id, content, category, source, created_at FROM user_memories WHERE user_id=$1`
      const vals: unknown[] = [userId]
      let n = 2
      if (category) { sql += ` AND category=$${n++}`; vals.push(category) }
      sql += ` AND content ILIKE $${n++}`; vals.push(`%${searchQ}%`)
      sql += ' ORDER BY created_at DESC LIMIT 20'

      const rows = await query(sql, vals)
      if (!rows.rows.length) return `No memories found for "${searchQ}"${category ? ` in category ${category}` : ''}`
      const lines = (rows.rows as Array<Record<string, string>>).map(m =>
        `• [${m.category}] ${m.content} (${new Date(m.created_at).toLocaleDateString()})`
      )
      return `Found ${rows.rows.length} memories:\n${lines.join('\n')}`
    }

    // ── run_workbench ───────────────────────────────────────────────────────
    case 'run_workbench': {
      if (!userId) return 'Not authenticated'
      const { code, description = 'workbench run' } = args as { code: string; description?: string }
      if (!code) return 'run_workbench: code is required'

      // Inject helper preamble then run in E2B via /api/execute
      const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY ?? ''
      const ENTITY_ID = `sparkie_user_${userId}`

      // Build preamble as string concat to avoid TS template literal conflicts
      const helperPreamble = [
        'import json, urllib.request, urllib.error',
        '',
        'COMPOSIO_API_KEY = "' + COMPOSIO_API_KEY + '"',
        'ENTITY_ID = "' + ENTITY_ID + '"',
        'COMPOSIO_BASE = "https://backend.composio.dev/api/v3"',
        '',
        'def run_composio_tool(tool_slug, arguments):',
        '    url = COMPOSIO_BASE + "/tools/execute/" + tool_slug',
        '    body = json.dumps({"entity_id": ENTITY_ID, "arguments": arguments}).encode()',
        '    import urllib.request as _ur',
        '    req = _ur.Request(url, data=body, method="POST",',
        '        headers={"x-api-key": COMPOSIO_API_KEY, "Content-Type": "application/json"})',
        '    try:',
        '        with _ur.urlopen(req, timeout=30) as r:',
        '            return json.loads(r.read())',
        '    except Exception as e:',
        '        return {"error": str(e)}',
        '',
        'def invoke_llm(q):',
        '    return "[LLM: " + str(q)[:200] + "]"',
        '',
        'def upload_file(path):',
        '    return path',
        '',
      ].join('\n')
      const fullCode = helperPreamble + '\n' + code

      // POST to /api/execute (E2B sandbox)
      try {
        const execRes = await fetch(`${baseUrl}/api/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': userId ?? '' },
          body: JSON.stringify({ code: fullCode, language: 'python' }),
        })
        if (!execRes.ok) {
          const errText = await execRes.text()
          return `run_workbench failed (${execRes.status}): ${errText.slice(0, 300)}`
        }
        const result = await execRes.json() as { stdout?: string; stderr?: string; error?: string; output?: string }
        const out = result.stdout ?? result.output ?? result.error ?? JSON.stringify(result)
        if (result.stderr && result.stderr.trim()) {
          return `Workbench output:\n${out}\n\nStderr:\n${result.stderr.slice(0, 300)}`
        }
        return `Workbench output:\n${out}`
      } catch (e) {
        return `run_workbench error: ${(e as Error).message}`
      }
    }

    // ── github_push_commit ───────────────────────────────────────────────────
    case 'github_push_commit': {
      const { branch, message, files: filesToCommit } = args as {
        branch: string
        message: string
        files: Array<{ path: string; content: string }>
      }
      if (!branch || !message || !filesToCommit?.length) {
        return 'github_push_commit: branch, message, and at least one file are required'
      }

      const ghToken = process.env.GITHUB_TOKEN
      if (!ghToken) return 'github_push_commit: GITHUB_TOKEN not configured'

      const REPO_OWNER = 'Draguniteus'
      const REPO_NAME  = 'sparkie-studio'
      const apiBase    = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`
      const headers    = {
        Authorization: `Bearer ${ghToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      }

      try {
        // 1. Get current branch HEAD commit SHA
        const refRes = await fetch(`${apiBase}/git/ref/heads/${branch}`, { headers })
        if (!refRes.ok) return `github_push_commit: branch "${branch}" not found (${refRes.status}) — use git_ops(create_branch) first`
        const refData = await refRes.json() as { object?: { sha?: string } }
        const headSha = refData.object?.sha
        if (!headSha) return 'github_push_commit: could not resolve HEAD SHA'

        // 2. Get the tree SHA from HEAD commit
        const commitRes = await fetch(`${apiBase}/git/commits/${headSha}`, { headers })
        if (!commitRes.ok) return `github_push_commit: could not fetch HEAD commit (${commitRes.status})`
        const commitData = await commitRes.json() as { tree?: { sha?: string } }
        const baseTreeSha = commitData.tree?.sha
        if (!baseTreeSha) return 'github_push_commit: could not resolve base tree SHA'

        // 3. Create blobs for each file
        const treeEntries: Array<{ path: string; mode: string; type: string; sha: string }> = []
        for (const file of filesToCommit) {
          const blobRes = await fetch(`${apiBase}/git/blobs`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ content: file.content, encoding: 'utf-8' }),
          })
          if (!blobRes.ok) return `github_push_commit: failed to create blob for ${file.path} (${blobRes.status})`
          const blobData = await blobRes.json() as { sha?: string }
          if (!blobData.sha) return `github_push_commit: no SHA returned for blob ${file.path}`
          treeEntries.push({ path: file.path, mode: '100644', type: 'blob', sha: blobData.sha })
        }

        // 4. Create a new tree on top of base tree
        const treeRes = await fetch(`${apiBase}/git/trees`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
        })
        if (!treeRes.ok) return `github_push_commit: failed to create tree (${treeRes.status}): ${await treeRes.text()}`
        const treeData = await treeRes.json() as { sha?: string }
        if (!treeData.sha) return 'github_push_commit: no SHA returned for new tree'

        // 5. Create commit
        const newCommitRes = await fetch(`${apiBase}/git/commits`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message,
            tree: treeData.sha,
            parents: [headSha],
            author: { name: 'Sparkie', email: 'sparkie@surething.io', date: new Date().toISOString() },
          }),
        })
        if (!newCommitRes.ok) return `github_push_commit: failed to create commit (${newCommitRes.status}): ${await newCommitRes.text()}`
        const newCommitData = await newCommitRes.json() as { sha?: string }
        if (!newCommitData.sha) return 'github_push_commit: no SHA returned for new commit'

        // 6. Update branch reference to new commit
        const updateRefRes = await fetch(`${apiBase}/git/refs/heads/${branch}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ sha: newCommitData.sha }),
        })
        if (!updateRefRes.ok) return `github_push_commit: failed to update ref (${updateRefRes.status}): ${await updateRefRes.text()}`

        const shortSha = newCommitData.sha.slice(0, 8)
        const fileList = filesToCommit.map(f => `  • ${f.path}`).join('\n')
        return `✅ Committed ${filesToCommit.length} file(s) to "${branch}" @ ${shortSha}\n${fileList}\n\nCommit: https://github.com/${REPO_OWNER}/${REPO_NAME}/commit/${newCommitData.sha}`
      } catch (e) {
        return `github_push_commit error: ${(e as Error).message}`
      }
    }

    // ── composio_get_tool_schemas ─────────────────────────────────────────────
    case 'composio_get_tool_schemas': {
      if (!userId) return 'Not authenticated'
      const { tool_slugs } = args as { tool_slugs: string[] }
      if (!tool_slugs || !Array.isArray(tool_slugs)) return 'composio_get_tool_schemas: tool_slugs array is required'
      if (tool_slugs.length > 20) return 'composio_get_tool_schemas: max 20 slugs per call'
      try {
        const results: Array<{ slug: string; schema?: Record<string, unknown>; error?: string }> = []
        for (const slug of tool_slugs) {
          const res = await fetch(`${COMPOSIO_BASE}/tools/info?tool_slug=${encodeURIComponent(slug)}`, {
            headers: { 'x-api-key': composioApiKey, 'Content-Type': 'application/json' },
          })
          if (!res.ok) {
            results.push({ slug, error: `HTTP ${res.status}` })
            continue
          }
          const data = await res.json() as Record<string, unknown>
          results.push({ slug, schema: data })
        }
        const lines = results.map(r => {
          if (r.error) return `${r.slug}: ERROR — ${r.error}`
          const s = r.schema as Record<string, unknown>
          const inputSchema = s.input_schema as Record<string, unknown> | undefined
          const name = String(s.name ?? r.slug)
          const desc = String(s.description ?? '')
          const params = inputSchema ? JSON.stringify(inputSchema, null, 2) : 'no schema found'
          return `${name}: ${desc}\nInput schema:\n${params}`
        })
        return `Tool schemas (${results.length}):\n\n${lines.join('\n\n')}`
      } catch (e) {
        return `composio_get_tool_schemas error: ${(e as Error).message}`
      }
    }

    // ── composio_multi_execute_tool ──────────────────────────────────────────
    case 'composio_multi_execute_tool': {
      if (!userId) return 'Not authenticated'
      const { tools } = args as {
        tools: Array<{ tool_slug: string; arguments: Record<string, unknown> }>
      }
      if (!tools || !Array.isArray(tools)) return 'composio_multi_execute_tool: tools array is required'
      if (tools.length > 50) return 'composio_multi_execute_tool: max 50 tools per call'
      const entity_id = `sparkie_user_${userId}`
      const results: Array<{ slug: string; success: boolean; result?: string; error?: string }> = []
      // Execute up to 10 in parallel (Composio rate limit)
      const batchSize = 10
      for (let i = 0; i < tools.length; i += batchSize) {
        const batch = tools.slice(i, i + batchSize)
        const batchResults = await Promise.all(
          batch.map(async (t) => {
            try {
              const res = await fetch(`${COMPOSIO_BASE}/tools/execute/${t.tool_slug}`, {
                method: 'POST',
                headers: { 'x-api-key': composioApiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({ entity_id, arguments: t.arguments }),
                signal: AbortSignal.timeout(30000),
              })
              if (!res.ok) {
                const errText = await res.text()
                return { slug: t.tool_slug, success: false, error: `HTTP ${res.status}: ${errText.slice(0, 100)}` }
              }
              const data = await res.json() as Record<string, unknown>
              return { slug: t.tool_slug, success: true, result: JSON.stringify(data).slice(0, 500) }
            } catch (e) {
              return { slug: t.tool_slug, success: false, error: String(e) }
            }
          })
        )
        results.push(...batchResults)
      }
      const succeeded = results.filter(r => r.success).length
      const failed = results.filter(r => !r.success).length
      const lines = results.map(r =>
        r.success
          ? `✅ ${r.slug}: ${r.result}`
          : `❌ ${r.slug}: ${r.error}`
      )
      return `Multi-execute complete: ${succeeded}/${tools.length} succeeded\n${lines.join('\n')}`
    }

    // ── github_open_pr ───────────────────────────────────────────────────────
    case 'github_open_pr': {
      const { head, base = 'master', title, body = '', draft = true } = args as {
        head: string
        base?: string
        title: string
        body?: string
        draft?: boolean
      }
      if (!head || !title) return 'github_open_pr: head branch and title are required'

      const ghToken = process.env.GITHUB_TOKEN
      if (!ghToken) return 'github_open_pr: GITHUB_TOKEN not configured'

      const REPO_OWNER = 'Draguniteus'
      const REPO_NAME  = 'sparkie-studio'
      const headers    = {
        Authorization: `Bearer ${ghToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      }

      try {
        const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ title, head, base, body, draft }),
        })
        if (!res.ok) {
          const errText = await res.text()
          return `github_open_pr: failed (${res.status}): ${errText.slice(0, 400)}`
        }
        const pr = await res.json() as { number?: number; html_url?: string; state?: string }
        return `✅ PR #${pr.number} opened${draft ? ' (draft)' : ''}: ${pr.html_url}\n"${title}" — ${head} → ${base}`
      } catch (e) {
        return `github_open_pr error: ${(e as Error).message}`
      }
    }

    // ── COMPOSIO_SEARCH_TOOLS ─────────────────────────────────────────────────
    case 'COMPOSIO_SEARCH_TOOLS': {
      const { queries } = args as {
        queries: Array<{ use_case: string; known_fields?: string }>
      }
      if (!queries || !Array.isArray(queries)) return 'COMPOSIO_SEARCH_TOOLS: queries array is required'
      if (queries.length > 10) return 'COMPOSIO_SEARCH_TOOLS: max 10 queries per call'
      try {
        const results: Array<{
          query: string; tools: Array<{ slug: string; description: string; app: string; input_schema?: Record<string, unknown> }>
          connection_state: string; execution_plan: string; pitfalls: string[]
        }> = []
        for (const q of queries) {
          const params = new URLSearchParams({ q: q.use_case, limit: '8' })
          if (q.known_fields) params.set('fields', q.known_fields)
          const res = await fetch(`${COMPOSIO_BASE}/tools/search?${params}`, {
            headers: { 'x-api-key': composioApiKey, 'Content-Type': 'application/json' },
          })
          if (!res.ok) {
            results.push({ query: q.use_case, tools: [], connection_state: 'error', execution_plan: '', pitfalls: [`HTTP ${res.status}`] })
            continue
          }
          const data = await res.json() as { items?: Array<{ slug: string; description: string; app: string }> }
          const items = data.items ?? []
          // Check connection state for each app
          const apps = [...new Set(items.map(t => t.app.toLowerCase()))]
          const connectedApps = new Set<string>()
          for (const app of apps.slice(0, 5)) {
            const connRes = await fetch(`${COMPOSIO_BASE}/connected_accounts?user_id=${encodeURIComponent(`sparkie_user_${userId}`)}&status=ACTIVE&limit=50`, {
              headers: { 'x-api-key': composioApiKey },
            })
            if (connRes.ok) {
              const connData = await connRes.json() as { items?: Array<{ toolkit?: { slug?: string } }> }
              connData.items?.forEach(c => { if (c.toolkit?.slug) connectedApps.add(c.toolkit.slug.toLowerCase()) })
            }
          }
          const isConnected = (app: string) => connectedApps.has(app.toLowerCase())
          const connection_state = items.length > 0 ? (isConnected(items[0].app) ? 'CONNECTED' : 'NOT_CONNECTED') : 'NO_TOOLS_FOUND'
          const pitfalls = items.length === 0
            ? ['No tools found for this use case — try different search terms']
            : !isConnected(items[0].app)
              ? [`App "${items[0].app}" is not connected. Use COMPOSIO_MANAGE_CONNECTIONS to connect first.`]
              : []
          const execution_plan = items.length > 0
            ? `1. COMPOSIO_SEARCH_TOOLS confirmed "${items[0].app}" is ${isConnected(items[0].app) ? 'connected' : 'not connected'}. ` +
              (isConnected(items[0].app)
                ? `2. Use ${items[0].slug} with schema-compliant arguments.`
                : `2. Connect via COMPOSIO_MANAGE_CONNECTIONS first.`)
            : 'No execution plan — no tools found.'
          results.push({
            query: q.use_case,
            tools: items.map(t => ({ slug: t.slug, description: t.description, app: t.app })),
            connection_state,
            execution_plan,
            pitfalls,
          })
        }
        const lines = results.map(r =>
          `Query: "${r.query}"\n` +
          `Connection: ${r.connection_state}\n` +
          `Tools (${r.tools.length}): ${r.tools.map(t => `${t.slug} (${t.app})`).join(', ')}\n` +
          (r.pitfalls.length > 0 ? `Pitfalls: ${r.pitfalls.join('; ')}\n` : '') +
          `Plan: ${r.execution_plan}`
        )
        return `COMPOSIO_SEARCH_TOOLS results:\n\n${lines.join('\n\n')}`
      } catch (e) {
        return `COMPOSIO_SEARCH_TOOLS error: ${(e as Error).message}`
      }
    }

    // ── COMPOSIO_MANAGE_CONNECTIONS ──────────────────────────────────────────
    case 'COMPOSIO_MANAGE_CONNECTIONS': {
      if (!userId) return 'Not authenticated'
      const { toolkit, action } = args as { toolkit: string; action: string }
      if (!toolkit || !action) return 'COMPOSIO_MANAGE_CONNECTIONS: toolkit and action are required'
      try {
        if (action === 'status') {
          // Check all connections for this entity
          const connRes = await fetch(`${COMPOSIO_BASE}/connected_accounts?user_id=${encodeURIComponent(`sparkie_user_${userId}`)}&status=ACTIVE&limit=50`, {
            headers: { 'x-api-key': composioApiKey },
          })
          if (!connRes.ok) return `COMPOSIO_MANAGE_CONNECTIONS status: API error ${connRes.status}`
          const connData = await connRes.json() as { items?: Array<{ id: string; toolkit?: { slug: string; name: string } }> }
          const all = connData.items ?? []
          const connected = all.filter(c => toolkit.toLowerCase() === 'all' || c.toolkit?.slug?.toLowerCase().includes(toolkit.toLowerCase()))
          if (toolkit.toLowerCase() !== 'all') {
            const isConnected = all.some(c => c.toolkit?.slug?.toLowerCase().includes(toolkit.toLowerCase()))
            if (!isConnected) return `COMPOSIO_MANAGE_CONNECTIONS: "${toolkit}" is NOT connected. Use action "connect" to initiate OAuth.`
            const entry = all.find(c => c.toolkit?.slug?.toLowerCase().includes(toolkit.toLowerCase()))
            return `COMPOSIO_MANAGE_CONNECTIONS: "${toolkit}" is CONNECTED (ID: ${entry?.id}). Use action "disconnect" to remove.`
          }
          const lines = all.map(c => `• ${c.toolkit?.name ?? c.toolkit?.slug} [${c.toolkit?.slug}] — ${c.id}`)
          return `Connected apps (${all.length}):\n${lines.join('\n') || 'None'}`
        }
        if (action === 'disconnect') {
          // Find connection ID for toolkit
          const connRes = await fetch(`${COMPOSIO_BASE}/connected_accounts?user_id=${encodeURIComponent(`sparkie_user_${userId}`)}&status=ACTIVE&limit=50`, {
            headers: { 'x-api-key': composioApiKey },
          })
          if (!connRes.ok) return `COMPOSIO_MANAGE_CONNECTIONS disconnect: API error ${connRes.status}`
          const connData = await connRes.json() as { items?: Array<{ id: string; toolkit?: { slug: string } }> }
          const entry = (connData.items ?? []).find(c => c.toolkit?.slug?.toLowerCase().includes(toolkit.toLowerCase()))
          if (!entry) return `COMPOSIO_MANAGE_CONNECTIONS: "${toolkit}" is not currently connected.`
          const delRes = await fetch(`${COMPOSIO_BASE}/connected_accounts/${entry.id}`, {
            method: 'DELETE',
            headers: { 'x-api-key': composioApiKey },
          })
          if (!delRes.ok) return `COMPOSIO_MANAGE_CONNECTIONS disconnect failed (${delRes.status})`
          return `✅ Disconnected "${toolkit}" (${entry.id}). To reconnect, use action "connect".`
        }
        if (action === 'connect') {
          // Initiate OAuth — Composio returns an auth URL to redirect the user
          const connRes = await fetch(`${COMPOSIO_BASE}/connected_accounts`, {
            method: 'POST',
            headers: { 'x-api-key': composioApiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ entity_id: `sparkie_user_${userId}`, toolkit: toolkit.toUpperCase() }),
          })
          if (!connRes.ok) {
            const errText = await connRes.text()
            return `COMPOSIO_MANAGE_CONNECTIONS connect failed (${connRes.status}): ${errText.slice(0, 200)}`
          }
          const connData = await connRes.json() as { data?: { auth_url?: string; id?: string; status?: string } }
          // If auth_url is returned, present it to the user for OAuth approval
          if (connData.data?.auth_url) {
            return `OAuth flow required for "${toolkit}":\n\n${connData.data.auth_url}\n\nOpen this URL to authorize, then use COMPOSIO_MANAGE_CONNECTIONS with action "status" to verify connection.`
          }
          if (connData.data?.status) {
            return `Connection initiated for "${toolkit}". Status: ${connData.data.status}. Use action "status" to check when active.`
          }
          return `Connection request sent for "${toolkit}". Use action "status" to verify connection.`
        }
        return `COMPOSIO_MANAGE_CONNECTIONS: unknown action "${action}" — use connect, disconnect, or status`
      } catch (e) {
        return `COMPOSIO_MANAGE_CONNECTIONS error: ${(e as Error).message}`
      }
    }

    // ── topic_search ─────────────────────────────────────────────────────────
    case 'topic_search': {
      if (!userId) return 'Not authenticated'
      const { query: topicQ, status: topicStatus = 'active', notification_policy: notifPol, topic_type: topicTp, limit: topicLim = 20 } = args as {
        query?: string; status?: string; notification_policy?: string; topic_type?: string; limit?: number
      }
      try {
        const cap = Math.min(Number(topicLim), 50)
        let sql = `SELECT id, name, fingerprint, aliases, summary, notification_policy, topic_type, cognition_state, updated_at FROM sparkie_topics WHERE user_id = $1`
        const params: unknown[] = [userId]
        let n = 2
        if (topicStatus !== 'all') { sql += ` AND status = $${n++}`; params.push(topicStatus === 'archived' ? 'archived' : 'active') }
        if (topicQ) { sql += ` AND (name ILIKE $${n} OR fingerprint ILIKE $${n} OR summary ILIKE $${n})`; params.push(`%${topicQ}%`); n++ }
        if (notifPol) { sql += ` AND notification_policy = $${n++}`; params.push(notifPol) }
        if (topicTp) { sql += ` AND topic_type = $${n++}`; params.push(topicTp) }
        sql += ` ORDER BY updated_at DESC LIMIT $${n}`
        params.push(cap)
        const res = await query(sql, params)
        if (!res.rows.length) return `topic_search: no topics found${topicQ ? ` matching "${topicQ}"` : ''}`
        const rows = res.rows as Array<{
          id: string; name: string; fingerprint: string | null; aliases: unknown; summary: string; notification_policy: string; topic_type: string | null; cognition_state: unknown; updated_at: string
        }>
        const lines = rows.map(r => {
          const aliases = (r.aliases as string[] | null) ?? []
          const cog = r.cognition_state as Record<string, unknown> | null
          const cogSummary = cog ? Object.keys(cog).join(', ') : 'no cognition'
          return `[${r.id}] ${r.name}` +
            (r.fingerprint ? ` (${r.fingerprint})` : '') +
            (aliases.length > 0 ? ` aliases: ${aliases.join(', ')}` : '') +
            `\n  summary: ${r.summary || '(none)'}` +
            `\n  policy: ${r.notification_policy} | type: ${r.topic_type ?? 'unspecified'} | cognition: ${cogSummary}` +
            ` | updated: ${new Date(r.updated_at).toLocaleDateString()}`
        })
        return `Topics (${rows.length}):\n${lines.join('\n\n')}`
      } catch (e) {
        return `topic_search error: ${(e as Error).message}`
      }
    }

    // ── chat_history_search ──────────────────────────────────────────────────
    case 'chat_history_search': {
      if (!userId) return 'Not authenticated'
      const { query: histQ, role: histRole, tool_call_id: histTcid, since_hours: histHours, limit: histLim = 20 } = args as {
        query?: string; role?: string; tool_call_id?: string; since_hours?: number; limit?: number
      }
      if (!histQ && !histRole && !histTcid) return 'chat_history_search: query, role, or tool_call_id is required'
      try {
        const cap = Math.min(Number(histLim), 100)
        let sql = `SELECT id, role, content, tool_call_id, is_tool_result, created_at FROM sparkie_threads WHERE user_id = $1`
        const params: unknown[] = [userId]
        let n = 2
        if (histQ) { sql += ` AND content ILIKE $${n++}`; params.push(`%${histQ}%`) }
        if (histRole) { sql += ` AND role = $${n++}`; params.push(histRole) }
        if (histTcid) { sql += ` AND tool_call_id = $${n++}`; params.push(histTcid) }
        if (histHours) { sql += ` AND created_at > NOW() - INTERVAL '${Number(histHours)} hours'`; n++ }
        sql += ` ORDER BY created_at DESC LIMIT $${n}`
        params.push(cap)
        const res = await query(sql, params)
        if (!res.rows.length) return `chat_history_search: no messages found${histQ ? ` matching "${histQ}"` : ''}`
        const rows = res.rows as Array<{ id: number; role: string; content: string; tool_call_id: string | null; is_tool_result: boolean; created_at: string }>
        const lines = rows.map(r => {
          const prefix = r.is_tool_result ? `[TOOL:${r.tool_call_id ?? '?'}]` : `[${r.role.toUpperCase()}]`
          const time = new Date(r.created_at).toLocaleString()
          const content = (typeof r.content === 'string' ? r.content : JSON.stringify(r.content)).slice(0, 200)
          return `${prefix} ${time}\n${content}${content.length >= 200 ? '...' : ''}`
        })
        return `Chat history (${rows.length} messages):\n${lines.join('\n\n')}`
      } catch (e) {
        return `chat_history_search error: ${(e as Error).message}`
      }
    }

    default:
      return null
  }
}
