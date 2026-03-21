"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useAppStore, flattenFileTree } from "@/store/appStore"
import { isCDNCompatible } from "@/lib/cdnPreview"
import { useWebContainer } from "@/hooks/useWebContainer"
import { FileExplorer } from "@/components/ide/FileExplorer"
import { CodeEditor } from "@/components/ide/CodeEditor"
import { Preview } from "@/components/ide/Preview"
import { LiveCodeView } from "@/components/ide/LiveCodeView"
import { Terminal } from "@/components/ide/Terminal"
import { Download, ChevronLeft, ChevronRight, Brain } from "lucide-react"
import { TaskQueuePanel } from "@/components/ide/TaskQueuePanel"
import { MemoryTab } from "@/components/ide/MemoryTab"
import { RealScorePanel } from "@/components/ide/RealScorePanel"
import { ProcessTab } from "@/components/ide/ProcessTab"
import { TopicsPanel } from "@/components/ide/TopicsPanel"


const WORKLOG_FILTERS = ['all', 'thinking', 'action', 'result', 'error', 'code'] as const
type WorklogFilter = typeof WORKLOG_FILTERS[number]

function WorklogPanel() {
  const { worklog } = useAppStore()
  const [filter, setFilter] = useState<WorklogFilter>('all')
  const allEntries = [...worklog].reverse()
  const entries = filter === 'all' ? allEntries : allEntries.filter(e => e.type === filter)

  const typeConfig: Record<string, { icon: string; color: string; bg: string }> = {
    thinking: { icon: '🧠', color: 'text-text-muted', bg: 'bg-hive-elevated/40' },
    action:   { icon: '⚡', color: 'text-blue-400',   bg: 'bg-blue-500/5'       },
    result:   { icon: '✓',  color: 'text-green-400',  bg: 'bg-green-500/5'      },
    error:    { icon: '✕',  color: 'text-red-400',    bg: 'bg-red-500/5'        },
    code:     { icon: '{}', color: 'text-honey-500',  bg: 'bg-honey-500/5'      },
  }

  const filterCounts: Record<WorklogFilter, number> = {
    all: allEntries.length,
    thinking: allEntries.filter(e => e.type === 'thinking').length,
    action: allEntries.filter(e => e.type === 'action').length,
    result: allEntries.filter(e => e.type === 'result').length,
    error: allEntries.filter(e => e.type === 'error').length,
    code: allEntries.filter(e => e.type === 'code').length,
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-hive-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-purple-500/20 flex items-center justify-center"><Brain size={9} className="text-purple-400" /></div><span className="text-xs font-semibold text-text-primary">Sparkie's Brain</span></div>
          {allEntries.length > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          )}
        </div>
        <span className="text-[10px] text-text-muted">{entries.length}/{allEntries.length}</span>
      </div>
      {/* Type filters */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-hive-border/60 shrink-0 overflow-x-auto">
        {WORKLOG_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap transition-colors shrink-0 ${
              filter === f
                ? 'bg-honey-500/20 text-honey-400 border border-honey-500/30'
                : 'text-text-muted hover:text-text-secondary hover:bg-hive-hover border border-transparent'
            }`}
          >
            {f === 'all' ? `All ${filterCounts.all}` : `${typeConfig[f]?.icon ?? f} ${filterCounts[f]}`}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5 font-mono text-[11px]">
        {entries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-xs">
            {allEntries.length === 0 ? "Sparkie's activity appears here as she works" : `No ${filter} entries`}
          </div>
        ) : (
          entries.map((entry) => {
            const cfg = typeConfig[entry.type] ?? typeConfig.thinking
            const ts = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            return (
              <div key={entry.id} className={`flex items-start gap-2.5 px-3 py-2 rounded-lg ${cfg.bg} border border-white/4`}>
                <span className={`shrink-0 w-5 text-center ${cfg.color} text-[10px] mt-0.5`}>{cfg.icon}</span>
                <div className="flex-1 min-w-0">
                  <span className={`${cfg.color} break-words whitespace-pre-wrap leading-relaxed`}>{entry.content}</span>
                  {entry.status === 'running' && (
                    <span className="ml-1 inline-block w-1.5 h-3 bg-honey-500/60 animate-pulse rounded-sm" />
                  )}
                </div>
                <span className="shrink-0 text-text-muted text-[9px] tabular-nums pt-0.5">{ts}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export function IDEPanelInner() {
  const {
    ideOpen, ideTab, isExecuting, liveCode, files, buildKey,
    setIdeTab, containerStatus, clearTerminalOutput, appendTerminalOutput, setContainerStatus,
    worklog, previewUrl, activeProjectRoot,
  } = useAppStore()
  const { runProject } = useWebContainer()
  const [showExplorer, setShowExplorer] = useState(true)
  const lastRunKey = useRef(-1)

  // Detect backend-only Node/Express projects (no frontend bundler, no index.html)
  const isBackendProject = useCallback((fileList: typeof files): boolean => {
    const names = fileList.map(f => f.name)
    const contents = fileList.map(f => f.content ?? '').join('\n')
    const hasHtml   = names.some(n => n === 'index.html' || n.endsWith('/index.html'))
    const hasPkg    = names.some(n => n === 'package.json')
    const hasFrontend = /['"](react|vue|svelte|next|vite|@remix-run|astro)["',]/.test(contents)
    const hasBackend  = /['"](express|fastify|koa|hapi|@nestjs|http\.createServer)["',]/.test(contents)
    return hasPkg && !hasHtml && !hasFrontend && hasBackend
  }, [])

  // Auto-run when a package.json project lands
  useEffect(() => {
    if (lastRunKey.current === buildKey) return
    if (files.length === 0) { lastRunKey.current = -1; return }

    // ── WebContainer / E2B path ───────────────────────────────────────────────
    const flatFiles = flattenFileTree(files)
    const hasPkg = flatFiles.some(f => f.name === 'package.json' || f.name.endsWith('/package.json'))
    if (!hasPkg || isExecuting) return
    lastRunKey.current = buildKey

    // CDN-compatible projects are previewed instantly in-iframe — skip WC entirely
    // Must pass activeProjectRoot so multi-project stores check the RIGHT package.json
    if (isCDNCompatible(files, activeProjectRoot)) return

    if (isBackendProject(flatFiles)) {
      // Backend project — skip WebContainer, run in E2B via execute-project
      setIdeTab('terminal')
      clearTerminalOutput()
      appendTerminalOutput('[Sparkie] Backend project detected — starting E2B runner…\r\n')
      setContainerStatus('booting')

      const filePayload = flatFiles
        .filter(f => f.content)
        .map(f => ({ name: f.name, content: f.content! }))

      fetch('/api/execute-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: filePayload }),
      }).then(async (res) => {
        if (!res.ok || !res.body) {
          appendTerminalOutput('[ERROR] Failed to start E2B runner\r\n')
          setContainerStatus('error')
          return
        }
        const reader  = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n'); buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const { type, data } = JSON.parse(line.slice(6))
              if (type === 'stdout' || type === 'stderr') appendTerminalOutput(data.endsWith('\n') ? data : data + '\r\n')
              else if (type === 'status') appendTerminalOutput(`[E2B] ${data}\r\n`)
              else if (type === 'error') { appendTerminalOutput(`[ERROR] ${data}\r\n`); setContainerStatus('error') }
              else if (type === 'done')  { appendTerminalOutput(`[E2B] ${data}\r\n`); setContainerStatus('ready') }
            } catch {}
          }
        }
      }).catch((err) => {
        appendTerminalOutput(`[ERROR] ${String(err)}\r\n`)
        setContainerStatus('error')
      })
    } else {
      // Frontend project — use WebContainer as before
      runProject(files).then((launched) => {
        if (launched) setIdeTab('terminal')
      })
    }
  }, [files, buildKey, isExecuting, runProject, setIdeTab, isBackendProject,
      clearTerminalOutput, appendTerminalOutput, setContainerStatus, activeProjectRoot])

  // Listen for BuildCard "Open Preview" button → switch to preview tab
  useEffect(() => {
    const handler = () => {
      setIdeTab('preview')
    }
    window.addEventListener('sparkie:open-preview', handler)
    return () => window.removeEventListener('sparkie:open-preview', handler)
  }, [setIdeTab])

  // When WC server becomes ready, auto-switch to Preview tab
  // This is the MiniMax model: build runs in Process/Terminal, preview appears when server is live
  useEffect(() => {
    if (containerStatus === 'ready' && previewUrl) {
      setIdeTab('preview')
    }
  }, [containerStatus, previewUrl, setIdeTab])

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
    { id: 'preview',  label: 'Preview'  },
    { id: 'worklog',  label: 'Worklog'  },
    { id: 'memory',   label: 'Memory'   },
    { id: 'real',     label: 'REAL'     },
    { id: 'tasks',    label: 'Tasks'    },
    { id: 'topics',   label: 'Topics'   },
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
            className={`px-3 py-1 text-xs font-medium transition-colors rounded relative
              ${ideTab === t.id
                ? 'text-text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-honey-500 after:rounded-t bg-hive-500/40'
                : 'text-text-muted hover:text-text-secondary hover:bg-hive-hover'
              }`}>
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
        {ideTab === 'worklog' && (
          <WorklogPanel />
        )}
        {ideTab === 'memory' && (
          <MemoryTab />
        )}
        {ideTab === 'real' && (
          <RealScorePanel />
        )}
        {ideTab === 'tasks' && (
          <TaskQueuePanel />
        )}
        {ideTab === 'topics' && (
          <TopicsPanel />
        )}
        {ideTab === 'preview' && (
          <div className="h-full">
            <Preview />
          </div>
        )}

        {/* LiveCodeView shown during active builds */}
        {ideTab === 'process' && isExecuting && (
          <div className="h-full">
            <LiveCodeView />
          </div>
        )}
        {/* ProcessTab always mounted (like Terminal) so its sparkie_step_trace
            listener is always active — even when the user is on the worklog tab
            or Sparkie switches tabs during a response. Hidden via CSS only. */}
        <div className={`h-full ${ideTab === 'process' && !isExecuting ? '' : 'hidden'}`}>
          <ProcessTab />
        </div>

        {ideTab === 'files' && (
          <div className="h-full flex overflow-hidden">
            {/* File explorer — fixed width, full height */}
            <div className={`shrink-0 border-r border-hive-border overflow-hidden flex flex-col transition-all duration-200 ${showExplorer ? 'w-52' : 'w-0'}`}>
              {showExplorer && <FileExplorer />}
            </div>
            {/* Toggle sidebar button */}
            <div className="relative shrink-0">
              <button
                onClick={() => setShowExplorer(v => !v)}
                className="absolute top-2 -left-0 w-4 h-8 bg-hive-700 border border-hive-border rounded-r flex items-center justify-center text-text-muted hover:text-text-secondary z-10 transition-colors"
                title={showExplorer ? "Hide explorer" : "Show explorer"}
              >
                {showExplorer ? <ChevronLeft size={10}/> : <ChevronRight size={10}/>}
              </button>
            </div>
            {/* Code editor — takes all remaining space */}
            <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
              <CodeEditor />
            </div>
          </div>
        )}

        {/* Terminal is always mounted so E2B connects on IDE open,
             not on tab switch — eliminates the cold-start race with pendingRunCommand. */}
        <div className={`h-full ${ideTab === 'terminal' ? '' : 'hidden'}`}>
          <Terminal />
        </div>
      </div>
    </div>
  )
}
