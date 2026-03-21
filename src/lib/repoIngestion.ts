import { query } from '@/lib/db'
import { writeWorklog } from '@/lib/worklog'

export interface ProjectContext {
  id: string
  userId: string
  repo: string
  summary: string          // 1-paragraph overview
  techStack: string[]      // ['Next.js 14', 'TypeScript', 'PostgreSQL', ...]
  keyFiles: Record<string, string>  // path → brief description
  knownIssues: string[]
  activeFeatures: string[] // in-flight work
  lastIngestedAt: Date
}

// Key paths we always read for context — lightweight, high signal
const CONTEXT_PATHS = [
  'package.json',
  'src/lib/db.ts',
  'src/app/api/chat/route.ts',
  'src/store/appStore.ts',
  'tsconfig.json',
]

// Max chars per file in project context (keep total < 8k tokens)
const MAX_FILE_CHARS = 1200

async function fetchGitHubFile(owner: string, repo: string, path: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' }, signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return null
    const data = await res.json() as { content?: string; encoding?: string }
    if (!data.content || data.encoding !== 'base64') return null
    return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8').slice(0, MAX_FILE_CHARS)
  } catch { return null }
}

async function fetchRepoTree(owner: string, repo: string, token: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/master?recursive=1`,
      { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' }, signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return []
    const data = await res.json() as { tree: Array<{ path: string; type: string }> }
    return (data.tree ?? [])
      .filter(f => f.type === 'blob' && f.path.endsWith('.ts') || f.path.endsWith('.tsx'))
      .map(f => f.path)
      .slice(0, 200) // cap to avoid huge context
  } catch { return [] }
}

export async function ingestRepo(userId: string, owner: string, repo: string): Promise<ProjectContext> {
  await ensureProjectsTable()

  const token = process.env.GITHUB_TOKEN ?? process.env.GITHUB_PAT ?? ''
  if (!token) throw new Error('GITHUB_TOKEN not configured')

  // Fetch key files in parallel
  const fileContents = await Promise.all(
    CONTEXT_PATHS.map(async p => ({ path: p, content: await fetchGitHubFile(owner, repo, p, token) }))
  )
  const validFiles = fileContents.filter(f => f.content !== null) as Array<{ path: string; content: string }>

  // Fetch repo tree for structural awareness
  const allFiles = await fetchRepoTree(owner, repo, token)

  // Build key files map
  const keyFiles: Record<string, string> = {}
  for (const { path, content } of validFiles) {
    // Extract a one-line description from file content
    const firstComment = content.match(/\/\/\s*(.+)/)?.[1] ?? content.split('\n')[0].slice(0, 80)
    keyFiles[path] = firstComment
  }

  // Derive tech stack from package.json
  const pkgJson = validFiles.find(f => f.path === 'package.json')?.content ?? '{}'
  const techStack: string[] = []
  try {
    const pkg = JSON.parse(pkgJson) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    const interesting = ['next', 'react', 'typescript', 'tailwindcss', 'zustand', 'openai', 'pg', 'zod', 'prisma', 'drizzle']
    for (const dep of interesting) {
      if (dep in allDeps) techStack.push(`${dep}@${allDeps[dep]}`)
    }
  } catch { /* ok */ }

  // Build summary
  const tsFiles = allFiles.filter(p => p.startsWith('src/'))
  const apiRoutes = allFiles.filter(p => p.includes('/api/') && p.endsWith('route.ts'))
  const summary = `${owner}/${repo} — Next.js 14 app with ${tsFiles.length} TypeScript source files and ${apiRoutes.length} API routes. Agent loop lives in src/app/api/chat/route.ts. Intelligence layer in src/lib/ (executionTrace, attemptHistory, userModel, knowledgeTTL, threadStore). Brain UI in src/components/ide/.`

  const ctx: ProjectContext = {
    id: `${owner}/${repo}`,
    userId,
    repo: `${owner}/${repo}`,
    summary,
    techStack,
    keyFiles,
    knownIssues: [],
    activeFeatures: [],
    lastIngestedAt: new Date(),
  }

  // Persist to DB
  await query(
    `INSERT INTO sparkie_projects (id, user_id, repo, summary, tech_stack, key_files, known_issues, active_features, last_ingested_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (id) DO UPDATE SET
       summary = EXCLUDED.summary,
       tech_stack = EXCLUDED.tech_stack,
       key_files = EXCLUDED.key_files,
       last_ingested_at = NOW()`,
    [ctx.id, userId, ctx.repo, ctx.summary, JSON.stringify(techStack), JSON.stringify(keyFiles), JSON.stringify([]), JSON.stringify([])]
  )

  writeWorklog(userId, 'proactive_check', `Repo ingested: ${ctx.repo} — ${tsFiles.length} files, ${apiRoutes.length} routes`, { project: ctx.id, conclusion: `Repository ${ctx.repo} ingested successfully — ${tsFiles.length} TypeScript files and ${apiRoutes.length} API routes indexed` }).catch(() => {})
  return ctx
}

export async function getProjectContext(userId: string, repo: string): Promise<ProjectContext | null> {
  await ensureProjectsTable()
  try {
    const res = await query<{
      id: string; user_id: string; repo: string; summary: string;
      tech_stack: string; key_files: string; known_issues: string;
      active_features: string; last_ingested_at: Date
    }>(
      'SELECT * FROM sparkie_projects WHERE id = $1',
      [repo]
    )
    if (!res.rows.length) return null
    const r = res.rows[0]
    return {
      id: r.id,
      userId: r.user_id,
      repo: r.repo,
      summary: r.summary,
      techStack: JSON.parse(r.tech_stack),
      keyFiles: JSON.parse(r.key_files),
      knownIssues: JSON.parse(r.known_issues),
      activeFeatures: JSON.parse(r.active_features),
      lastIngestedAt: r.last_ingested_at,
    }
  } catch { return null }
}

export async function addKnownIssue(repo: string, issue: string): Promise<void> {
  await ensureProjectsTable()
  await query(
    `UPDATE sparkie_projects
     SET known_issues = (
       SELECT jsonb_agg(DISTINCT elem) FROM (
         SELECT jsonb_array_elements_text(known_issues::jsonb) AS elem
         UNION SELECT $2
       ) t
       LIMIT 20
     )
     WHERE id = $1`,
    [repo, issue]
  ).catch(() => {})
}

export async function resolveKnownIssue(repo: string, issue: string): Promise<void> {
  await ensureProjectsTable()
  await query(
    `UPDATE sparkie_projects
     SET known_issues = (
       SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) FROM (
         SELECT jsonb_array_elements_text(known_issues::jsonb) AS elem
       ) t WHERE elem NOT ILIKE $2
     )
     WHERE id = $1`,
    [repo, `%${issue.slice(0, 30)}%`]
  ).catch(() => {})
}

export function formatProjectContextBlock(ctx: ProjectContext): string {
  const age = Math.round((Date.now() - ctx.lastIngestedAt.getTime()) / 60000)
  const lines = [
    `## PROJECT CONTEXT: ${ctx.repo}`,
    `Ingested ${age}m ago. ${ctx.summary}`,
    '',
    `**Stack:** ${ctx.techStack.join(', ') || 'unknown'}`,
  ]
  if (Object.keys(ctx.keyFiles).length) {
    lines.push('', '**Key files:**')
    for (const [p, desc] of Object.entries(ctx.keyFiles).slice(0, 8)) {
      lines.push(`- \`${p}\` — ${desc}`)
    }
  }
  if (ctx.knownIssues.length) {
    lines.push('', `**Known issues (${ctx.knownIssues.length}):** ${ctx.knownIssues.slice(0, 3).join('; ')}`)
  }
  if (ctx.activeFeatures.length) {
    lines.push('', `**Active work:** ${ctx.activeFeatures.join(', ')}`)
  }
  return lines.join('\n')
}

async function ensureProjectsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS sparkie_projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      repo TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      tech_stack JSONB NOT NULL DEFAULT '[]',
      key_files JSONB NOT NULL DEFAULT '{}',
      known_issues JSONB NOT NULL DEFAULT '[]',
      active_features JSONB NOT NULL DEFAULT '[]',
      last_ingested_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})
  await query(`CREATE INDEX IF NOT EXISTS idx_sparkie_projects_user ON sparkie_projects(user_id)`).catch(() => {})
}
