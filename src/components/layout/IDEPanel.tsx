'use client'

import { Brain } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { IDEPanelInner } from './IDEPanelInner'

export function IDEPanel() {
  const { toggleIDE } = useAppStore()

  return (
    <div className="h-full flex flex-col bg-hive-600 border-l border-hive-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-hive-border shrink-0 bg-hive-600">
        <div className="flex items-center gap-2">
          <BrainToggle />
          <span className="text-xs font-semibold text-text-primary">Sparkie's Brain</span>
        </div>
        <button
          onClick={toggleIDE}
          className="p-1 rounded hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors"
          title="Close Sparkie's Brain"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <IDEPanelInner />
      </div>
    </div>
  )
}

function BrainToggle() {
  const { isExecuting, toggleIDE, ideOpen } = useAppStore()

  return (
    <button
      onClick={toggleIDE}
      title={ideOpen ? "Shh... hide my thoughts \uD83E\uDD2B" : "Open Sparkie's Brain \uD83E\uDDE0"}
      className="group relative flex items-center justify-center w-6 h-6 rounded-lg transition-all"
    >
      {isExecuting && (
        <span className="absolute inset-0 rounded-lg bg-purple-500/20 animate-ping" />
      )}
      <span className={`relative w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
        isExecuting
          ? 'bg-gradient-to-br from-purple-600/40 to-purple-800/40 shadow-[0_0_8px_rgba(168,85,247,0.4)]'
          : 'bg-purple-500/15 group-hover:bg-purple-500/25'
      }`}>
        <Brain
          size={12}
          className={`transition-colors ${isExecuting ? 'text-purple-300' : 'text-purple-400 group-hover:text-purple-300'}`}
        />
      </span>
    </button>
  )
}
