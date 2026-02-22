"use client"

import { useState, useEffect, useRef } from "react"
import { useAppStore } from "@/store/appStore"
import { useWebContainer } from "@/hooks/useWebContainer"
import { FileExplorer } from "@/components/ide/FileExplorer"
import { CodeEditor } from "@/components/ide/CodeEditor"
import { Preview } from "@/components/ide/Preview"
import { LiveCodeView } from "@/components/ide/LiveCodeView"
import { Terminal } from "@/components/ide/Terminal"
import { Download, ChevronLeft, ChevronRight } from "lucide-react"

export function IDEPanelInner() {
  const {
    ideOpen, ideTab, isExecuting, liveCode, files,
    setIdeTab, containerStatus,
  } = useAppStore()
  const { runProject } = useWebContainer()
  const [showExplorer, setShowExplorer] = useState(true)
  const hasTriedWC = useRef(false)

  // Auto-run WebContainer when a package.json project lands
  useEffect(() => {
    const hasPkg = files.some(f => f.name === 'package.json')
    if (hasPkg && !isExecuting && containerStatus === 'idle' && !hasTriedWC.current) {
      hasTriedWC.current = true
      runProject(files).then((launched) => {
        if (launched) setIdeTab('terminal')
      })
    }
    if (files.length === 0) hasTriedWC.current = false
  }, [files, isExecuting, containerStatus, runProject, setIdeTab])

  // Listen for BuildCard "Open Preview" button → switch to process tab
  useEffect(() => {
    const handler = () => {
      setIdeTab('process')
      // If IDE is closed this won't fire (ideOpen check), but setIdeTab is harmless
    }
    window.addEventListener('sparkie:open-preview', handler)
    return () => window.removeEventListener('sparkie:open-preview', handler)
  }, [setIdeTab])

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
    { id: 'process',  label: 'Process'  },
    { id: 'files',    label: 'Files'    },
    { id: 'terminal', label: 'Terminal' },
  ] as const

  const wcDot =
    containerStatus === 'ready'  ? 'bg-[#22c55e]' :
    containerStatus === 'error'  ? 'bg-[#ef4444]' :
    containerStatus === 'idle'   ? 'bg-[#374151]' : 'bg-[#f59e0b]'

  return (
    <div className="h-full flex flex-col bg-hive-600 border-l border-hive-border">
      {/* Header */}
      <div className="flex items-center h-10 px-3 bg-hive-700 border-b border-hive-border shrink-0 gap-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setIdeTab(t.id)}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors
              ${ideTab === t.id ? 'bg-hive-500 text-text-primary' : 'text-text-muted hover:text-text-secondary hover:bg-hive-hover'}`}>
            {t.id === 'terminal' && (
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${wcDot}
                ${!['idle','ready','error'].includes(containerStatus) ? 'animate-pulse' : ''}`} />
            )}
            {t.label}
            {t.id === 'terminal' && containerStatus === 'ready' && (
              <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20">Live</span>
            )}
          </button>
        ))}
        <div className="ml-auto">
          {files.length > 0 && (
            <button onClick={downloadAll} className="p-1 rounded hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors" title="Download all">
              <Download size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Panels */}
      <div className="flex-1 overflow-hidden">
        {ideTab === 'process' && (
          <div className="h-full">
            {isExecuting ? <LiveCodeView /> : <Preview />}
          </div>
        )}

        {ideTab === 'files' && (
          <div className="h-full flex overflow-hidden relative">
            {showExplorer && (
              <div className="w-48 shrink-0 border-r border-hive-border overflow-y-auto">
                <FileExplorer />
              </div>
            )}
            <div className="flex-1 overflow-hidden flex flex-col">
              <button onClick={() => setShowExplorer(v => !v)}
                className="absolute top-1 left-0 p-0.5 bg-hive-700 border border-hive-border rounded-r text-text-muted hover:text-text-secondary z-10 transition-colors">
                {showExplorer ? <ChevronLeft size={12}/> : <ChevronRight size={12}/>}
              </button>
              <CodeEditor />
            </div>
          </div>
        )}

        {ideTab === 'terminal' && (
          <div className="h-full">
            <Terminal />
          </div>
        )}
      </div>
    </div>
  )
}
