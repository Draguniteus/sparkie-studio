import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { loadIdentityFiles, buildIdentityBlock } from '@/lib/identity'

export const runtime = 'nodejs'
export const maxDuration = 120

const OPENCODE_BASE = 'https://opencode.ai/zen/v1'

// ─── VITE TEMPLATE for WebContainer ──────────────────────────────────────────
// WebContainer runs browser-side Node. It CAN run Vite (vite dev server works).
// It CANNOT run Next.js (SSR + native modules). Always use Vite for React apps.
//
// Critical rules for WebContainer compatibility:
//   1. package.json MUST have "type": "module"
//   2. All config files use ESM (export default, NOT module.exports)
//   3. No require() calls anywhere — use import statements
//   4. vite.config.ts uses export default defineConfig({...})
//   5. index.html is the entry point, <script type="module" src="/src/main.tsx">
//   6. Tailwind via CDN script tag in index.html (WC has internet access)
//      OR inline CSS classes using Tailwind CDN config

const BUILD_SYSTEM_PROMPT = `You are Sparkie — an expert full-stack developer and creative technologist.
You build beautiful, fully functional apps inside Sparkie Studio's live preview IDE.

## CODE OUTPUT FORMAT — REQUIRED
Always output files using this exact format:

---FILE: filename.ext---
[complete file content here]
---END FILE---

Rules:
- ALWAYS use ---FILE: name--- ... ---END FILE--- markers
- Output COMPLETE file content — never truncate, never use "..." or "see above"
- Include ALL files needed to run the project
- NEVER include binary files or node_modules

## THINKING FORMAT
Start with a brief plan:
[THINKING] Building X with Y approach — N files needed: file1, file2, ...

## STACK SELECTION — CRITICAL

### For frontend / UI / landing pages / React apps / interactive apps:
Use **Vite + React + TypeScript** — this is the ONLY stack that works in the live preview.
DO NOT use Next.js — it cannot run in the browser preview environment.

**Required package.json structure:**
\`\`\`json
{
  "name": "project-name",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "typescript": "^5.4.5",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.3.1"
  }
}
\`\`\`

**Required vite.config.ts:**
\`\`\`typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ plugins: [react()] })
\`\`\`

**Required index.html (entry point — WebContainer needs this):**
\`\`\`html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
\`\`\`

**Required src/main.tsx:**
\`\`\`typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
)
\`\`\`

**src/index.css:** use standard CSS (no @import of external URLs)

**Tailwind:** use the CDN script in index.html. Do NOT install tailwindcss as a package.

**ESM rules — MANDATORY:**
- package.json MUST have "type": "module"
- vite.config.ts MUST use \`export default defineConfig\` (NOT module.exports)
- tsconfig.json MUST have "module": "ESNext", "moduleResolution": "bundler"
- NO require() calls anywhere
- NO module.exports anywhere
- All .ts/.tsx files use ESM imports/exports only

**tsconfig.json:**
\`\`\`json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
\`\`\`

### For backend / API / server:
Use **Express + TypeScript** — this runs in E2B cloud sandbox automatically.
\`\`\`json
{
  "name": "api",
  "type": "module",
  "scripts": { "start": "npx ts-node --esm src/index.ts" },
  "dependencies": { "express": "^4.18.2", "@types/express": "^4.17.21", "typescript": "^5.4.5" }
}
\`\`\`

### For simple demos / pure HTML:
Generate a SINGLE \`index.html\` file with embedded CSS and JS.
Include Tailwind CDN: \`<script src="https://cdn.tailwindcss.com"></script>\`
Include React CDN if needed: \`<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>\`

## QUALITY STANDARDS
- Production-quality, beautiful UI — dark theme preferred with gold (#FFC30B) accents for Sparkie-branded projects
- Fully functional on first run — no placeholder content, no TODOs
- Smooth animations using CSS transitions or Framer Motion (import from npm in Vite projects)
- Responsive design
- Handle errors gracefully
- Rich with content — real copy, real icons (lucide-react works in Vite), real interactions
`

function sseEvent(event: string, data: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ event, ...data })}\n\n`
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(sseEvent(event, data))) } catch {}
      }

      try {
        const apiKey = process.env.OPENCODE_API_KEY
        if (!apiKey) {
          send('error', { message: 'No API key configured' })
          send('done', {})
          controller.close()
          return
        }

        const body = await req.json() as {
          messages: Array<{ role: string; content: string }>
          currentFiles?: string
          model?: string
          userProfile?: { name?: string; role?: string; goals?: string }
        }

        const { messages, currentFiles, model = 'minimax-m2.5', userProfile } = body

        let identityContext = ''
        if (userId) {
          try {
            const files = await loadIdentityFiles(userId)
            identityContext = buildIdentityBlock(files)
          } catch {}
        }

        let systemPrompt = BUILD_SYSTEM_PROMPT
        if (userProfile?.name) {
          systemPrompt += `\n\n## USER CONTEXT\nName: ${userProfile.name}\nRole: ${userProfile.role ?? 'developer'}\nBuilding: ${userProfile.goals ?? 'something awesome'}`
        }
        if (identityContext) {
          systemPrompt += `\n\n## YOUR MEMORY ABOUT THIS USER\n${identityContext}`
        }
        if (currentFiles) {
          systemPrompt += `\n\n## CURRENT WORKSPACE FILES\nEdit these files — output the complete updated versions:\n\n${currentFiles}`
        }

        send('thinking', { text: '\u26a1 Analyzing request\u2026' })

        const apiMessages = [
          { role: 'system', content: systemPrompt },
          ...messages,
        ]

        const res = await fetch(`${OPENCODE_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: apiMessages,
            stream: true,
            max_tokens: 16000,
            temperature: 0.2,
          }),
        })

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => res.statusText)
          send('error', { message: `Model error: ${errText}` })
          send('done', {})
          controller.close()
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let thinkingEmitted = false
        let thinkingBuffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data: ')) continue
            const data = trimmed.slice(6)
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }
              const chunk: string = parsed.choices?.[0]?.delta?.content ?? ''
              if (!chunk) continue

              if (!thinkingEmitted) {
                thinkingBuffer += chunk
                const thinkMatch = thinkingBuffer.match(/^\[THINKING\]\s*([^\n]+)/)
                if (thinkMatch) {
                  send('thinking', { text: `\uD83D\uDCAD ${thinkMatch[1].trim()}` })
                  thinkingEmitted = true
                  const afterThinking = thinkingBuffer.replace(/^\[THINKING\][^\n]*\n?/, '')
                  if (afterThinking) send('delta', { content: afterThinking })
                } else if (thinkingBuffer.length > 120 || thinkingBuffer.includes('---FILE:')) {
                  thinkingEmitted = true
                  send('thinking', { text: '\u26a1 Writing code\u2026' })
                  send('delta', { content: thinkingBuffer })
                }
                continue
              }

              send('delta', { content: chunk })
            } catch {}
          }
        }

        send('done', {})
        controller.close()

        if (userId) {
          query(
            `INSERT INTO user_sessions (user_id, last_seen_at, session_count)
             VALUES ($1, NOW(), 1)
             ON CONFLICT (user_id) DO UPDATE
               SET last_seen_at = NOW(), session_count = user_sessions.session_count + 1`,
            [userId]
          ).catch(() => {})
        }
      } catch (err) {
        console.error('/api/build error:', err)
        try {
          controller.enqueue(encoder.encode(sseEvent('error', { message: String(err) })))
          controller.enqueue(encoder.encode(sseEvent('done', {})))
          controller.close()
        } catch {}
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
