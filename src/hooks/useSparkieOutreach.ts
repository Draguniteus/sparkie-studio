'use client'

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store/appStore'

// Polls /api/agent every 60s when tab is focused.
// On trigger, injects a proactive Sparkie message into the active chat.
export function useSparkieOutreach(enabled: boolean) {
  const { chats, currentChatId, addMessage, updateMessage, selectedModel, createChat, setCurrentChat } =
    useAppStore()
  const lastTriggerRef = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!enabled) return

    const poll = async () => {
      // Only fire when tab is visible
      if (document.hidden) return

      try {
        const now = new Date()
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentHour: now.getHours(),
          }),
        })
        if (!res.ok) return
        const data = await res.json() as {
          trigger: boolean
          type: string | null
          daysSince?: number
          memoryHints?: string
        }

        if (!data.trigger || !data.type) return

        // Deduplicate — don't fire the same trigger twice in the same browser session
        const triggerKey = `${data.type}_${now.toDateString()}`
        if (lastTriggerRef.current === triggerKey) return
        lastTriggerRef.current = triggerKey

        // Ensure there's an active chat
        const store = useAppStore.getState()
        let chatId = store.currentChatId
        if (!chatId) {
          chatId = store.createChat()
          store.setCurrentChat(chatId)
        }

        // Build the hidden system nudge for Sparkie
        let nudge = ''
        if (data.type === 'morning_brief') {
          nudge = '[SPARKIE_PROACTIVE: morning_brief] The user has just opened the studio for the first time today. Give them your full morning brief — warm welcome, weather, something motivating, a question about their life. Make it feel alive, not like a report.'
        } else if (data.type === 'checkin') {
          const days = data.daysSince ?? 3
          const hints = data.memoryHints ? `\n\nWhat you remember about them: ${data.memoryHints}` : ''
          nudge = `[SPARKIE_PROACTIVE: checkin] The user has been away for ${days} days. Reach out genuinely — you missed them. Reference something you remember. Ask what they've been up to. Keep it warm and short, not a big announcement.${hints}`
        }

        if (!nudge) return

        // Add a hidden trigger message (role: user, but invisible)
        // Then stream Sparkie's proactive response
        const triggerMsgId = store.addMessage(chatId, {
          role: 'user',
          content: nudge,
          // We use a special type so ChatView can optionally hide it
          type: 'text',
        })

        // Add Sparkie's streaming response placeholder
        const aiMsgId = store.addMessage(chatId, {
          role: 'assistant',
          content: '',
          isStreaming: true,
          model: store.selectedModel,
        })

        // Get full chat history up to this point
        const currentChat = store.chats.find(c => c.id === chatId)
        const messages = currentChat?.messages ?? []
        // Build messages array: all history + the nudge
        const apiMessages = messages
          .filter(m => m.id !== aiMsgId && (m.content || m.role === 'user'))
          .map(m => ({ role: m.role, content: m.content }))

        // Stream Sparkie's response
        try {
          const chatRes = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: apiMessages,
              model: store.selectedModel,
            }),
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
            const lines = chunk.split('\n')
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const raw = line.slice(6).trim()
                if (raw === '[DONE]') continue
                try {
                  const parsed = JSON.parse(raw)
                  const delta = parsed.choices?.[0]?.delta?.content ?? ''
                  if (delta) {
                    accumulated += delta
                    store.updateMessage(chatId, aiMsgId, {
                      content: accumulated,
                      isStreaming: true,
                    })
                  }
                } catch { /* skip malformed */ }
              }
            }
          }

          // Finalize
          // Remove the hidden trigger message
          store.updateMessage(chatId, triggerMsgId, { content: '', type: 'text' })
          store.updateMessage(chatId, aiMsgId, {
            content: accumulated,
            isStreaming: false,
          })
        } catch {
          store.updateMessage(chatId, aiMsgId, { isStreaming: false, content: '' })
        }
      } catch { /* network error, silent */ }
    }

    // Fire once shortly after mount (30s delay to let the session settle)
    const initialTimer = setTimeout(poll, 30_000)

    // Then every 60s
    timerRef.current = setInterval(poll, 60_000)

    return () => {
      clearTimeout(initialTimer)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [enabled])
}
