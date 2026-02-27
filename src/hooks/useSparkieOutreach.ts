'use client'

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store/appStore'

// Polls /api/agent every 60s when tab is focused.
// On trigger, injects a proactive Sparkie message into the active chat.
export function useSparkieOutreach(enabled: boolean) {
  const lastTriggerRef = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!enabled) return

    const poll = async () => {
      if (document.hidden) return

      try {
        const now = new Date()
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentHour: now.getHours() }),
        })
        if (!res.ok) return
        const data = await res.json() as {
          trigger: boolean
          type: string | null
          // task_completed
          tasks?: Array<{ id: string; label: string; result: string }>
          // inbox_check
          newCount?: number
          senders?: string[]
          subjects?: string[]
          // morning_brief
          calendarEvents?: Array<{ summary: string; start: string; end: string }>
          calendarConflicts?: Array<{ a: string; b: string; time: string }>
          // checkin
          daysSince?: number
          memoryHints?: string
          // shared
          pendingTasks?: Array<{ id: string; label: string; created_at: string }>
        }

        // Always surface pending human tasks (even without a proactive trigger)
        if (data.pendingTasks?.length && !data.trigger) {
          const store = useAppStore.getState()
          const pendingKey = 'pending_tasks_' + now.toDateString()
          if (lastTriggerRef.current !== pendingKey) {
            lastTriggerRef.current = pendingKey
            // Surface pending tasks silently in worklog
            store.addWorklogEntry({
              type: 'action',
              content: data.pendingTasks.length + ' task(s) awaiting your approval in the Tasks tab',
            })
          }
        }

        if (!data.trigger || !data.type) return

        // Deduplicate per day
        const triggerKey = data.type + '_' + now.toDateString()
        if (lastTriggerRef.current === triggerKey) return
        lastTriggerRef.current = triggerKey

        // Ensure chat is open
        const store = useAppStore.getState()
        let chatId = store.currentChatId
        if (!chatId) {
          chatId = store.createChat()
          store.setCurrentChat(chatId)
        }

        // Build proactive nudge
        let nudge = ''

        if (data.type === 'task_completed' && data.tasks?.length) {
          const taskSummary = data.tasks.map((t) => '- ' + t.label + ': ' + t.result.slice(0, 150)).join('\n')
          nudge = '[SPARKIE_PROACTIVE: task_completed] You just autonomously completed the following tasks while the user was away:\n' + taskSummary + '\n\nBriefly tell them what you did. Keep it concise and confident — you got things done.'
        } else if (data.type === 'inbox_check' && (data.newCount ?? 0) > 0) {
          const senderList = (data.senders ?? []).join(', ')
          const subjectList = (data.subjects ?? []).slice(0, 3).map((s) => '"' + s + '"').join(', ')
          nudge = '[SPARKIE_PROACTIVE: inbox_check] The user has ' + (data.newCount ?? 0) + ' new email(s) from: ' + senderList + '. Subject(s): ' + subjectList + '.\n\nTell them about their new emails. Ask if they want you to triage, draft replies, or handle anything. Keep it short.'
        } else if (data.type === 'morning_brief') {
          const conflicts = data.calendarConflicts ?? []
          const pending = data.pendingTasks ?? []
          const conflictNote = conflicts.length > 0
            ? '\n\nCalendar conflicts today: ' + conflicts.map((c) => c.a + ' overlaps ' + c.b + ' at ' + c.time).join('; ')
            : ''
          const pendingNote = pending.length > 0
            ? '\n\nPending tasks needing your approval: ' + pending.map((t) => t.label).join(', ')
            : ''
          nudge = '[SPARKIE_PROACTIVE: morning_brief] The user has just opened the studio for the first time today. Give them your full morning brief — warm welcome, something motivating, a question about their day.' + conflictNote + pendingNote + '\n\nMake it feel alive, not a report. If there are conflicts or pending tasks, mention them naturally.'
        } else if (data.type === 'checkin') {
          const days = data.daysSince ?? 3
          const hints = data.memoryHints ? '\n\nWhat you remember about them: ' + data.memoryHints : ''
          nudge = '[SPARKIE_PROACTIVE: checkin] The user has been away for ' + days + ' days. Reach out genuinely — you missed them. Reference something you remember. Ask what they\'ve been up to. Keep it warm and short, not a big announcement.' + hints
        }

        if (!nudge) return

        // Add hidden trigger + streaming response
        const triggerMsgId = store.addMessage(chatId, { role: 'user', content: nudge, type: 'text' })
        const aiMsgId = store.addMessage(chatId, { role: 'assistant', content: '', isStreaming: true, model: store.selectedModel })

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
      } catch { /* network error, silent */ }
    }

    // Fire once 30s after mount (session settle), then every 60s
    const initialTimer = setTimeout(poll, 30_000)
    timerRef.current = setInterval(poll, 60_000)

    return () => {
      clearTimeout(initialTimer)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [enabled])
}
