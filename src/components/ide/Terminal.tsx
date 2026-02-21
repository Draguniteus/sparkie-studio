"use client"

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store/appStore'
import { Terminal as TermIcon } from 'lucide-react'

export function Terminal() {
  const { terminalOutput, containerStatus, previewUrl } = useAppStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalOutput])

  const statusColor =
    containerStatus === 'ready'    ? 'text-[#22c55e]' :
    containerStatus === 'error'    ? 'text-[#ef4444]' :
    containerStatus === 'idle'     ? 'text-[#6b7280]' :
                                     'text-[#f59e0b]'

  const statusLabel: Record<string, string> = {
    idle: 'Idle', booting: 'Booting…', mounting: 'Mounting files…',
    installing: 'Installing packages…', starting: 'Starting dev server…',
    ready: 'Live', error: 'Error',
  }

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-hive-700 border-b border-hive-border shrink-0">
        <TermIcon size={11} className="text-text-muted" />
        <span className="text-[11px] text-text-muted">Terminal</span>
        <span className={`ml-auto text-[10px] font-medium ${statusColor}`}>
          {statusLabel[containerStatus] ?? containerStatus}
        </span>
        {previewUrl && (
          <a href={previewUrl} target="_blank" rel="noreferrer"
            className="text-[10px] px-1.5 py-0.5 rounded bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20 hover:bg-[#22c55e]/20 transition-colors">
            Open ↗
          </a>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3 font-mono text-[12px] leading-[18px]">
        {terminalOutput ? (
          <pre className="whitespace-pre-wrap break-words text-[#e2e8f0]">{terminalOutput}</pre>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-text-muted">
            <TermIcon size={28} className="mb-3 text-honey-500/30" />
            <p className="text-sm font-medium text-text-secondary mb-1">Terminal</p>
            <p className="text-xs text-center">
              Ask Sparkie to build a full-stack app with a{' '}
              <span className="text-honey-500">package.json</span> —
              <br/>npm install &amp; dev server start automatically
            </p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {previewUrl && (
        <div className="shrink-0 border-t border-hive-border bg-hive-700 p-2">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2 h-2 rounded-full bg-[#22c55e] inline-block" />
            <span className="text-[11px] text-[#22c55e] font-medium">Dev server live</span>
            <span className="text-[11px] text-text-muted ml-auto truncate max-w-[160px]">{previewUrl}</span>
          </div>
          <iframe src={previewUrl} className="w-full rounded border border-hive-border bg-white"
            style={{ height: '240px' }} title="Live Preview" />
        </div>
      )}
    </div>
  )
}
