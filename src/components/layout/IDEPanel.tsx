"use client"

import { useState, useEffect, useRef } from "react"
import { useAppStore } from "@/store/appStore"
import { useWebContainer } from "@/hooks/useWebContainer"
import { FileExplorer } from "@/components/ide/FileExplorer"
import { CodeEditor } from "@/components/ide/CodeEditor"
import { Preview } from "@/components/ide/Preview"
import { LiveCodeView } from "@/components/ide/LiveCodeView"
import { Terminal } from "@/components/ide/Terminal"
import { X, Download, Folder, TerminalSquare, ChevronLeft, ChevronRight } from "lucide-react"
import { getLanguageFromFilename, getFileSize } from "@/lib/fileParser"

export function IDEPanel() {
  const {
    ideOpen, ideTab, isExecuting, files,
    setIdeTab, openIDE, containerStatus, previewUrl,
  } = useAppStore()
  const { runProject } = useWebContainer()
  const [showExplorer, setShowExplorer] = useState(true)
  const hasTriedWC = useRef(false)

  // Auto-run WebContainer when new project files land (has package.json)
  useEffect(() => {
    const hasPkg = files.some(f => f.name === 'package.json')
    if (hasPkg && !isExecuting && containerStatus === 'idle' && !hasTriedWC.current) {
      hasTriedWC.current = true
      runProject(files).then((launched) => {
        if (launched) setIdeTab('terminal')
      })
    }
    // Reset flag if files cleared
    if (files.length === 0) hasTriedWC.current = false
  }, [files, isExecuting, containerStatus, runProject, setIdeTab])

  const downloadAll = () => {
    files.forEach(f => {
      const blob = new Blob([f.content], { type: 'text/plain' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = f.name.split('/').pop() || f.name
      a.click()
      URL.revokeObjectURL(a.href)
    })
  }

  if (!ideOpen) return null

  const tabs = [
    { id: 'process', label: 'Process' },
    { id: 'files',   label: 'Files'   },
    { id: 'terminal',label: 'Terminal'},
  ] as const

  const wcStatusColor =
    containerStatus === 'ready'  ? 'text-[#22c55e]' :
    containerStatus === 'error'  ? 'text-[#ef4444]' :
    containerStatus === 'idle'   ? 'text-text-muted'  : 'text-[#f59e0b]'

  const wcDot =
    containerStatus === 'ready'  ? 'bg-[#22c55e]' :
    containerStatus === 'error'  ? 'bg-[#ef4444]' :
    containerStatus === 'idle'   ? 'bg-[#374151]'   : 'bg-[#f59e0b]'

  return (
    <div className="h-full flex flex-col bg-hive-600 border-l border-hive-border">
      {/* Header */}
      <div className="flex items-center h-10 px-3 bg-hive-700 border-b border-hive-border shrink-0 gap-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setIdeTab(t.id)}
            className={`
              px-3 py-1 text-xs font-medium rounded transition-colors relative
              ${ideTab === t.id
                ? 'bg-hive-500 text-text-primary'
                : 'text-text-muted hover:text-text-secondary hover:bg-hive-hover'}
            `}
          >
            {t.id === 'terminal' && (
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${wcDot} ${
                !['idle','ready','error'].includes(containerStatus) ? 'animate-pulse' : ''
              }`} />
            )}
            {t.label}
            {t.id === 'terminal' && containerStatus === 'ready' && (
              <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20">Live</span>
            )}
          </button>
        ))}
        <div className="flex items-center gap-1 ml-auto">
          {files.length > 0 && (
            <button onClick={downloadAll} className="p-1 rounded hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors" title="Download all files">
              <Download size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">

        {/* ── Process tab ─────────────────────────────────────────── */}
        {ideTab === 'process' && (
          <div className="h-full">
            {isExecuting ? <LiveCodeView /> : <Preview />}
          </div>
        )}

        {/* ── Files tab ───────────────────────────────────────────── */}
        {ideTab === 'files' && (
          <div className="h-full flex overflow-hidden">
            {showExplorer && (
              <div className="w-48 shrink-0 border-r border-hive-border overflow-y-auto">
                <FileExplorer />
              </div>
            )}
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Toggle explorer */}
              <button
                onClick={() => setShowExplorer(v => !v)}
                className="absolute top-12 left-0 p-0.5 bg-hive-700 border border-hive-border rounded-r text-text-muted hover:text-text-secondary z-10 transition-colors"
              >
                {showExplorer ? <ChevronLeft size={12}/> : <ChevronRight size={12}/>}
              </button>
              <CodeEditor />
            </div>
          </div>
        )}

        {/* ── Terminal tab ─────────────────────────────────────────── */}
        {ideTab === 'terminal' && (
          <div className="h-full">
            <Terminal />
          </div>
        )}
      </div>
    </div>
  )
}
