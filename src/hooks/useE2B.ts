"use client"

import { useCallback, useRef, useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { v4 as uuidv4 } from 'uuid'

export type E2BStatus = 'idle' | 'running' | 'done' | 'error'

export function useE2B() {
  const { appendTerminalOutput, clearTerminalOutput, setContainerStatus, setIdeTab } = useAppStore()
  const sessionIdRef = useRef<string>(uuidv4())
  const abortRef     = useRef<AbortController | null>(null)
  const [status, setStatus] = useState<E2BStatus>('idle')

  const runCode = useCallback(async (code: string, language = 'python') => {
    // Cancel any in-flight execution
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort

    clearTerminalOutput()
    setStatus('running')
    setContainerStatus('booting')
    setIdeTab('terminal')

    appendTerminalOutput(`[E2B] Running ${language} code\u2026\r\n`)

    try {
      const res = await fetch('/api/execute', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code, language, sessionId: sessionIdRef.current }),
        signal:  abort.signal,
      })

      if (!res.ok || !res.body) {
        const err = await res.text().catch(() => 'Unknown error')
        appendTerminalOutput(`[ERROR] ${err}\r\n`)
        setStatus('error')
        setContainerStatus('error')
        return
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buf     = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })

        // Parse SSE lines
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const { type, data } = JSON.parse(line.slice(6))
            switch (type) {
              case 'status':
                appendTerminalOutput(`[E2B] ${data}\r\n`)
                break
              case 'stdout':
                appendTerminalOutput(data.endsWith('\n') ? data : data + '\r\n')
                break
              case 'stderr':
                appendTerminalOutput(`\x1b[31m${data}\x1b[0m${data.endsWith('\n') ? '' : '\r\n'}`)
                break
              case 'result':
                appendTerminalOutput(`\r\n[RESULT]\r\n${data}\r\n`)
                break
              case 'image':
                appendTerminalOutput(`[CHART] Image output received (${Math.round(data.length * 0.75 / 1024)}KB)\r\n`)
                break
              case 'error':
                appendTerminalOutput(`\x1b[31m[ERROR] ${data}\x1b[0m\r\n`)
                setStatus('error')
                setContainerStatus('error')
                break
              case 'done':
                appendTerminalOutput(`\r\n[E2B] ${data}\r\n`)
                setStatus('done')
                setContainerStatus('ready')
                break
            }
          } catch {
            // Ignore malformed SSE events
          }
        }
      }

      setStatus('done')
      setContainerStatus('ready')
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        appendTerminalOutput('[E2B] Execution cancelled.\r\n')
        setStatus('idle')
        setContainerStatus('idle')
      } else {
        appendTerminalOutput(`[ERROR] ${String(err)}\r\n`)
        setStatus('error')
        setContainerStatus('error')
      }
    }
  }, [appendTerminalOutput, clearTerminalOutput, setContainerStatus, setIdeTab])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setStatus('idle')
    setContainerStatus('idle')
  }, [setContainerStatus])

  // Reset session (new sandbox on next run)
  const resetSession = useCallback(() => {
    sessionIdRef.current = uuidv4()
  }, [])

  return { runCode, cancel, resetSession, status }
}
