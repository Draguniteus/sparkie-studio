"use client"

import { useState } from "react"
import { useAppStore } from "@/store/appStore"
import {
  X, Brain, FolderTree, Download, Code, Globe, PanelRightClose,
  ChevronLeft, ChevronRight,
} from "lucide-react"
import { Worklog } from "@/components/ide/Worklog"
import { FileExplorer } from "@/components/ide/FileExplorer"
import { CodeEditor } from "@/components/ide/CodeEditor"
import { Preview } from "@/components/ide/Preview"

type ViewMode = "worklog" | "editor" | "preview"

export function IDEPanel() {
  const { ideTab, setIDETab, toggleIDE, files, activeFileId } = useAppStore()
  const [viewMode, setViewMode] = useState<ViewMode>("worklog")
  const [showExplorer, setShowExplorer] = useState(true)

  // When in "files" tab, show explorer + editor/preview
  // When in "process" tab, show worklog
  const isFilesTab = ideTab === "files" || ideTab === "preview"

  return (
    <div className="w-[520px] h-full bg-hive-700 border-l border-hive-border flex flex-col shrink-0 animate-slide-right">
      {/* IDE Header */}
      <div className="flex items-center justify-between px-3 h-11 border-b border-hive-border shrink-0">
        <div className="flex gap-1">
          <button
            onClick={() => { setIDETab("process"); setViewMode("worklog") }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              ideTab === "process"
                ? "bg-honey-500/15 text-honey-500"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <Brain size={13} className="inline mr-1.5" />
            Worklog
          </button>
          <button
            onClick={() => { setIDETab("files"); setViewMode("editor") }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              ideTab === "files"
                ? "bg-honey-500/15 text-honey-500"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <Code size={13} className="inline mr-1.5" />
            Editor
          </button>
          <button
            onClick={() => { setIDETab("preview"); setViewMode("preview") }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              ideTab === "preview"
                ? "bg-honey-500/15 text-honey-500"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <Globe size={13} className="inline mr-1.5" />
            Preview
          </button>
        </div>
        <div className="flex items-center gap-1">
          {isFilesTab && (
            <button
              onClick={() => setShowExplorer(!showExplorer)}
              className="p-1.5 rounded-md hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors"
              title={showExplorer ? "Hide explorer" : "Show explorer"}
            >
              <FolderTree size={14} />
            </button>
          )}
          <button
            className="p-1.5 rounded-md hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors"
            title="Download files"
            onClick={() => {
              const allFiles = files.filter((f) => f.type === "file" && f.content)
              if (allFiles.length === 0) return
              allFiles.forEach((f) => {
                const blob = new Blob([f.content || ""], { type: "text/plain" })
                const url = URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = url
                a.download = f.name
                a.click()
                URL.revokeObjectURL(url)
              })
            }}
          >
            <Download size={14} />
          </button>
          <button
            onClick={toggleIDE}
            className="p-1.5 rounded-md hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors"
            title="Close IDE"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* IDE Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Worklog view */}
        {ideTab === "process" && (
          <div className="flex-1 overflow-hidden">
            <Worklog />
          </div>
        )}

        {/* Editor view */}
        {ideTab === "files" && (
          <>
            {showExplorer && (
              <div className="w-48 border-r border-hive-border shrink-0 overflow-hidden">
                <FileExplorer />
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <CodeEditor />
            </div>
          </>
        )}

        {/* Preview view */}
        {ideTab === "preview" && (
          <>
            {showExplorer && (
              <div className="w-48 border-r border-hive-border shrink-0 overflow-hidden">
                <FileExplorer />
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <Preview />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
