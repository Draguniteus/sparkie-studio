"use client"

import dynamic from 'next/dynamic'

// Entire IDE panel is client-only (WebContainers + xterm are browser-only)
const IDEPanelInner = dynamic(() => import('./IDEPanelInner').then(m => m.IDEPanelInner), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-hive-600 border-l border-hive-border">
      <span className="text-xs text-text-muted">Loading IDE…</span>
    </div>
  ),
})

export function IDEPanel() {
  return <IDEPanelInner />
}
