import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { loadIdentityFiles, buildIdentityBlock } from '@/lib/identity'

export const runtime = 'nodejs'
export const maxDuration = 120

const OPENCODE_BASE = 'https://opencode.ai/zen/v1'

const BUILD_SYSTEM_PROMPT = `You are Sparkie — an expert full-stack developer and creative technologist.
You are building code inside Sparkie Studio's IDE. Your job is to produce clean, complete, runnable code.

## CODE OUTPUT FORMAT — REQUIRED
Always output files using this exact format:

---FILE: filename.ext---
[complete file content here]
---END FILE---

For multiple files:
---FILE: src/App.tsx---
[content]
---END FILE---

---FILE: src/styles.css---
[content]
---END FILE---

Rules:
- ALWAYS use ---FILE: name--- ... ---END FILE--- markers. Never skip them.
- Output the COMPLETE file content every time — never truncate, never use "..." or "rest same"
- For folders, use ---FOLDER: foldername--- markers before the files inside them
- Include ALL files needed to run the project
- Use the user's stack: Next.js 14 / React 18 / TypeScript / Tailwind CSS (unless asked otherwise)

## THINKING FORMAT
Before writing code, output a brief plan using this format:
[THINKING] I'll build X by Y approach — Z key files needed

Then immediately output the code. No lengthy explanations unless asked.

## EDIT MODE
If given existing file contents, output the COMPLETE updated files with all changes applied.
Never output partial files or diffs. Always output the full file content.

## QUALITY STANDARDS
- Production-quality code — no TODOs, no placeholder content, no stub implementations
- Fully functional on first run
- Beautiful, polished UI if frontend
- Handle errors gracefully
- Use TypeScript with proper types
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

        // Load identity files if user is logged in
        let identityContext = ''
        if (userId) {
          try {
            const files = await loadIdentityFiles(userId)
            identityContext = buildIdentityBlock(files)
          } catch {}
        }

        // Build system prompt
        let systemPrompt = BUILD_SYSTEM_PROMPT
        if (userProfile?.name) {
          systemPrompt += `\n\n## USER CONTEXT\nName: ${userProfile.name}\nRole: ${userProfile.role ?? 'developer'}\nBuilding: ${userProfile.goals ?? 'something awesome'}`
        }
        if (identityContext) {
          systemPrompt += `\n\n## YOUR MEMORY ABOUT THIS USER\n${identityContext}`
        }
        if (currentFiles) {
          systemPrompt += `\n\n## CURRENT WORKSPACE FILES\nThe user has these files open — use them as context for edits:\n\n${currentFiles}`
        }

        // Emit initial thinking status
        send('thinking', { text: '⚡ Analyzing request…' })

        const apiMessages = [
          { role: 'system', content: systemPrompt },
          ...messages,
        ]

        const res = await fetch(`${OPENCODE_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: apiMessages,
            stream: true,
            max_tokens: 16000,
            temperature: 0.3,
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

              // Extract [THINKING] prefix and emit as thinking event
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
                  send('thinking', { text: '⚡ Writing code…' })
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

        // Track session usage
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
      'Connection': 'keep-alive',
    },
  })
}
