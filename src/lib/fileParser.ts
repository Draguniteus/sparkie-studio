/**
 * Parse AI response to extract file blocks.
 * Format: ---FILE: filename.ext---\n(content)\n---END FILE---
 * Fallback 1: ---FILE: filename.ext--- ... next marker or EOF (for models that omit ---END FILE---)
 * Fallback 2: ```lang\n(content)\n```
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
  let text = raw

  // Primary: strict ---FILE: name--- ... ---END FILE---
  const strictRegex = /---FILE:\s*(.+?)\s*---\n([\s\S]*?)---END FILE---/g
  let match: RegExpExecArray | null
  while ((match = strictRegex.exec(raw)) !== null) {
    files.push({ name: match[1].trim(), content: match[2].trimEnd() })
  }

  if (files.length > 0) {
    text = raw.replace(/---FILE:\s*.+?\s*---\n[\s\S]*?---END FILE---/g, '').trim()
    return { text, files }
  }

  // Fallback A: ---FILE: name--- without ---END FILE--- (some models omit the closing marker)
  // Match content up to next ---FILE: marker or end of string
  const looseRegex = /---FILE:\s*(.+?)\s*---\n([\s\S]*?)(?=---FILE:|$)/g
  const looseMatches: Array<{ name: string; content: string }> = []
  while ((match = looseRegex.exec(raw)) !== null) {
    const content = match[2].trimEnd()
    if (content.length > 0) {
      looseMatches.push({ name: match[1].trim(), content })
    }
  }

  if (looseMatches.length > 0) {
    for (const f of looseMatches) files.push(f)
    text = raw.replace(/---FILE:\s*.+?\s*---\n[\s\S]*?(?=---FILE:|$)/g, '').trim()
    return { text, files }
  }

  // Fallback B: fenced code blocks — try to extract filename from comment or language
  const codeBlockRegex = /```([^\n]*)\n([\s\S]*?)```/g
  let cbMatch: RegExpExecArray | null
  let fileIndex = 0

  while ((cbMatch = codeBlockRegex.exec(raw)) !== null) {
    const langStr = cbMatch[1].trim()
    const content = cbMatch[2].trimEnd()
    if (!content) continue

    // Check if langStr is actually a filename (contains a dot)
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
    text = raw.replace(/```[^\n]*\n[\s\S]*?```/g, '').trim()
  }

  return { text, files }
}

function inferFilename(lang: string, content: string, index: number): string {
  const suffix = index > 0 ? `${index}` : ''
  const l = lang.toLowerCase()

  // Web
  if (l === 'html' || content.includes('<!DOCTYPE') || content.includes('<html')) return `index${suffix}.html`
  if (l === 'css' || l === 'scss' || l === 'sass') return `styles${suffix}.${l}`
  if (l === 'javascript' || l === 'js') return `script${suffix}.js`
  if (l === 'typescript' || l === 'ts') return `script${suffix}.ts`
  if (l === 'jsx') return `app${suffix}.jsx`
  if (l === 'tsx') return `app${suffix}.tsx`
  if (l === 'svg' || content.includes('<svg')) return `image${suffix}.svg`

  // Systems
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

  // Data / Config
  if (l === 'json') return `data${suffix}.json`
  if (l === 'yaml' || l === 'yml') return `config${suffix}.yaml`
  if (l === 'toml') return `config${suffix}.toml`
  if (l === 'xml') return `data${suffix}.xml`
  if (l === 'csv') return `data${suffix}.csv`
  if (l === 'sql') return `query${suffix}.sql`
  if (l === 'graphql' || l === 'gql') return `schema${suffix}.graphql`

  // Markup / Docs
  if (l === 'markdown' || l === 'md') return `readme${suffix}.md`
  if (l === 'mdx') return `page${suffix}.mdx`

  // Shell
  if (l === 'bash' || l === 'sh' || l === 'shell' || l === 'zsh') return `script${suffix}.sh`
  if (l === 'powershell' || l === 'ps1') return `script${suffix}.ps1`

  // Default
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
