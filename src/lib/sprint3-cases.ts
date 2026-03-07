// Sprint 3 — P2 Case Handlers
// Called from executeSprint2Tool() default fallthrough in route.ts

import { query } from '@/lib/db'

const REPO_OWNER = 'Draguniteus'
const REPO_NAME = 'sparkie-studio'

export async function executeSprint3Tool(
  name: string,
  args: Record<string, unknown>,
  userId: string | null,
  baseUrl: string
): Promise<string | null> {
  switch (name) {
    case 'execute_script': {
      if (!userId) return 'Not authenticated'
      const { language = 'node', code, timeout = 30 } = args as {
        language?: string; code: string; timeout?: number
      }
      if (!code) return 'execute_script: code is required'
      const lang = language === 'python' ? 'python' : 'node'
      const safeTimeout = Math.min(Number(timeout) || 30, 120)
      try {
        const ext = lang === 'python' ? 'py' : 'js'
        const runner = lang === 'python'
          ? `python3 /tmp/sparkie_script.${ext}`
          : `node /tmp/sparkie_script.${ext}`
        const termRes = await fetch(`${baseUrl}/api/terminal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create' }),
        })
        if (!termRes.ok) return `execute_script: terminal unavailable (${termRes.status})`
        const termData = await termRes.json() as { sessionId?: string; error?: string }
        if (termData.error || !termData.sessionId) return `execute_script: terminal error — ${termData.error ?? 'no session'}`
        const sid = termData.sessionId
        const b64 = Buffer.from(code).toString('base64')
        const writeCmd = `echo ${b64} | base64 -d > /tmp/sparkie_script.${ext}`
        const writeRes = await fetch(`${baseUrl}/api/terminal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'input', sessionId: sid, data: writeCmd }),
        })
        if (!writeRes.ok) return `execute_script: write error (${writeRes.status})`
        const runCmd = `timeout ${safeTimeout} ${runner} 2>&1`
        const runRes = await fetch(`${baseUrl}/api/terminal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'input', sessionId: sid, data: runCmd }),
        })
        if (!runRes.ok) return `execute_script: run error (${runRes.status})`
        const runData = await runRes.json() as { output?: string; error?: string }
        return runData.output?.slice(0, 4000) ?? runData.error ?? 'Script executed (no output)'
      } catch (e) {
        return `execute_script error: ${String(e)}`
      }
    }

    case 'npm_run': {
      if (!userId) return 'Not authenticated'
      const { command } = args as { command: string }
      if (!command) return 'npm_run: command is required'
      const cmd = command.trim()
      const allowed = /^(build|test|lint|typecheck|start|install [a-zA-Z0-9@/_.-]+|audit|outdated|fund)$/
      if (!allowed.test(cmd)) {
        return `npm_run: command "${cmd}" is not in the allowed list. Allowed: build, test, lint, typecheck, start, install <pkg>, audit, outdated`
      }
      try {
        const termRes = await fetch(`${baseUrl}/api/terminal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create' }),
        })
        if (!termRes.ok) return `npm_run: terminal unavailable (${termRes.status})`
        const termData = await termRes.json() as { sessionId?: string; error?: string }
        if (termData.error || !termData.sessionId) return `npm_run: terminal error — ${termData.error ?? 'no session'}`
        const sid = termData.sessionId
        const npmCmd = cmd.startsWith('install') ? `npm ${cmd} 2>&1` : `npm run ${cmd} 2>&1 || npm ${cmd} 2>&1`
        const runRes = await fetch(`${baseUrl}/api/terminal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'input', sessionId: sid, data: npmCmd }),
        })
        if (!runRes.ok) return `npm_run: execution error (${runRes.status})`
        const runData = await runRes.json() as { output?: string; error?: string }
        return (runData.output ?? runData.error ?? 'npm command ran (no output)').slice(0, 4000)
      } catch (e) {
        return `npm_run error: ${String(e)}`
      }
    }

    case 'git_ops': {
      if (!userId) return 'Not authenticated'
      const { action, branch, from_branch = 'master', base, head, sha } = args as {
        action: string; branch?: string; from_branch?: string; base?: string; head?: string; sha?: string
      }
      const ghToken = process.env.GITHUB_TOKEN
      if (!ghToken) return 'git_ops: GITHUB_TOKEN not configured'
      const apiBase = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`
      const headers = { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
      try {
        if (action === 'list_branches') {
          const r = await fetch(`${apiBase}/branches?per_page=30`, { headers })
          if (!r.ok) return `git_ops list_branches: GitHub ${r.status}`
          const d = await r.json() as Array<any>
          return d.map((b: any) => `${String(b.name)} @ ${String(b.commit?.sha).slice(0, 8)}`).join('\n')
        }
        if (action === 'create_branch') {
          if (!branch) return 'git_ops create_branch: branch name required'
          const refR = await fetch(`${apiBase}/git/ref/heads/${from_branch}`, { headers })
          if (!refR.ok) return `git_ops create_branch: could not resolve ${from_branch} (${refR.status})`
          const refD = await refR.json() as { object?: { sha?: string } }
          const baseSha = refD.object?.sha
          if (!baseSha) return 'git_ops create_branch: could not get base SHA'
          const createR = await fetch(`${apiBase}/git/refs`, {
            method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
          })
          if (!createR.ok) return `git_ops create_branch: ${createR.status} — ${await createR.text()}`
          return `Branch "${branch}" created from ${from_branch} @ ${baseSha.slice(0, 8)}`
        }
        if (action === 'delete_branch') {
          if (!branch) return 'git_ops delete_branch: branch name required'
          if (branch === 'master' || branch === 'main') return 'git_ops delete_branch: cannot delete default branch'
          const r = await fetch(`${apiBase}/git/refs/heads/${branch}`, { method: 'DELETE', headers })
          if (r.status === 204) return `Branch "${branch}" deleted`
          return `git_ops delete_branch: ${r.status} — ${await r.text()}`
        }
        if (action === 'get_commit') {
          if (!sha) return 'git_ops get_commit: sha required'
          const r = await fetch(`${apiBase}/commits/${sha}`, { headers })
          if (!r.ok) return `git_ops get_commit: ${r.status}`
          const d = await r.json() as { sha?: string; commit?: { message?: string; author?: { date?: string; name?: string } }; files?: Array<any> }
          const msg = d.commit?.message?.split('\n')[0] ?? ''
          const date = d.commit?.author?.date?.slice(0, 16) ?? ''
          const author = d.commit?.author?.name ?? ''
          const files = (d.files ?? []).slice(0, 10).map((f: any) => `  ${String(f.status)} ${String(f.filename)} (+${f.additions}/-${f.deletions})`)
          return `${String(d.sha).slice(0, 8)} by ${author} at ${date}\n${msg}\n\nFiles (${d.files?.length ?? 0}):\n${files.join('\n')}`
        }
        if (action === 'compare') {
          if (!base || !head) return 'git_ops compare: base and head required'
          const r = await fetch(`${apiBase}/compare/${base}...${head}`, { headers })
          if (!r.ok) return `git_ops compare: ${r.status}`
          const d = await r.json() as { ahead_by?: number; behind_by?: number; status?: string; commits?: any[]; files?: any[] }
          return `${base}...${head}: ${d.status}, +${d.ahead_by} commits ahead, -${d.behind_by} behind\n${d.commits?.length ?? 0} commits, ${d.files?.length ?? 0} files changed`
        }
        return `git_ops: unknown action "${action}". Valid: list_branches, create_branch, delete_branch, get_commit, compare`
      } catch (e) {
        return `git_ops error: ${String(e)}`
      }
    }

    case 'delete_memory': {
      if (!userId) return 'Not authenticated'
      const { memory_id } = args as { memory_id: string }
      if (!memory_id) return 'delete_memory: memory_id is required'
      try {
        const res = await query(
          `DELETE FROM sparkie_self_memory WHERE id = $1 RETURNING id, content`,
          [memory_id]
        )
        if (!res.rows.length) return `delete_memory: no memory found with id "${memory_id}"`
        const deleted = res.rows[0]
        return `Memory deleted: [${String(deleted.id)}] "${String(deleted.content).slice(0, 80)}${String(deleted.content).length > 80 ? '...' : ''}"`
      } catch (e) {
        return `delete_memory error: ${String(e)}`
      }
    }

    case 'run_tests': {
      if (!userId) return 'Not authenticated'
      const { pattern } = args as { pattern?: string }
      try {
        const termRes = await fetch(`${baseUrl}/api/terminal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create' }),
        })
        if (!termRes.ok) return `run_tests: terminal unavailable (${termRes.status})`
        const termData = await termRes.json() as { sessionId?: string; error?: string }
        if (termData.error || !termData.sessionId) return `run_tests: terminal error — ${termData.error ?? 'no session'}`
        const sid = termData.sessionId
        const testCmd = pattern
          ? `npm test -- --testPathPattern="${pattern.replace(/"/g, '')}" 2>&1 | tail -60`
          : `npm test 2>&1 | tail -60`
        const runRes = await fetch(`${baseUrl}/api/terminal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'input', sessionId: sid, data: testCmd }),
        })
        if (!runRes.ok) return `run_tests: execution error (${runRes.status})`
        const runData = await runRes.json() as { output?: string; error?: string }
        return (runData.output ?? runData.error ?? 'Tests ran (no output)').slice(0, 4000)
      } catch (e) {
        return `run_tests error: ${String(e)}`
      }
    }

    case 'check_lint': {
      if (!userId) return 'Not authenticated'
      const { path: lintPath } = args as { path?: string }
      try {
        const termRes = await fetch(`${baseUrl}/api/terminal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create' }),
        })
        if (!termRes.ok) return `check_lint: terminal unavailable (${termRes.status})`
        const termData = await termRes.json() as { sessionId?: string; error?: string }
        if (termData.error || !termData.sessionId) return `check_lint: terminal error — ${termData.error ?? 'no session'}`
        const sid = termData.sessionId
        const target = lintPath ? `"${lintPath.replace(/"/g, '')}"` : '.'
        const lintCmd = `(npx tsc --noEmit 2>&1 | head -40) && echo "---ESLint---" && (npx eslint ${target} --max-warnings=0 2>&1 | head -40) || true`
        const runRes = await fetch(`${baseUrl}/api/terminal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'input', sessionId: sid, data: lintCmd }),
        })
        if (!runRes.ok) return `check_lint: execution error (${runRes.status})`
        const runData = await runRes.json() as { output?: string; error?: string }
        return (runData.output ?? runData.error ?? 'Lint ran (no output)').slice(0, 4000)
      } catch (e) {
        return `check_lint error: ${String(e)}`
      }
    }

    default:
      return null // not a Sprint 3 tool
  }
}
