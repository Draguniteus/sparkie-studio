"use client"

import { useState } from "react"
import { useAppStore } from "@/store/appStore"
import {
  X, Monitor, FolderTree, Download, Code, Eye, Brain,
} from "lucide-react"
import { FileExplorer } from "@/components/ide/FileExplorer"
import { CodeEditor } from "@/components/ide/CodeEditor"
import { Preview } from "@/components/ide/Preview"
import { Worklog } from "@/components/ide/Worklog"

export function IDEPanel() {
  const { ideTab, setIDETab, toggleIDE, files, activeFileId, setActiveFile } = useAppStore()
  const [fileViewMode, setFileViewMode] = useState<"preview" | "code">("preview")

  const downloadAll = () => {
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
  }

  return (
    <div className="w-[520px] h-full bg-hive-700 border-l border-hive-border flex flex-col shrink-0 animate-slide-right">
      {/* Header with tabs */}
      <div className="flex items-center justify-between px-3 h-11 border-b border-hive-border shrink-0">
        <div className="flex gap-1">
          <button
            onClick={() => setIDETab("process")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              ideTab === "process"
                ? "bg-honey-500/15 text-honey-500"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <Monitor size={13} className="inline mr-1.5" />
            Current Process
          </button>
          <button
            onClick={() => setIDETab("files")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              ideTab === "files"
                ? "bg-honey-500/15 text-honey-500"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <FolderTree size={13} className="inline mr-1.5" />
            Files
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={downloadAll}
            className="p-1.5 rounded-md hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors"
            title="Download files"
          >
            <Download size={14} />
          </button>
          <button
            onClick={toggleIDE}
            className="p-1.5 rounded-md hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {ideTab === "process" ? (
          /* Current Process = Live Preview + Worklog at bottom */
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <Preview />
            </div>
            {/* Worklog as collapsible bottom section */}
            <div className="border-t border-hive-border max-h-[200px] overflow-y-auto">
              <Worklog compact />
            </div>
          </div>
        ) : (
          /* Files tab = file explorer left + code/preview right */
          <div className="flex-1 flex overflow-hidden">
            {/* File explorer sidebar */}
            <div className="w-52 border-r border-hive-border shrink-0 overflow-hidden">
              <FileExplorer />
            </div>

            {/* Editor/Preview area */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Code/Preview toggle */}
              <div className="flex items-center justify-center py-2 border-b border-hive-border shrink-0">
                <div className="flex bg-hive-elevated rounded-lg p-0.5">
                  <button
                    onClick={() => setFileViewMode("preview")}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      fileViewMode === "preview"
                        ? "bg-hive-surface text-text-primary"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    <Eye size={12} />
                    Preview
                  </button>
                  <button
                    onClick={() => setFileViewMode("code")}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      fileViewMode === "code"
                        ? "bg-hive-surface text-text-primary"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    <Code size={12} />
                    Code
                  </button>
                </div>
              </div>

              {/* Content area */}
              <div className="flex-1 overflow-hidden">
                {fileViewMode === "preview" ? <Preview /> : <CodeEditor />}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
