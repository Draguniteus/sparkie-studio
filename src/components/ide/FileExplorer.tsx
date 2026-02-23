"use client"

import { useState, useRef, useEffect } from "react"
import { useAppStore, FileNode } from "@/store/appStore"
import { getFileSize } from "@/lib/fileParser"
import {
  File, Folder, FolderOpen, Plus, Trash2, Download, ChevronRight, ChevronDown, Archive,
  FileCode, FileText, FileImage, FileJson, Pencil,
} from "lucide-react"

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "ts": case "tsx": case "js": case "jsx": return <FileCode size={14} className="text-blue-400" />
    case "json": return <FileJson size={14} className="text-yellow-400" />
    case "md": case "txt": return <FileText size={14} className="text-text-muted" />
    case "png": case "jpg": case "svg": return <FileImage size={14} className="text-green-400" />
    case "css": case "scss": return <FileCode size={14} className="text-pink-400" />
    case "html": return <FileCode size={14} className="text-orange-400" />
    default: return <File size={14} className="text-text-muted" />
  }
}

interface FileItemProps { file: FileNode; depth: number }

function FileItem({ file, depth }: FileItemProps) {
  const [expanded, setExpanded] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(file.name)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const { activeFileId, setActiveFile, deleteFile, renameFile } = useAppStore()
  const isActive = activeFileId === file.id
  const isFolder = file.type === "folder" || file.type === "archive"
  const isArchive = file.type === "archive"

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }
  }, [isRenaming])

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isArchive) return
    setRenameValue(file.name)
    setIsRenaming(true)
  }

  const commitRename = () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== file.name) {
      renameFile(file.id, trimmed)
    }
    setIsRenaming(false)
  }

  const downloadFile = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (file.content) {
      const blob = new Blob([file.content], { type: "text/plain" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = file.name; a.click()
      URL.revokeObjectURL(url)
    }
  }

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md ${isArchive ? "opacity-35 cursor-default" : "cursor-pointer"} group text-xs transition-colors ${
          isActive ? "bg-honey-500/10 text-text-primary" : "text-text-secondary hover:bg-hive-hover"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => {
          if (isRenaming) return
          isFolder ? (isArchive ? null : setExpanded(!expanded)) : setActiveFile(file.id)
        }}
        onDoubleClick={startRename}
      >
        {isFolder ? (
          <>
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {isArchive ? <Archive size={14} className="text-text-muted/50" /> : expanded ? <FolderOpen size={14} className="text-honey-500/70" /> : <Folder size={14} className="text-honey-500/70" />}
          </>
        ) : (
          <>{getFileIcon(file.name)}</>
        )}

        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitRename() }
              if (e.key === "Escape") { setIsRenaming(false); setRenameValue(file.name) }
              e.stopPropagation()
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 px-1 py-0 rounded bg-hive-elevated border border-honey-500/50 text-xs text-text-primary focus:outline-none"
          />
        ) : (
          <span className="truncate flex-1">{file.name}</span>
        )}

        {!isFolder && file.content && !isRenaming && (
          <span className="text-[10px] text-text-muted shrink-0">{getFileSize(file.content)}</span>
        )}

        {!isRenaming && (
          <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 shrink-0">
            {isFolder && file.children && file.children.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const allFiles: FileNode[] = []
                  const collect = (nodes: FileNode[]) => nodes.forEach(n => n.type === "folder" ? collect(n.children ?? []) : allFiles.push(n))
                  collect(file.children!)
                  allFiles.forEach(f => {
                    if (!f.content) return
                    const blob = new Blob([f.content], { type: "text/plain" })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement("a")
                    a.href = url; a.download = f.name; a.click()
                    URL.revokeObjectURL(url)
                  })
                }}
                className="p-0.5 rounded hover:bg-hive-hover text-text-muted hover:text-honey-500"
                title={`Download all files in ${file.name}`}
              >
                <Download size={11} />
              </button>
            )}
            {!isFolder && !isArchive && (
              <button
                onClick={startRename}
                className="p-0.5 rounded hover:bg-hive-hover text-text-muted hover:text-honey-500"
                title="Rename"
              >
                <Pencil size={11} />
              </button>
            )}
            {!isFolder && (
              <button onClick={downloadFile} className="p-0.5 rounded hover:bg-hive-hover text-text-muted hover:text-text-secondary">
                <Download size={11} />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); deleteFile(file.id) }}
              className="p-0.5 rounded hover:bg-red-500/20 text-text-muted hover:text-red-400"
              title="Delete"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>
      {isFolder && expanded && file.children?.map((child) => (
        <FileItem key={child.id} file={child} depth={depth + 1} />
      ))}
    </div>
  )
}

export function FileExplorer() {
  const { files, addFile } = useAppStore()
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState("")

  const handleCreate = () => {
    if (!newName.trim()) return
    addFile({ name: newName.trim(), type: newName.includes(".") ? "file" : "folder", content: "" })
    setNewName(""); setShowNew(false)
  }

  const collectFiles = (nodes: FileNode[]): FileNode[] => {
    return nodes.flatMap(n => n.type === "folder" ? collectFiles(n.children ?? []) : [n])
  }

  const downloadAll = () => {
    collectFiles(files).filter(f => f.content).forEach(f => {
      const blob = new Blob([f.content || ""], { type: "text/plain" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a"); a.href = url; a.download = f.name; a.click()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-2 border-b border-hive-border">
        <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">Files</span>
        <div className="flex gap-0.5">
          <button onClick={downloadAll} className="p-1 rounded hover:bg-hive-hover text-text-muted hover:text-text-secondary" title="Download all">
            <Download size={12} />
          </button>
          <button onClick={() => setShowNew(!showNew)} className="p-1 rounded hover:bg-hive-hover text-text-muted hover:text-honey-500" title="New file">
            <Plus size={14} />
          </button>
        </div>
      </div>

      {showNew && (
        <div className="p-2 border-b border-hive-border">
          <input
            autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") { setShowNew(false); setNewName("") } }}
            placeholder="filename.ext"
            className="w-full px-2 py-1 rounded bg-hive-elevated border border-hive-border text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-honey-500/50"
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted p-6">
            <Folder size={20} className="mb-2 text-honey-500/40" />
            <p className="text-[11px] text-center">No files yet</p>
          </div>
        ) : files.map((file) => <FileItem key={file.id} file={file} depth={0} />)}
      </div>
    </div>
  )
}
