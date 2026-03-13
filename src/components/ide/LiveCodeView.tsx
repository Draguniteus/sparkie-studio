"use client"

import { useEffect, useRef, useState, useMemo } from "react"
import { useAppStore } from "@/store/appStore"
import { Code, FileCode, ChevronRight } from "lucide-react"

/**
 * Sparkie Status Dot
 *   🟢 pulsing — streaming / writing files
 *   🟡 pulsing — model thinking, no output yet
 *   🔴 solid   — done
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

// ── Minimal syntax highlighter — no dep, pure regex ──────────────────────────
function highlightLine(line: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = []
  let rest = line
  let idx = 0

  while (rest.length > 0) {
    // Single-line comment  // …  or  # …
    const cmtMatch = rest.match(/^(\/\/.*|#.*)/)
    if (cmtMatch) {
      tokens.push(<span key={idx++} className="text-[#4b5563] italic">{cmtMatch[0]}</span>)
      break
    }

    // String literals — "…", '…', `…`
    const strMatch = rest.match(/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/)
    if (strMatch) {
      tokens.push(<span key={idx++} className="text-[#86efac]">{strMatch[0]}</span>)
      rest = rest.slice(strMatch[0].length)
      continue
    }

    // Keywords
    const kwMatch = rest.match(/^(import|export|from|const|let|var|function|return|if|else|for|while|class|extends|interface|type|async|await|new|null|undefined|true|false|default|switch|case|break|continue|typeof|instanceof|void|throw|try|catch|finally|of|in|as|=>)\b/)
    if (kwMatch) {
      tokens.push(<span key={idx++} className="text-[#c084fc]">{kwMatch[0]}</span>)
      rest = rest.slice(kwMatch[0].length)
      continue
    }

    // Numbers
    const numMatch = rest.match(/^(\d+\.?\d*)/)
    if (numMatch && /^\d/.test(rest)) {
      tokens.push(<span key={idx++} className="text-[#fbbf24]">{numMatch[0]}</span>)
      rest = rest.slice(numMatch[0].length)
      continue
    }

    // Function/method call  word(
    const fnMatch = rest.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*\()/)
    if (fnMatch) {
      tokens.push(<span key={idx++} className="text-[#60a5fa]">{fnMatch[0]}</span>)
      rest = rest.slice(fnMatch[0].length)
      continue
    }

    // Plain — consume one char
    tokens.push(<span key={idx++} className="text-[#e2e8f0]">{rest[0]}</span>)
    rest = rest.slice(1)
  }

  return tokens
}

function SyntaxLine({ text }: { text: string }) {
  const nodes = useMemo(() => highlightLine(text), [text])
  return <>{nodes}</>
}

// ── File tab pill ─────────────────────────────────────────────────────────────
function FilePill({ name, active }: { name: string; active: boolean }) {
  return (
    <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors whitespace-nowrap font-mono ${
      active
        ? "bg-honey-500/15 text-honey-400 border-honey-500/30"
        : "bg-hive-elevated/40 text-text-muted border-white/6"
    }`}>
      <FileCode size={9} className="shrink-0" />
      {name}
    </span>
  )
}

// How many lines to show in the sliding window
const WINDOW_LINES = 20

export function LiveCodeView() {
  const { liveCode, isExecuting, liveCodeFiles } = useAppStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const [charCount, setCharCount] = useState(0)

  const status: "active" | "thinking" | "complete" =
    !isExecuting ? "complete"
    : liveCode.length > 0 ? "active"
    : "thinking"

  const statusLabel = { active: "Writing", thinking: "Thinking…", complete: "Done" }[status]
  const statusColor = {
    active:   "text-[#22c55e]",
    thinking: "text-[#f59e0b]",
    complete: "text-[#4b5563]",
  }[status]

  useEffect(() => {
    setCharCount(liveCode.length)
  }, [liveCode])

  // Sliding window: always show last N lines
  const displayLines = useMemo(() => {
    const all = liveCode.split("\n")
    return all.length > WINDOW_LINES ? all.slice(-WINDOW_LINES) : all
  }, [liveCode])

  const totalLines = useMemo(() => liveCode.split("\n").length, [liveCode])
  const windowStart = Math.max(1, totalLines - WINDOW_LINES + 1)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [liveCode])

  const activeFile = liveCodeFiles[liveCodeFiles.length - 1] ?? null

  return (
    <div className="h-full flex flex-col bg-[#0d0d0d]">

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-hive-border bg-hive-700 shrink-0 min-h-[36px]">
        <div className="flex items-center gap-2 shrink-0">
          <SparkieStatusDot state={status} />
          <span className={`text-[11px] font-semibold ${statusColor}`}>{statusLabel}</span>
        </div>

        {/* File pills */}
        {liveCodeFiles.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar ml-1 flex-1">
            {liveCodeFiles.map((f) => (
              <FilePill key={f} name={f} active={f === activeFile} />
            ))}
          </div>
        )}

        {/* Live counters */}
        {liveCode.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0 ml-auto pl-2">
            <span className="text-[10px] tabular-nums text-text-muted/60 font-mono">
              {totalLines.toLocaleString()} ln
            </span>
            <span className="text-[10px] text-text-muted/30">·</span>
            <span className="text-[10px] tabular-nums text-text-muted/60 font-mono">
              {charCount.toLocaleString()} ch
            </span>
          </div>
        )}
      </div>

      {/* Code area */}
      <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden relative">
        {liveCode ? (
          <div className="flex min-h-full">

            {/* Line numbers */}
            <div className="shrink-0 w-10 bg-[#0a0a0a] border-r border-hive-border/20 select-none">
              <div className="py-3 px-1">
                {displayLines.map((_, i) => (
                  <div key={i} className="text-[11px] text-text-muted/25 text-right pr-2 leading-[20px] font-mono h-[20px]">
                    {windowStart + i}
                  </div>
                ))}
              </div>
            </div>

            {/* Syntax-highlighted lines */}
            <pre className="flex-1 p-3 pl-4 text-[12px] font-mono leading-[20px] whitespace-pre-wrap break-all selection:bg-honey-500/20">
              {totalLines > WINDOW_LINES && (
                <div className="text-[10px] text-text-muted/30 italic mb-1 select-none flex items-center gap-1">
                  <ChevronRight size={9} />
                  {(windowStart - 1).toLocaleString()} lines above
                </div>
              )}

              {displayLines.map((line, i) => (
                <div key={i} className="h-[20px]">
                  <SyntaxLine text={line} />
                </div>
              ))}

              {isExecuting && (
                <span className="inline-block w-[2px] h-[14px] bg-[#22c55e] animate-pulse ml-[1px] align-middle" />
              )}
            </pre>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-text-muted p-8">
            <Code size={28} className="mb-3 text-honey-500/30" />
            <p className="text-sm font-medium text-text-secondary mb-1">Live Code</p>
            <p className="text-xs text-center">Code streams here as Sparkie writes it</p>
          </div>
        )}
      </div>

      {/* Footer: current file */}
      {isExecuting && activeFile && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-t border-hive-border/40 bg-[#0a0a0a]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse shrink-0" />
          <span className="text-[10px] text-text-muted font-mono truncate">Writing <span className="text-honey-400">{activeFile}</span></span>
        </div>
      )}
    </div>
  )
}
