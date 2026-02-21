'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { IDEPanel } from '@/components/layout/IDEPanel'
import { MainPanel } from '@/components/layout/MainPanel'
import { Sidebar } from '@/components/layout/Sidebar'
import { useAppStore } from '@/store/appStore'

const MIN_IDE_WIDTH = 280
const MAX_IDE_FRACTION = 0.75
const DEFAULT_IDE_WIDTH = 520

export default function Home() {
  const { ideOpen } = useAppStore()
  const [ideWidth, setIdeWidth] = useState(DEFAULT_IDE_WIDTH)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = ideWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [ideWidth])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const totalW = containerRef.current.offsetWidth
      const delta = startX.current - e.clientX          // drag left = wider IDE
      const next = Math.min(
        Math.max(startWidth.current + delta, MIN_IDE_WIDTH),
        totalW * MAX_IDE_FRACTION
      )
      setIdeWidth(next)
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
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

  return (
    <div ref={containerRef} className="flex h-screen w-screen overflow-hidden bg-hive-600">
      {/* Left Sidebar */}
      <Sidebar />

      {/* Center Panel - stretches to fill remaining space */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <MainPanel />
      </div>

      {/* Drag splitter — only visible when IDE is open */}
      {ideOpen && (
        <div
          onMouseDown={onMouseDown}
          className="w-1 shrink-0 bg-hive-border hover:bg-honey-500/60 active:bg-honey-500 transition-colors cursor-col-resize relative group"
          title="Drag to resize"
        >
          {/* grip dots */}
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            {[0,1,2].map(i => (
              <span key={i} className="w-1 h-1 rounded-full bg-honey-500/80" />
            ))}
          </div>
        </div>
      )}

      {/* Right Panel — IDE (fixed width, user-resizable) */}
      {ideOpen && (
        <div style={{ width: ideWidth }} className="shrink-0 overflow-hidden">
          <IDEPanel />
        </div>
      )}
    </div>
  )
}
