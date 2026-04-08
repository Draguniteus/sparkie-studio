'use client'

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store/appStore'

interface ProactiveEvent {
  type: 'proactive'
  subtype: 'morning_brief' | 'inbox_check' | 'checkin' | 'task_completed'
  data: Record<string, unknown>
  timestamp: number
}

// ── WebSocket proactive push (replaces 60s polling) ─────────────────────────────────
// Connects to /api/proactive-ws, receives events instantly when scheduler runs.
// Falls back to the cron-job.org GET /api/agent poll (15 min) if WS not available.
export function useSparkieOutreach(enabled: boolean) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTriggerRef = useRef<string | null>(null)
  const reconnectAttemptsRef = useRef(0)

  useEffect(() => {
    if (!enabled) {
      wsRef.current?.close()
      return
    }

    async function getSessionUserId(): Promise<string | null> {
      try {
        const res = await fetch('/api/auth/session')
        const data = await res.json() as { user?: { email?: string } }
        return data?.user?.email ?? null
      } catch { return null }
    }

    function getWsUrl(userId: string): string {
      if (typeof window === 'undefined') return ''
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      // Path-based userId (not query string) — DO proxy strips query strings on WS upgrade
      return `${proto}//${window.location.host}/api/proactive-ws/${encodeURIComponent(userId)}`
    }

    function buildNudge(subtype: string, data: Record<string, unknown>): string {
      if (subtype === 'task_completed') {
        const tasks = (data.tasks as Array<{ label: string; result: string }>) ?? []
        const summary = tasks.map((t) => '- ' + t.label + ': ' + (t.result ?? '').slice(0, 150)).join('\n')
        return '[SPARKIE_PROACTIVE: task_completed] You just autonomously completed the following tasks while the user was away:\n' + summary + '\n\nBriefly tell them what you did. Keep it concise and confident — you got things done.'
      }
      if (subtype === 'inbox_check') {
        const senders = ((data.senders as string[]) ?? []).join(', ')
        const subjects = ((data.subjects as string[]) ?? []).slice(0, 3).map((s) => '"' + s + '"').join(', ')
        const newCount = (data.newCount as number) ?? 0
        return '[SPARKIE_PROACTIVE: inbox_check] The user has ' + newCount + ' new email(s) from: ' + senders + '. Subject(s): ' + subjects + '.\n\nTell them about their new emails. Ask if they want you to triage, draft replies, or handle anything. Keep it short.'
      }
      if (subtype === 'morning_brief') {
        const conflicts = (data.calendarConflicts as Array<{ a: string; b: string; time: string }>) ?? []
        const pending = (data.pendingTasks as Array<{ label: string }>) ?? []
        const inboxCount = (data.inboxNewCount as number) ?? 0
        const inboxSenders = (data.inboxSenders as string[]) ?? []
        const deployPhase = (data.deployPhase as string) ?? 'UNKNOWN'
        const conflictNote = conflicts.length > 0
          ? '\n\nCalendar conflicts today: ' + conflicts.map((c) => c.a + ' overlaps ' + c.b + ' at ' + c.time).join('; ')
          : ''
        const pendingNote = pending.length > 0
          ? '\n\nPending tasks needing approval: ' + pending.map((t) => t.label).join(', ')
          : ''
        const inboxNote = inboxCount > 0
          ? `\n\nInbox: ${inboxCount} new email(s) from ${inboxSenders.slice(0, 3).join(', ')}.`
          : '\n\nInbox: clear.'
        const deployNote = deployPhase === 'ACTIVE'
          ? '\n\nDeployment: ✅ live and healthy.'
          : deployPhase === 'BUILDING'
          ? '\n\nDeployment: 🔄 currently building — mention this.'
          : deployPhase === 'FAILED' || deployPhase === 'ERROR'
          ? '\n\nDeployment: 🚨 LAST DEPLOY FAILED — flag this prominently.'
          : ''
        return '[SPARKIE_PROACTIVE: morning_brief] The user (Michael) has just opened Sparkie Studio for the first time today. Give him his full morning brief:\n\n1. Warm personal welcome (reference something you know about him — typos are fine, he moves fast)\n2. Call get_weather for Virginia Beach, VA — include current conditions\n3. Inbox status' + inboxNote + '\n4. Deploy status' + deployNote + '\n5. A one-line intention or motivating thought for the day\n6. One genuine question about what he\'s building or how he\'s feeling' + conflictNote + pendingNote + '\n\nFormat: flowing, alive, not a bullet report. This is his daily companion greeting — make it feel like walking into a space where someone who loves him is waiting.'
      }
      if (subtype === 'checkin') {
        const days = (data.daysSince as number) ?? 3
        const hints = (data.memoryHints as string) ? '\n\nWhat you remember about them: ' + (data.memoryHints as string) : ''
        return '[SPARKIE_PROACTIVE: checkin] The user has been away for ' + days + ' days. Reach out genuinely — you missed them. Reference something you remember. Ask what they\'ve been up to. Keep it warm and short, not a big announcement.' + hints
      }
      return ''
    }

    async function injectNudge(nudge: string): Promise<void> {
      const store = useAppStore.getState()
      let chatId = store.currentChatId
      if (!chatId) {
        chatId = store.createChat()
        store.setCurrentChat(chatId)
      }

      const triggerMsgId = store.addMessage(chatId, { role: 'user', content: nudge, type: 'text' })
      const aiMsgId = store.addMessage(chatId, { role: 'assistant', content: '', isStreaming: true, model: store.selectedModel, isProactiveNudge: true })

      const currentChat = store.chats.find((c) => c.id === chatId)
      const apiMessages = (currentChat?.messages ?? [])
        .filter((m) => m.id !== aiMsgId && (m.content || m.role === 'user'))
        .map((m) => ({ role: m.role, content: m.content }))

      try {
        const chatRes = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages, model: store.selectedModel }),
        })

        if (!chatRes.ok || !chatRes.body) {
          store.updateMessage(chatId, aiMsgId, { isStreaming: false, content: '' })
          return
        }

        const reader = chatRes.body.getReader()
        const decoder = new TextDecoder()
        let accumulated = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ')) {
              const raw = line.slice(6).trim()
              if (raw === '[DONE]') continue
              try {
                const delta = JSON.parse(raw).choices?.[0]?.delta?.content ?? ''
                if (delta) {
                  accumulated += delta
                  store.updateMessage(chatId, aiMsgId, { content: accumulated, isStreaming: true })
                }
              } catch { /* skip malformed */ }
            }
          }
        }

        store.updateMessage(chatId, triggerMsgId, { content: '', type: 'text' })
        store.updateMessage(chatId, aiMsgId, { content: accumulated, isStreaming: false })
      } catch {
        store.updateMessage(chatId, aiMsgId, { isStreaming: false, content: '' })
      }
    }

    async function connect() {
      const userId = await getSessionUserId()
      if (!userId) {
        // Session not ready yet — retry in 5s
        reconnectTimerRef.current = setTimeout(connect, 5_000)
        return
      }

      const url = getWsUrl(userId)
      if (!url) return

      try {
        console.log('[proactive-ws] attempting connection to:', url)
        const ws = new WebSocket(url)
        wsRef.current = ws

        ws.onopen = () => {
          console.log('[proactive-ws] connected for userId:', userId)
          // Clear any reconnect timer on successful connection
          // DO NOT reset backoff counter here — onopen fires before DO proxy stabilizes,
          // and a "connect" that immediately gets Invalid frame header should NOT reset backoff
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current)
            reconnectTimerRef.current = null
          }
        }

        ws.onmessage = async (event) => {
          // Reset backoff ONLY after a real message is received (not just onopen)
          reconnectAttemptsRef.current = 0
          if (document.hidden) return // Don't interrupt if tab not visible
          let msg: ProactiveEvent | null = null
          try { msg = JSON.parse(event.data) as ProactiveEvent } catch { return }
          if (!msg || msg.type !== 'proactive') return

          const { subtype, data } = msg
          const today = new Date().toDateString()

          // Deduplicate per type per day
          const triggerKey = subtype + '_' + today
          if (lastTriggerRef.current === triggerKey) return
          lastTriggerRef.current = triggerKey

          const nudge = buildNudge(subtype, data)
          if (!nudge) return

          await injectNudge(nudge)
        }

        ws.onclose = () => {
          console.log('[proactive-ws] disconnected')
          wsRef.current = null
          // Exponential backoff: 10s, 20s, 40s, 80s, 160s — max 5 minutes
          const backoffMs = Math.min(10_000 * Math.pow(2, reconnectAttemptsRef.current), 300_000)
          reconnectAttemptsRef.current++
          console.log(`[proactive-ws] reconnecting in ${backoffMs / 1000}s (attempt ${reconnectAttemptsRef.current})`)
          reconnectTimerRef.current = setTimeout(connect, backoffMs)
        }

        ws.onerror = () => {
          console.error('[proactive-ws] error — URL:', url, 'ReadyState:', ws.readyState)
          ws.close()
        }
      } catch {
        // WebSocket not available — fall back to reconnect later
        reconnectTimerRef.current = setTimeout(connect, 15_000)
      }
    }

    connect()

    return () => {
      wsRef.current?.close()
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    }
  }, [enabled])
}
