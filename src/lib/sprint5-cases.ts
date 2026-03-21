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

    default:
      return null
  }
}
