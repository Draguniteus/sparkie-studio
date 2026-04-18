'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { IDEPanel } from '@/components/layout/IDEPanel'
import { MobileIDEPanel } from '@/components/layout/MobileIDEPanel'
import { MainPanel } from '@/components/layout/MainPanel'
import { Sidebar } from '@/components/layout/Sidebar'
import { useAppStore } from '@/store/appStore'
import { useShallow } from 'zustand/react/shallow'
import { OnboardingModal } from '@/components/OnboardingModal'
import { SettingsModal } from '@/components/layout/SettingsModal'
import { applyTheme, loadTheme } from '@/utils/themeUtils'
import { useSparkieOutreach } from '@/hooks/useSparkieOutreach'

const MIN_IDE_WIDTH = 280
const MAX_IDE_FRACTION = 0.75
const DEFAULT_IDE_WIDTH = 520

export default function HomeClient() {
  const { status } = useSession()
  const { ideOpen, onboardingDone, hydrateFromStorage } = useAppStore(
    useShallow((s) => ({
      ideOpen: s.ideOpen,
      onboardingDone: s.onboardingDone,
      hydrateFromStorage: s.hydrateFromStorage,
    }))
  )
  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    applyTheme(loadTheme())
    setMounted(true)
    // Mobile/tablet (<1024px) get the bottom-sheet MobileIDEPanel;
    // desktop (≥1024px) gets the resizable side panel
    const check = () => setIsMobile(window.innerWidth < 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (status === 'authenticated') {
      hydrateFromStorage()
    }
  }, [status, hydrateFromStorage])

  useSparkieOutreach(status === 'authenticated')

  const [ideWidth, setIdeWidth] = useState(DEFAULT_IDE_WIDTH)
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef({ active: false, startX: 0, startWidth: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.active || !containerRef.current) return
      const totalW = containerRef.current.offsetWidth
      const delta = dragRef.current.startX - e.clientX
      const next = Math.min(
        Math.max(dragRef.current.startWidth + delta, MIN_IDE_WIDTH),
        totalW * MAX_IDE_FRACTION
      )
      setIdeWidth(next)
    }
    const onUp = () => {
      if (!dragRef.current.active) return
      dragRef.current.active = false
      setIsDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const onSplitterMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragRef.current = { active: true, startX: e.clientX, startWidth: ideWidth }
    setIsDragging(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  if (status === 'loading') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0c0c14]">
        <div className="w-6 h-6 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
      </div>
    )
  }

  // Desktop: show resizable side panel; Mobile/Tablet: show bottom-sheet
  const showDesktopIDE = ideOpen && !isMobile

  return (
    <div ref={containerRef} className="flex h-[100dvh] w-screen overflow-hidden bg-hive-600">
      {/* Only show onboarding for authenticated users who haven't completed it */}
      {mounted && status === 'authenticated' && !onboardingDone && <OnboardingModal />}
      <SettingsModal />
      {isDragging && (
        <div className="fixed inset-0 z-[9999] cursor-col-resize" />
      )}
      <Sidebar />
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 overflow-hidden md:pb-0 pb-[60px]">
          <MainPanel />
        </div>
      </div>
      {showDesktopIDE && (
        <div
          onMouseDown={onSplitterMouseDown}
          className="relative w-4 shrink-0 cursor-col-resize group flex items-center justify-center"
          title="Drag to resize"
        >
          <div className={`absolute inset-y-0 w-px transition-colors ${isDragging ? 'bg-honey-500' : 'bg-hive-border group-hover:bg-honey-500/60'}`} />
          <div className="relative z-10 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {[0, 1, 2].map(i => (
              <span key={i} className={`w-1 h-1 rounded-full transition-colors ${isDragging ? 'bg-honey-500' : 'bg-honey-500/70'}`} />
            ))}
          </div>
        </div>
      )}
      {showDesktopIDE && (
        <div style={{ width: ideWidth }} className="shrink-0 overflow-hidden hidden md:block">
          <IDEPanel />
        </div>
      )}
      {/* Mobile/Tablet: bottom-sheet Brain panel */}
      {ideOpen && isMobile && <MobileIDEPanel />}
    </div>
  )
}
