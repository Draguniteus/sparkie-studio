'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { MainPanel } from '@/components/layout/MainPanel'
import { IDEPanel } from '@/components/layout/IDEPanel'
import { useAppStore } from '@/store/appStore'

export default function Home() {
  const { sidebarOpen, ideOpen } = useAppStore()

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
