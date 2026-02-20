/**
 * Parse AI response to extract file blocks.
 * Format: ---FILE: filename.ext---\n(content)\n---END FILE---
 */

export interface ParsedFile {
  name: string
  content: string
}

export interface ParseResult {
  text: string          // non-file text (brief description)
  files: ParsedFile[]   // extracted file blocks
}

export function parseAIResponse(raw: string): ParseResult {
  const files: ParsedFile[] = []
  let text = raw

  // Match ---FILE: name--- ... ---END FILE---
  const fileRegex = /---FILE:\s*(.+?)\s*---\n([\s\S]*?)---END FILE---/g
  let match: RegExpExecArray | null

  while ((match = fileRegex.exec(raw)) !== null) {
    files.push({
      name: match[1].trim(),
      content: match[2].trimEnd(),
    })
  }

  // Remove file blocks from text to get just the description
  text = raw.replace(/---FILE:\s*.+?\s*---\n[\s\S]*?---END FILE---/g, '').trim()

  // Also try to catch ```filename.ext blocks as fallback
  if (files.length === 0) {
    const codeBlockRegex = /```(\w+)?\s*\n([\s\S]*?)```/g
    let cbMatch: RegExpExecArray | null
    let fileIndex = 0

    while ((cbMatch = codeBlockRegex.exec(raw)) !== null) {
      const lang = cbMatch[1] || 'txt'
      const content = cbMatch[2].trimEnd()

      // Try to detect filename from content or use generic
      let name = `file${fileIndex > 0 ? fileIndex : ''}`
      if (lang === 'html' || content.includes('<!DOCTYPE') || content.includes('<html')) {
        name = 'index.html'
      } else if (lang === 'css') {
        name = 'styles.css'
      } else if (lang === 'javascript' || lang === 'js') {
        name = 'script.js'
      } else if (lang === 'typescript' || lang === 'ts') {
        name = 'script.ts'
      } else if (lang === 'svg' || content.includes('<svg')) {
        name = `image${fileIndex > 0 ? fileIndex : ''}.svg`
      } else if (lang === 'python' || lang === 'py') {
        name = 'main.py'
      } else if (lang === 'json') {
        name = 'data.json'
      } else {
        name = `file${fileIndex > 0 ? fileIndex : ''}.${lang}`
      }

      files.push({ name, content })
      fileIndex++
    }

    if (files.length > 0) {
      text = raw.replace(/```\w*\s*\n[\s\S]*?```/g, '').trim()
    }
  }

  return { text, files }
}

export function getLanguageFromFilename(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', md: 'markdown', css: 'css', scss: 'scss',
    html: 'html', py: 'python', txt: 'plaintext', svg: 'xml',
  }
  return map[ext] || 'plaintext'
}

export function getFileSize(content: string): string {
  const bytes = new TextEncoder().encode(content).length
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}
