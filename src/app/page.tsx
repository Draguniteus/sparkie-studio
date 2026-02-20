'use client'

import { IDEPanel } from '@/components/layout/IDEPanel'
import { MainPanel } from '@/components/layout/MainPanel'
import { Sidebar } from '@/components/layout/Sidebar'
import { useAppStore } from '@/store/appStore'

export default function Home() {
  const { ideOpen } = useAppStore()

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-hive-600">
      {/* Left Sidebar */}
      <Sidebar />

      {/* Center Panel - Chat/Task Workspace */}
      <MainPanel />

      {/* Right Panel - IDE/Preview (toggleable) */}
      {ideOpen && <IDEPanel />}
    </div>
  )
}
