"use client"

import { useCallback } from "react"
import { useAppStore, FileNode, findNodeById, flattenFileTree } from "@/store/appStore"
import { useE2B } from "@/hooks/useE2B"
import { File, Download, Play, Square, RotateCcw } from "lucide-react"

// Languages that can be executed via E2B
const RUNNABLE_LANGUAGES = new Set(["python", "javascript", "typescript", "js", "ts", "py"])

// Framework/config files that should NOT show a Run button even though they're .ts/.js
// These are project files, not executable scripts
const NON_RUNNABLE_NAMES = new Set([
  "layout.tsx", "layout.ts",
  "page.tsx", "page.ts",
  "loading.tsx", "error.tsx", "not-found.tsx", "template.tsx",
  "middleware.ts", "middleware.js",
  "vite.config.ts", "vite.config.js",
  "next.config.ts", "next.config.js", "next.config.mjs",
  "tailwind.config.ts", "tailwind.config.js",
  "postcss.config.js", "postcss.config.ts",
  "tsconfig.json", "package.json", ".eslintrc.js",
  "globals.css", "index.css",
])

function isEntryPoint(name: string): boolean {
  const base = name.split("/").pop() ?? name
  // Strip path prefix and check if it's an entry/script file
  const ENTRY_NAMES = new Set([
    "index.ts", "index.js", "index.tsx", "index.jsx",
    "main.ts", "main.js", "main.tsx", "main.jsx",
    "server.ts", "server.js",
    "app.ts", "app.js",
    "cli.ts", "cli.js",
    "run.ts", "run.js",
    "script.ts", "script.js",
  ])
  return ENTRY_NAMES.has(base) || name.endsWith(".py")
}

function isRunnable(language?: string, name?: string): boolean {
  if (!language || !RUNNABLE_LANGUAGES.has(language.toLowerCase())) return false
  if (!name) return false
  const base = name.split("/").pop() ?? name
  if (NON_RUNNABLE_NAMES.has(base)) return false
  // For .ts/.tsx/.js/.jsx — only show Run on entry points or scripts
  // Python files are always runnable
  if (language.toLowerCase() === "python") return true
  return isEntryPoint(name)
}

export function CodeEditor() {
  const { files, activeFileId, updateFileContent, setActiveFile } = useAppStore()
  const { runCode, cancel, resetSession, status } = useE2B()
  const activeFile = activeFileId ? findNodeById(files, activeFileId) : undefined
  const isRunning = status === "running"

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (activeFileId) updateFileContent(activeFileId, e.target.value)
    },
    [activeFileId, updateFileContent]
  )

  const downloadFile = () => {
    if (!activeFile?.content) return
    const blob = new Blob([activeFile.content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = activeFile.name; a.click()
    URL.revokeObjectURL(url)
  }

  const handleRun = () => {
    if (!activeFile?.content) return
    const lang = activeFile.language?.toLowerCase() ?? "python"
    const normalizedLang =
      lang === "py" ? "python" :
      lang === "js" ? "javascript" :
      lang === "ts" ? "typescript" : lang
    runCode(activeFile.content, normalizedLang)
  }

  if (!activeFile) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted p-8">
        <File size={24} className="mb-2 text-honey-500/40" />
        <p className="text-xs">Select a file to edit</p>
      </div>
    )
  }

  const canRun = isRunnable(activeFile.language, activeFile.name)

  return (
    <div className="h-full flex flex-col">
      {/* File tabs */}
      <div className="flex items-center h-8 border-b border-hive-border bg-hive-700 px-1 shrink-0">
        {flattenFileTree(files).filter(f => f.type === "file").map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFile(f.id)}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-t transition-colors ${
              f.id === activeFileId
                ? "bg-hive-600 text-honey-500 border border-hive-border border-b-0"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {f.name}
          </button>
        ))}
      </div>

      {/* File header */}
      <div className="flex items-center justify-between h-7 px-3 bg-hive-700/50 border-b border-hive-border shrink-0">
        <span className="text-[11px] text-text-secondary">{activeFile.name}</span>
        <div className="flex items-center gap-1">
          {canRun && (
            <button
              onClick={resetSession}
              title="Reset sandbox (fresh environment)"
              className="p-0.5 rounded hover:bg-hive-hover text-text-muted hover:text-honey-500 transition-colors"
            >
              <RotateCcw size={11} />
            </button>
          )}
          {canRun && (
            isRunning ? (
              <button
                onClick={cancel}
                title="Stop execution"
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
              >
                <Square size={9} />
                Stop
              </button>
            ) : (
              <button
                onClick={handleRun}
                title="Run with E2B sandbox"
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-honey-500/10 text-honey-500 border border-honey-500/20 hover:bg-honey-500/20 transition-colors"
              >
                <Play size={9} className="fill-honey-500" />
                Run
              </button>
            )
          )}
          <button onClick={downloadFile} className="p-0.5 rounded hover:bg-hive-hover text-text-muted hover:text-text-secondary">
            <Download size={12} />
          </button>
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-10 bg-hive-700 border-r border-hive-border overflow-hidden select-none">
          <div className="pt-3 px-1">
            {(activeFile.content || "").split("\n").map((_, i) => (
              <div key={i} className="text-[11px] text-text-muted text-right pr-2 leading-[20px] font-mono">{i + 1}</div>
            ))}
          </div>
        </div>
        <textarea
          value={activeFile.content || ""}
          onChange={handleChange}
          spellCheck={false}
          className="w-full h-full bg-transparent text-[13px] text-text-primary font-mono leading-[20px] p-3 pl-12 resize-none focus:outline-none overflow-auto whitespace-pre"
          style={{ tabSize: 2 }}
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between h-6 px-3 bg-hive-700 border-t border-hive-border text-[10px] text-text-muted shrink-0">
        <div className="flex items-center gap-2">
          <span>{activeFile.language || "plaintext"}</span>
          {isRunning && (
            <span className="text-honey-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-honey-500 animate-pulse inline-block" />
              Running…
            </span>
          )}
          {status === "done" && !isRunning && (
            <span className="text-[#22c55e]">✓ Done</span>
          )}
          {status === "error" && !isRunning && (
            <span className="text-[#ef4444]">✗ Error</span>
          )}
        </div>
        <span>{(activeFile.content || "").split("\n").length} lines</span>
      </div>
    </div>
  )
}
