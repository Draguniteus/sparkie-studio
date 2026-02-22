/**
 * Parse AI response to extract file blocks.
 * Supports multiple output formats from different models.
 *
 * Auto-wrapping rule:
 * If ALL parsed file names share no common root folder (i.e., they are flat like
 * "package.json", "src/App.jsx"), they are wrapped in a sanitized projectName folder.
 */

export interface ParsedFile {
  name: string
  content: string
}

export interface ParseResult {
  text: string
  files: ParsedFile[]
  folders?: string[]  // explicit ---FOLDER:--- declarations from agent
}

/**
 * Derive a safe folder name from the chat title or prompt.
 * e.g. "Build me a task manager app" → "task-manager"
 *      "New Chat" → "project"
 */
export function deriveProjectName(chatTitle: string): string {
  if (!chatTitle || chatTitle.trim() === '' || chatTitle.toLowerCase() === 'new chat') {
    return 'project'
  }
  return chatTitle
    .toLowerCase()
    .replace(/build (me )?a?n? ?/i, '')   // strip "build me a", "build a"
    .replace(/app|application|website|site|game|tool|dashboard/gi, (m) => m) // keep meaningful keywords
    .trim()
    .replace(/[^a-z0-9]+/g, '-')          // non-alphanum → dash
    .replace(/^-+|-+$/g, '')             // trim leading/trailing dashes
    .slice(0, 32)                         // max 32 chars
    || 'project'
}

/**
 * Wrap flat files (no shared root folder) inside a named project folder.
 * If files already share a single root like "taskmanager/..." leave them as-is.
 */
function wrapInProjectFolder(files: ParsedFile[], projectName: string): ParsedFile[] {
  if (files.length === 0) return files

  // Get root segments of each file path
  const roots = files.map(f => {
    const parts = f.name.replace(/\\/g, '/').split('/')
    return parts.length > 1 ? parts[0] : null
  })

  // If every file already has a common root folder → already wrapped, leave alone
  const nonNullRoots = roots.filter(Boolean)
  if (nonNullRoots.length === files.length) {
    const firstRoot = nonNullRoots[0]
    if (nonNullRoots.every(r => r === firstRoot)) {
      return files // already wrapped in a folder
    }
  }

  // Otherwise wrap all files under projectName/
  const safe = projectName || 'project'
  return files.map(f => ({
    ...f,
    name: `${safe}/${f.name}`
  }))
}

