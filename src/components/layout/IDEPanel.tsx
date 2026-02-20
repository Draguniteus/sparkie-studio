'use client'

import { useAppStore } from '@/store/appStore'
import { X, Monitor, FolderTree, Download, Play } from 'lucide-react'

export function IDEPanel() {
  const { ideTab, setIDETab, toggleIDE, files, activeFileId } = useAppStore()
  const activeFile = files.find(f => f.id === activeFileId)

  return (
    <div className="w-[480px] h-full bg-hive-700 border-l border-hive-border flex flex-col shrink-0 animate-slide-right">
      {/* IDE Header */}
      <div className="flex items-center justify-between px-3 h-11 border-b border-hive-border shrink-0">
        <div className="flex gap-1">
          <button
            onClick={() => setIDETab('process')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              ideTab === 'process'
                ? 'bg-honey-500/15 text-honey-500'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <Monitor size={13} className="inline mr-1.5" />
            Current Process
          </button>
          <button
            onClick={() => setIDETab('files')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              ideTab === 'files'
                ? 'bg-honey-500/15 text-honey-500'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <FolderTree size={13} className="inline mr-1.5" />
            Files
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded-md hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors" title="Download">
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
      <div className="flex-1 overflow-hidden">
        {ideTab === 'process' ? (
          <div className="h-full flex flex-col items-center justify-center text-text-muted p-8">
            <div className="w-16 h-16 rounded-2xl bg-honey-500/10 flex items-center justify-center mb-4">
              <Play size={24} className="text-honey-500" />
            </div>
            <p className="text-sm font-medium text-text-secondary mb-1">No active process</p>
            <p className="text-xs text-center">Start a coding task and watch Sparkie work in real-time</p>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {/* File Search */}
            <div className="p-2 border-b border-hive-border">
              <input
                type="text"
                placeholder="Search files..."
                className="w-full px-3 py-1.5 rounded-md bg-hive-600 border border-hive-border text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-honey-500/50"
              />
            </div>
            {/* File Tree */}
            <div className="flex-1 overflow-y-auto p-2">
              {files.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-text-muted p-8">
                  <FolderTree size={24} className="mb-2 text-honey-500/50" />
                  <p className="text-xs text-center">No files yet. Files created during tasks will appear here.</p>
                </div>
              ) : (
                files.map(file => (
                  <div key={file.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-hive-hover cursor-pointer text-sm text-text-secondary">
                    <span className="text-honey-500/70">📄</span>
                    <span className="truncate">{file.name}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
