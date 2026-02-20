"use client"

import { useEffect, useRef } from "react"
import { useAppStore } from "@/store/appStore"
import { Code, FileCode } from "lucide-react"

/**
 * Sparkie Status System
 *   🟢 Green  pulsing — Active:   code is streaming / files being written
 *   🟡 Amber  pulsing — Thinking: model processing, no output yet
 *   🔴 Red    solid   — Complete: generation finished (offline/done state)
 */
function SparkieStatusDot({ state }: { state: "active" | "thinking" | "complete" }) {
  const colors = {
    active:   "bg-[#22c55e]",
    thinking: "bg-[#f59e0b]",
    complete: "bg-[#ef4444]",
  }
  const pulse = state === "active" || state === "thinking"
  return (
    <span className="relative flex items-center justify-center w-2.5 h-2.5">
      {pulse && (
        <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${colors[state]}`} />
      )}
      <span className={`relative inline-flex rounded-full w-2 h-2 ${colors[state]}`} />
    </span>
  )
}

export function LiveCodeView() {
  const { liveCode, isExecuting, liveCodeFiles } = useAppStore()
  const containerRef = useRef<HTMLDivElement>(null)

  const status: "active" | "thinking" | "complete" =
    !isExecuting ? "complete"
    : liveCode.length > 0 ? "active"
    : "thinking"

  const statusLabel = { active: "Active", thinking: "Thinking", complete: "Complete" }[status]
  const statusColor = {
    active:   "text-[#22c55e]",
    thinking: "text-[#f59e0b]",
    complete: "text-[#ef4444]",
  }[status]

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [liveCode])

  return (
    <div className="h-full flex flex-col bg-[#0d0d0d]">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-hive-border bg-hive-700 shrink-0">
        <div className="flex items-center gap-2">
          <SparkieStatusDot state={status} />
          <span className={`text-xs font-semibold ${statusColor}`}>{statusLabel}</span>
          {isExecuting && (
            <>
              <span className="text-text-muted text-xs">→</span>
              <div className="flex items-center gap-1.5">
                <FileCode size={12} className="text-text-secondary" />
                <span className="text-xs text-text-secondary font-medium">File Writing</span>
              </div>
            </>
          )}
        </div>
        {liveCodeFiles.length > 0 && (
          <div className="flex items-center gap-1.5 ml-auto">
            {liveCodeFiles.map((f) => (
              <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-honey-500/10 text-honey-500 border border-honey-500/20">
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
      <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        {liveCode ? (
          <div className="flex min-h-full">
            <div className="shrink-0 w-12 bg-[#0a0a0a] border-r border-hive-border/30 select-none">
              <div className="py-3 px-1">
                {liveCode.split("\n").map((_, i) => (
                  <div key={i} className="text-[11px] text-text-muted/30 text-right pr-2 leading-[20px] font-mono h-[20px]">
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>
            <pre className="flex-1 p-3 text-[12px] font-mono leading-[20px] text-text-secondary whitespace-pre-wrap break-all selection:bg-honey-500/20">
              {liveCode}
              {isExecuting && (
                <span className="inline-block w-[2px] h-[14px] bg-[#22c55e] animate-pulse ml-[1px] align-middle" />
              )}
            </pre>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-text-muted p-8">
            <Code size={28} className="mb-3 text-honey-500/30" />
            <p className="text-sm font-medium text-text-secondary mb-1">Live Code</p>
            <p className="text-xs text-center">Code will stream here as Sparkie writes it</p>
          </div>
        )}
      </div>
    </div>
  )
}
