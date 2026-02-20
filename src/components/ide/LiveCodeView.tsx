"use client"

import { useEffect, useRef } from "react"
import { useAppStore } from "@/store/appStore"
import { Code, Loader2, CheckCircle, FileCode } from "lucide-react"

export function LiveCodeView() {
  const { liveCode, isExecuting, liveCodeFiles } = useAppStore()
  const codeRef = useRef<HTMLPreElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom as code streams in
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [liveCode])

  return (
    <div className="h-full flex flex-col bg-[#0d0d0d]">
      {/* Status bar — like MiniMax "Ongoing → File Writing" */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-hive-border bg-hive-700 shrink-0">
        <div className="flex items-center gap-2">
          {isExecuting ? (
            <>
              <div className="relative flex items-center justify-center">
                <Loader2 size={14} className="text-honey-500 animate-spin" />
              </div>
              <span className="text-xs font-medium text-honey-500">Ongoing</span>
              <span className="text-text-muted text-xs">→</span>
              <div className="flex items-center gap-1.5">
                <FileCode size={12} className="text-blue-400" />
                <span className="text-xs text-blue-400 font-medium">File Writing</span>
              </div>
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            </>
          ) : (
            <>
              <CheckCircle size={14} className="text-green-400" />
              <span className="text-xs font-medium text-green-400">Complete</span>
            </>
          )}
        </div>

        {/* File creation indicators */}
        {liveCodeFiles.length > 0 && (
          <div className="flex items-center gap-1.5 ml-auto">
            {liveCodeFiles.map((f) => (
              <span
                key={f}
                className="text-[10px] px-1.5 py-0.5 rounded bg-hive-surface text-text-secondary border border-hive-border"
              >
                {f}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Full-height scrolling code area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
      >
        {liveCode ? (
          <div className="flex min-h-full">
            {/* Line numbers */}
            <div className="shrink-0 w-12 bg-[#0a0a0a] border-r border-hive-border/50 select-none sticky left-0">
              <div className="py-3 px-1">
                {liveCode.split("\n").map((_, i) => (
                  <div
                    key={i}
                    className="text-[11px] text-text-muted/40 text-right pr-2 leading-[20px] font-mono h-[20px]"
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>

            {/* Code content */}
            <pre
              ref={codeRef}
              className="flex-1 p-3 text-[12px] font-mono leading-[20px] text-text-secondary whitespace-pre-wrap break-all selection:bg-honey-500/20"
            >
              {liveCode}
              {isExecuting && (
                <span className="inline-block w-[2px] h-[14px] bg-honey-500 animate-pulse ml-[1px] align-middle" />
              )}
            </pre>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-text-muted p-8">
            <Code size={28} className="mb-3 text-honey-500/30" />
            <p className="text-sm font-medium text-text-secondary mb-1">Live Code</p>
            <p className="text-xs text-center">Code will stream here as the AI writes it</p>
          </div>
        )}
      </div>
    </div>
  )
}
