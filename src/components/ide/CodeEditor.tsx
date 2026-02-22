"use client"

import { useCallback } from "react"
import { useAppStore, FileNode, findNodeById, flattenFileTree } from "@/store/appStore"
import { File, Download } from "lucide-react"

export function CodeEditor() {
  const { files, activeFileId, updateFileContent, setActiveFile } = useAppStore()
  // Use recursive tree search — handles files nested inside project folder
  const activeFile = activeFileId ? findNodeById(files, activeFileId) : undefined

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

  if (!activeFile) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted p-8">
        <File size={24} className="mb-2 text-honey-500/40" />
        <p className="text-xs">Select a file to edit</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* File tabs — flatten tree to show all files */}
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

      {/* File header with download */}
      <div className="flex items-center justify-between h-7 px-3 bg-hive-700/50 border-b border-hive-border shrink-0">
        <span className="text-[11px] text-text-secondary">{activeFile.name}</span>
        <button onClick={downloadFile} className="p-0.5 rounded hover:bg-hive-hover text-text-muted hover:text-text-secondary">
          <Download size={12} />
        </button>
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
        <span>{activeFile.language || "plaintext"}</span>
        <span>{(activeFile.content || "").split("\n").length} lines</span>
      </div>
    </div>
  )
}
