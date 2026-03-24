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

// Words that are "generic enough" to trigger the fallback if they're the ONLY remaining content
const GENERIC_FALLBACK_WORDS = new Set([
  'app', 'application', 'project', 'site', 'page', 'thing', 'it', 'this', 'that',
  'stuff', 'code', 'test', 'demo', 'sparkie', 'build', 'new', 'my', 'the',
  'something', 'cool', 'good', 'nice', 'awesome',
])

/**
 * Derive a safe folder name from a raw user prompt.
 * Strips command prefixes, filler adjectives, tech-stack clauses, then slugifies.
 * Falls back to "project-[base36timestamp]" for generic/empty results.
 *
 * Examples:
 *   "build me a todo app"                          → "todo-app"
 *   "create a weather dashboard"                   → "weather-dashboard"
 *   "make a snake game"                            → "snake-game"
 *   "build a landing page for Polleneer"           → "landing-page-for-polleneer"
 *   "create a 3D solar system simulation"          → "3d-solar-system"
 *   "make an app" / "build me something cool"      → "project-lk3x9" (fallback)
 */
export function deriveProjectName(prompt: string): string {
  if (!prompt?.trim()) return 'project-' + Date.now().toString(36)

  let s = prompt.toLowerCase().trim()

  // Step 1 — strip command verb + optional "me/a/an" prefix
  // Order matters: longest phrases first
  s = s.replace(
    /^(?:(?:can you|could you|would you|please|i want|i need|i'?d like|let'?s|can we|how about)\s+)?(?:build me|build|create me|create|make me|make|generate me|generate|write me|write|code me|code|program me|program|develop me|develop|implement me|implement|scaffold me|scaffold)\s+(?:me\s+)?(?:a\s+|an\s+|some\s+)?/,
    '',
  )

  // Step 2 — strip trailing tech-stack / tool mentions
  // "utilizing Vite React Three.js", "using React and Tailwind", "with websockets"
  s = s.replace(
    /\s+(?:utilizing|built with|powered by)\s+.+$/,
    '',
  )
  // Only strip trailing "using/with" if it's followed by tech words (not a real part of the name)
  s = s.replace(
    /\s+(?:using|with)\s+(?:[a-z0-9@./\-,\s]+)$/,
    (m) => {
      // Keep if it's part of a meaningful name like "drag and drop"
      if (/drag.{0,4}drop|pick.and.mix/i.test(m)) return m
      return ''
    },
  )

  // Step 3 — strip quality/style adjectives (anywhere in the string)
  s = s.replace(
    /\b(?:high-?quality|highly-?interactive|fully-?responsive|fully\s+functional|beautiful|stunning|gorgeous|modern|sleek|clean|minimal(?:ist)?|simple|full-?stack|full\s+stack|complete|basic|advanced|enterprise|production-?ready|responsive|animated)\b/g,
    '',
  )

  // Step 4 — strip trailing "website" / "application" / "web app" (but keep "app" when not alone)
  s = s.replace(/\s+(?:website|web\s+app|web-app|application|webapp)\s*$/, '')

  // Step 5 — normalize common compound terms
  s = s
    .replace(/\be-?commerce\b/g, 'ecommerce')
    .replace(/\breal-?time\b/g, 'realtime')
    .replace(/\bdrag.{0,5}drop\b/g, 'drag-drop')
    .replace(/\bai\b/g, 'ai')
    .replace(/\b3\s*d\b/g, '3d')

  // Step 6 — slugify: strip non-alphanumeric, collapse spaces/dashes
  s = s
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '')

  // Step 7 — fallback if result is all generic words or too short
  const parts = s.split('-').filter(Boolean)
  if (parts.length === 0 || s.length < 3 || parts.every(p => GENERIC_FALLBACK_WORDS.has(p))) {
    return 'project-' + Date.now().toString(36)
  }

  return s
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

  // ── JSON mode (MiniMax-M2.5 with response_format:{type:'json_object'}) ────
  // Output: {"files":[{"path":"...","content":"..."},...]}
  {
    const trimmed = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    try {
      const parsed = JSON.parse(trimmed)
      const arr: Array<{ path?: string; name?: string; content?: string }> =
        Array.isArray(parsed?.files) ? parsed.files :
        Array.isArray(parsed) ? parsed : []
      if (arr.length > 0) {
        const jsonFiles: ParsedFile[] = []
        for (const f of arr) {
          const filePath = (f.path || f.name || '').trim()
          const fileContent = (f.content ?? '').trimEnd()
          if (filePath && fileContent.length > 0) {
            jsonFiles.push({ name: filePath, content: fileContent })
          }
        }
        if (jsonFiles.length > 0) {
          return { text: '', files: wrapInProjectFolder(jsonFiles, projectName || 'project'), folders: [] }
        }
      }
    } catch (_) {
      // Not JSON — fall through to marker-based parsing
    }
  }

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

  // Primary: ---FILE: name--- ... ---END FILE---
  const strictRegex = /---FILE:\s*([^\n-][^\n]*)\s*---\s*\n([\s\S]*?)---END(?:\s+FILE)?---/g
  let match: RegExpExecArray | null
  while ((match = strictRegex.exec(normalized)) !== null) {
    const content = match[2].trimEnd()
    if (content.length > 0) {
      files.push({ name: match[1].trim(), content })
    }
  }
  if (files.length > 0) {
    const text = normalized.replace(/---FILE:\s*[^\n-][^\n]*\s*---\s*\n[\s\S]*?---END(?:\s+FILE)?---/g, '').trim()
    return { text, files: wrapInProjectFolder(files, projectName || 'project'), folders }
  }

  // Fallback A: ---FILE: without ---END FILE---
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

  // Fallback B: fenced code blocks
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

  // Fallback C: raw HTML/JS/CSS (no markers at all)
  // ── MiniMax XML tool-call parser ─────────────────────────────────────────
  // Supports two formats:
  //   M2.5: <minimax:tool_call><invoke name="write_file"><parameter name="path">...</parameter>...</invoke></minimax:tool_call>
  //   M2.7: <tool_call>{"name":"write_file","arguments":{"path":"...","content":"..."}}</tool_call>
  const isToolCallXml = /<minimax:tool_call|<invoke\s+name=|<tool_call|<function_calls/i.test(normalized)
  if (isToolCallXml) {
    const xmlFiles: ParsedFile[] = []

    // Format A: M2.5 <invoke name="write_file"> with <parameter> children
    const invokeRe = /<invoke[^>]*name=["']write_file["'][^>]*>([\s\S]*?)(?:<\/invoke>|<\/minimax:tool_call>)/gi
    let m: RegExpExecArray | null
    while ((m = invokeRe.exec(normalized)) !== null) {
      const body = m[1]
      const pPath = /<parameter[^>]*name=["']path["'][^>]*>([\s\S]*?)<\/parameter>/i.exec(body)
      const pContent = /<parameter[^>]*name=["']content["'][^>]*>([\s\S]*?)<\/parameter>/i.exec(body)
      if (pPath && pContent) {
        const fp = pPath[1].trim().replace(/^\/workspace\//, '').replace(/^\//, '')
        const fc = pContent[1].trimEnd()
        if (fp && fc.length > 0) xmlFiles.push({ name: fp, content: fc })
      }
    }

    // Format B: M2.7 <tool_call>{"name":"write_file","arguments":{...}}</tool_call>
    // Also handles <minimax:tool_call> with JSON body
    if (xmlFiles.length === 0) {
      const toolCallJsonRe = /<(?:tool_call|minimax:tool_call)[^>]*>([\s\S]*?)<\/(?:tool_call|minimax:tool_call)>/gi
      while ((m = toolCallJsonRe.exec(normalized)) !== null) {
        try {
          const raw = m[1].trim()
          if (!raw.startsWith('{')) continue  // not JSON body
          const payload = JSON.parse(raw) as {
            name?: string
            arguments?: Record<string, string>
            function?: { name?: string; arguments?: string | Record<string, string> }
          }
          const toolName = payload.name ?? payload.function?.name ?? ''
          if (toolName !== 'write_file') continue
          let args: Record<string, string> = {}
          if (payload.arguments && typeof payload.arguments === 'object') {
            args = payload.arguments as Record<string, string>
          } else if (payload.function?.arguments) {
            const fa = payload.function.arguments
            args = typeof fa === 'string' ? JSON.parse(fa) as Record<string, string> : fa as Record<string, string>
          }
          const fp = (args.path || args.filename || '').trim().replace(/^\/workspace\//, '').replace(/^\//, '')
          const fc = (args.content || '').trimEnd()
          if (fp && fc.length > 0) xmlFiles.push({ name: fp, content: fc })
        } catch { /* malformed JSON — skip */ }
      }
    }

    if (xmlFiles.length > 0) {
      console.log(`[PARSER] XML mode: extracted ${xmlFiles.length} file(s): ${xmlFiles.map(f => f.name).join(', ')}`)
      return { text: '', files: wrapInProjectFolder(xmlFiles, projectName || 'project'), folders: [] }
    }
    console.log('[PARSER] XML detected but no write_file invokes found — raw len:', normalized.length)
    return { text: '', files: [] }
  }
  // Guard: reject planning text / natural language responses without code
  const firstLine = normalized.trim().split('\n')[0]
  const isNaturalLanguage = /^(I'?ll|I will|Let me|Here'?s|Sure|Okay|Of course|Creating|Building|I'?ve)/i.test(firstLine)
    && !normalized.includes('---FILE:')
    && !/[<{]/.test(normalized.slice(0, 50))
  if (isNaturalLanguage) {
    return { text: normalized, files: [] }
  }
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
