/**
 * Parse AI response to extract file blocks.
 * Supports multiple output formats from different models.
 */

export interface ParsedFile {
  name: string
  content: string
}

export interface ParseResult {
  text: string
  files: ParsedFile[]
}

export function parseAIResponse(raw: string): ParseResult {
  const files: ParsedFile[] = []

  // Normalize line endings
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

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
    return { text, files }
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
    return { text, files }
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
    return { text, files }
  }

  // ── Fallback C: raw HTML/JS/CSS (no markers at all) ──────────────────────
  // ONLY fires when there are zero ---FILE:--- markers in the output
  // If markers exist but didn't parse, do NOT blindly wrap to avoid garbled previews
  const hasAnyFileMarker = /---FILE:/i.test(normalized)
  if (!hasAnyFileMarker && normalized.trim().length > 50) {
    const trimmed = normalized.trim()
    const looksLikeHTML = /<!DOCTYPE|<html|<head|<body/i.test(trimmed) || (trimmed.startsWith('<') && trimmed.includes('>'))
    const looksLikeJS = /^(function |const |let |var |class |import |export )/m.test(trimmed)
    const looksLikeCSS = /^[.#a-zA-Z][\s\S]*?\{[\s\S]*?:[\s\S]*?;/m.test(trimmed) && !looksLikeHTML

    if (looksLikeHTML) {
      files.push({ name: 'index.html', content: trimmed })
      return { text: '', files }
    } else if (looksLikeCSS) {
      files.push({ name: 'styles.css', content: trimmed })
      return { text: '', files }
    } else if (looksLikeJS) {
      files.push({ name: 'script.js', content: trimmed })
      return { text: '', files }
    }
  }

  return { text: normalized, files }
}

function inferFilename(lang: string, content: string, index: number): string {
  const suffix = index > 0 ? `${index}` : ''
  const l = lang.toLowerCase()
  if (l === 'html' || content.includes('<!DOCTYPE') || content.includes('<html')) return `index${suffix}.html`
  if (l === 'css' || l === 'scss' || l === 'sass') return `styles${suffix}.${l}`
  if (l === 'javascript' || l === 'js') return `script${suffix}.js`
  if (l === 'typescript' || l === 'ts') return `script${suffix}.ts`
  if (l === 'jsx') return `app${suffix}.jsx`
  if (l === 'tsx') return `app${suffix}.tsx`
  if (l === 'svg' || content.includes('<svg')) return `image${suffix}.svg`
  if (l === 'python' || l === 'py') return `main${suffix}.py`
  if (l === 'rust' || l === 'rs') return `main${suffix}.rs`
  if (l === 'go' || l === 'golang') return `main${suffix}.go`
  if (l === 'c') return `main${suffix}.c`
  if (l === 'cpp' || l === 'c++' || l === 'cxx') return `main${suffix}.cpp`
  if (l === 'java') return `Main${suffix}.java`
  if (l === 'kotlin' || l === 'kt') return `Main${suffix}.kt`
  if (l === 'swift') return `main${suffix}.swift`
  if (l === 'ruby' || l === 'rb') return `main${suffix}.rb`
  if (l === 'php') return `index${suffix}.php`
  if (l === 'csharp' || l === 'cs' || l === 'c#') return `Program${suffix}.cs`
  if (l === 'json') return `data${suffix}.json`
  if (l === 'yaml' || l === 'yml') return `config${suffix}.yaml`
  if (l === 'toml') return `config${suffix}.toml`
  if (l === 'xml') return `data${suffix}.xml`
  if (l === 'csv') return `data${suffix}.csv`
  if (l === 'sql') return `query${suffix}.sql`
  if (l === 'graphql' || l === 'gql') return `schema${suffix}.graphql`
  if (l === 'markdown' || l === 'md') return `readme${suffix}.md`
  if (l === 'mdx') return `page${suffix}.mdx`
  if (l === 'bash' || l === 'sh' || l === 'shell' || l === 'zsh') return `script${suffix}.sh`
  if (l === 'powershell' || l === 'ps1') return `script${suffix}.ps1`
  const ext = l || 'txt'
  return `file${suffix}.${ext}`
}

export function getLanguageFromFilename(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
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
