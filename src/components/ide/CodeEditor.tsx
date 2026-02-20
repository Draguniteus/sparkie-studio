"use client"

import { useCallback } from "react"
import { useAppStore } from "@/store/appStore"
import { File } from "lucide-react"

export function CodeEditor() {
  const { files, activeFileId, updateFileContent } = useAppStore()
  const activeFile = files.find((f) => f.id === activeFileId)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (activeFileId) {
        updateFileContent(activeFileId, e.target.value)
      }
    },
    [activeFileId, updateFileContent]
  )

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
      {/* File tab bar */}
      <div className="flex items-center h-8 border-b border-hive-border bg-hive-700 px-1 shrink-0">
        <div className="flex items-center gap-1.5 px-3 py-1 bg-hive-600 rounded-t text-xs text-honey-500 border border-hive-border border-b-0">
          <span>{activeFile.name}</span>
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Line numbers */}
        <div className="absolute left-0 top-0 bottom-0 w-10 bg-hive-700 border-r border-hive-border overflow-hidden select-none">
          <div className="pt-3 px-1">
            {(activeFile.content || "").split("\n").map((_, i) => (
              <div key={i} className="text-[11px] text-text-muted text-right pr-2 leading-[20px] font-mono">
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        {/* Code textarea */}
        <textarea
          value={activeFile.content || ""}
          onChange={handleChange}
          spellCheck={false}
          className="w-full h-full bg-transparent text-[13px] text-text-primary font-mono leading-[20px] p-3 pl-12 resize-none focus:outline-none overflow-auto whitespace-pre tab-size-2"
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