export function parseAIResponse(raw: string, projectName?: string): ParseResult {
  const files: ParsedFile[] = []

  // Extract ---FOLDER:--- markers (explicit folder declarations from agent)
  const folderRegex = /---FOLDER:\s*([^\n-][^\n]*)\s*---/g
  const folders: string[] = []
  let folderMatch: RegExpExecArray | null
  while ((folderMatch = folderRegex.exec(raw)) !== null) {
    const folderPath = folderMatch[1].trim().replace(/^\/+|\/+$/g, '')  // normalize
    if (folderPath) folders.push(folderPath)
  }
  // Strip ---FOLDER:--- markers from raw before further parsing
  const rawWithoutFolders = raw.replace(/---FOLDER:\s*[^\n-][^\n]*\s*---\n?/g, '')

  // Normalize line endings
  const normalized = rawWithoutFolders.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // ── Primary: ---FILE: name--- ... ---END FILE--- ──────────────────────────
  const strictRegex = /---FILE:\s*([^\n-][^\n]*)\s*---\s*\n([\s\S]*?)---END FILE---/g
  let match: RegExpExecArray | null
  while ((match = strictRegex.exec(normalized)) !== null) {
    const content = match[2].trimEnd()
    if (content.length > 0) {
      files.push({ name: match[1].trim(), content })
    }
  }
  if (files.length > 0) {
    const text = normalized.replace(/---FILE:\s*[^\n-][^\n]*\s*---\s*\n[\s\S]*?---END FILE---/g, '').trim()
    return { text, files: wrapInProjectFolder(files, projectName || 'project'), folders }
  }

  // ── Fallback A: ---FILE: without ---END FILE--- ───────────────────────────
  const looseRegex = /---FILE:\s*([^\n-][^\n]*)\s*---\s*\n([\s\S]*?)(?=---FILE:|$)/g
  const looseMatches: Array<{ name: string; content: string }> = []
  while ((match = looseRegex.exec(normalized)) !== null) {
    const content = match[2].trimEnd()
    if (content.length > 0) {
      looseMatches.push({ name: match[1].trim(), content })
    }
  }
  if (looseMatches.length > 0) {
    for (const f of looseMatches) files.push(f)
    const text = normalized.replace(/---FILE:\s*[^\n-][^\n]*\s*---\s*\n[\s\S]*?(?=---FILE:|$)/g, '').trim()
    return { text, files: wrapInProjectFolder(files, projectName || 'project'), folders }
  }

  // ── Fallback B: fenced code blocks ───────────────────────────────────────
  const codeBlockRegex = /```([^\n]*)\n([\s\S]*?)```/g
  let cbMatch: RegExpExecArray | null
  let fileIndex = 0
  while ((cbMatch = codeBlockRegex.exec(normalized)) !== null) {
    const langStr = cbMatch[1].trim()
    const content = cbMatch[2].trimEnd()
    if (!content) continue
    let name: string
    if (langStr.includes('.')) {
      name = langStr
    } else {
      name = inferFilename(langStr, content, fileIndex)
    }
    files.push({ name, content })
    fileIndex++
  }
  if (files.length > 0) {
    const text = normalized.replace(/```[^\n]*\n[\s\S]*?```/g, '').trim()
    return { text, files: wrapInProjectFolder(files, projectName || 'project'), folders }
  }

  // ── Fallback C: raw HTML/JS/CSS (no markers at all) ──────────────────────
  // ONLY fires when there are zero ---FILE:--- markers in the output
  const hasAnyFileMarker = /---FILE:/i.test(normalized)
  if (!hasAnyFileMarker && normalized.trim().length > 50) {
    const trimmed = normalized.trim()
    const looksLikeHTML = /<html|<!DOCTYPE/i.test(trimmed)
    const looksLikeJS = /^(const|let|var|function|import|export|class)\b/.test(trimmed)
    const looksLikeCSS = /^[\s\S]*?\{[\s\S]*?\}/.test(trimmed) && !looksLikeHTML && !looksLikeJS

    let fallbackName = 'index.html'
    if (looksLikeJS && !looksLikeHTML) fallbackName = 'index.js'
    else if (looksLikeCSS) fallbackName = 'styles.css'

    const wrappedName = projectName ? `${projectName}/${fallbackName}` : fallbackName
    return {
      text: '',
      files: [{ name: wrappedName, content: trimmed }],
      folders
    }
  }

  return { text: normalized.trim(), files: [], folders }
}

function inferFilename(lang: string, content: string, index: number): string {
  const suffix = index > 0 ? `${index}` : ''
  const l = lang.toLowerCase()
  if (l === 'html' || content.includes('</html>') || content.includes('<body')) return `index${suffix}.html`
  if (l === 'css' || l === 'scss') return `styles${suffix}.${l}`
  if (l === 'typescript' || l === 'ts') return `script${suffix}.ts`
  if (l === 'tsx') return `component${suffix}.tsx`
  if (l === 'jsx') return `component${suffix}.jsx`
  if (l === 'javascript' || l === 'js') return `script${suffix}.js`
  if (l === 'json') return `data${suffix}.json`
  if (l === 'python' || l === 'py') return `script${suffix}.py`
  if (l === 'bash' || l === 'sh') return `script${suffix}.sh`
  if (l === 'sql') return `query${suffix}.sql`
  return `file${suffix}.txt`
}

export function getLanguageFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', md: 'markdown', mdx: 'markdown', css: 'css', scss: 'scss', sass: 'scss',
    html: 'html', py: 'python', txt: 'plaintext', svg: 'xml',
    rs: 'rust', go: 'go', c: 'c', cpp: 'cpp', cs: 'csharp',
    java: 'java', kt: 'kotlin', swift: 'swift', rb: 'ruby', php: 'php',
    yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml', csv: 'plaintext',
    sql: 'sql', graphql: 'graphql', sh: 'shell', bash: 'shell', ps1: 'powershell',
  }
  return map[ext] || 'plaintext'
}

export function getFileSize(content: string): string {
  const bytes = new TextEncoder().encode(content).length
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}
