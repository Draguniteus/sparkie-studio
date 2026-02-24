'use client'

import React, { useEffect, useRef, useState } from 'react'
import { IDEPanel } from '@/components/layout/IDEPanel'
import { MainPanel } from '@/components/layout/MainPanel'
import { Sidebar } from '@/components/layout/Sidebar'
import { useAppStore } from '@/store/appStore'
import { OnboardingModal } from '@/components/OnboardingModal'
import { SettingsModal } from '@/components/layout/SettingsModal'

const MIN_IDE_WIDTH = 280
const MAX_IDE_FRACTION = 0.75
const DEFAULT_IDE_WIDTH = 520

export default function Home() {
  const { ideOpen, onboardingDone, hydrateFromStorage } = useAppStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    hydrateFromStorage()  // hydrate localStorage → store after mount (SSR-safe)
    setMounted(true)
  }, [hydrateFromStorage])
  const [ideWidth, setIdeWidth] = useState(DEFAULT_IDE_WIDTH)
  const [isDragging, setIsDragging] = useState(false)

  // Use refs for drag state — avoids stale closure issues entirely
  const dragRef = useRef({ active: false, startX: 0, startWidth: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.active || !containerRef.current) return
      const totalW = containerRef.current.offsetWidth
      const delta = dragRef.current.startX - e.clientX  // left = expand IDE
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
  }, []) // safe — reads from refs, not state

  const onSplitterMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragRef.current = { active: true, startX: e.clientX, startWidth: ideWidth }
    setIsDragging(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  return (
    <div ref={containerRef} className="flex h-screen w-screen overflow-hidden bg-hive-600">
      {mounted && !onboardingDone && <OnboardingModal />}
      <SettingsModal />
      {/* Drag overlay — captures all mouse events during drag so nothing underneath interferes */}
      {isDragging && (
        <div className="fixed inset-0 z-[9999] cursor-col-resize" />
      )}

      {/* Left Sidebar */}
      <Sidebar />

      {/* Center Panel */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <MainPanel />
      </div>

      {/* Splitter — wider hit area (16px) with a thin visual line in the center */}
      {ideOpen && (
        <div
          onMouseDown={onSplitterMouseDown}
          className="relative w-4 shrink-0 cursor-col-resize group flex items-center justify-center"
          title="Drag to resize"
        >
          {/* Visual line */}
          <div className={`absolute inset-y-0 w-px transition-colors ${
            isDragging ? 'bg-honey-500' : 'bg-hive-border group-hover:bg-honey-500/60'
          }`} />
          {/* Grip dots */}
          <div className="relative z-10 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {[0, 1, 2].map(i => (
              <span key={i} className={`w-1 h-1 rounded-full transition-colors ${
                isDragging ? 'bg-honey-500' : 'bg-honey-500/70'
              }`} />
            ))}
          </div>
        </div>
      )}

      {/* IDE Panel */}
      {ideOpen && (
        <div style={{ width: ideWidth }} className="shrink-0 overflow-hidden">
          <IDEPanel />
        </div>
      )}
    </div>
  )
}
