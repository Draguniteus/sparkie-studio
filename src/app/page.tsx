'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { IDEPanel } from '@/components/layout/IDEPanel'
import { MainPanel } from '@/components/layout/MainPanel'
import { Sidebar } from '@/components/layout/Sidebar'
import { useAppStore } from '@/store/appStore'
import { OnboardingModal } from '@/components/OnboardingModal'
import { SettingsModal } from '@/components/layout/SettingsModal'
import { applyTheme, loadTheme } from '@/utils/themeUtils'
import { useSparkieOutreach } from '@/hooks/useSparkieOutreach'

const MIN_IDE_WIDTH = 280
const MAX_IDE_FRACTION = 0.75
const DEFAULT_IDE_WIDTH = 520

export default function Home() {
  const { status } = useSession()
  const router = useRouter()
  const { ideOpen, onboardingDone, hydrateFromStorage } = useAppStore()
  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    hydrateFromStorage()
    applyTheme(loadTheme())
    setMounted(true)
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [hydrateFromStorage])

  // Client-side guard — belt-and-suspenders behind middleware
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/auth/signin')
    }
  }, [status, router])

  // Sparkie proactive outreach — polls /api/agent every 60s when tab is focused
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

  // Show nothing while checking auth or if not authed
  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0c0c14]">
        <div className="w-6 h-6 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
      </div>
    )
  }

  // On mobile: full-screen main panel + bottom nav sidebar, no IDE panel
  const showIDE = ideOpen && !isMobile

  return (
    <div ref={containerRef} className="flex h-[100dvh] w-screen overflow-hidden bg-hive-600">
      {mounted && !onboardingDone && <OnboardingModal />}
      <SettingsModal />
      {isDragging && (
        <div className="fixed inset-0 z-[9999] cursor-col-resize" />
      )}

      {/* Sidebar — hidden on mobile (rendered as bottom nav inside Sidebar component) */}
      <div className="hidden md:flex md:shrink-0">
        <Sidebar />
      </div>

      {/* Mobile bottom nav */}
      <div className="md:hidden">
        <Sidebar />
      </div>

      {/* Main content area */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {/* On mobile: add bottom padding so content clears the bottom nav */}
        <div className="flex-1 min-h-0 overflow-hidden md:pb-0 pb-[60px]">
          <MainPanel />
        </div>
      </div>

      {/* IDE splitter — desktop only */}
      {showIDE && (
        <div
          onMouseDown={onSplitterMouseDown}
          className="relative w-4 shrink-0 cursor-col-resize group flex items-center justify-center"
          title="Drag to resize"
        >
          <div className={`absolute inset-y-0 w-px transition-colors ${
            isDragging ? 'bg-honey-500' : 'bg-hive-border group-hover:bg-honey-500/60'
          }`} />
          <div className="relative z-10 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {[0, 1, 2].map(i => (
              <span key={i} className={`w-1 h-1 rounded-full transition-colors ${
                isDragging ? 'bg-honey-500' : 'bg-honey-500/70'
              }`} />
            ))}
          </div>
        </div>
      )}

      {/* IDE panel — desktop only */}
      {showIDE && (
        <div style={{ width: ideWidth }} className="shrink-0 overflow-hidden hidden md:block">
          <IDEPanel />
        </div>
      )}
    </div>
  )
}
