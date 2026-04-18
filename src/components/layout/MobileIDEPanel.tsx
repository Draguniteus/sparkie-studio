"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useAppStore } from "@/store/appStore"
import { IDEPanelInner } from "./IDEPanelInner"
import { Brain, X } from "lucide-react"

const COLLAPSED_PCT = 50 // % of viewport height when collapsed
const HANDLE_HEIGHT = 32

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max)
}

export function MobileIDEPanel() {
  const { ideOpen, ideTab, toggleIDE, setIdeTab, isExecuting, containerStatus } = useAppStore()
  const [expanded, setExpanded] = useState(false)
  const [dragOffset, setDragOffset] = useState(0) // positive = dragged down (more collapsed)
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef({ active: false, startY: 0, startOffset: 0 })
  const sheetRef = useRef<HTMLDivElement>(null)

  // Reset drag state when switching between expanded/collapsed
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragRef.current = { active: true, startY: e.clientY, startOffset: dragOffset }
    setIsDragging(true)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [dragOffset])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return
    const delta = e.clientY - dragRef.current.startY
    setDragOffset(clamp(dragRef.current.startOffset + delta, -window.innerHeight * 0.5, window.innerHeight * 0.5))
  }, [])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    setIsDragging(false)
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    // Snap: if dragged more than 20% of handle height, toggle state
    const threshold = HANDLE_HEIGHT * 0.6
    if (Math.abs(dragOffset) > threshold) {
      setExpanded(prev => !prev)
    }
    setDragOffset(0)
  }, [dragOffset])

  // Close sheet on escape key
  useEffect(() => {
    if (!ideOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") toggleIDE()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [ideOpen, toggleIDE])

  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (ideOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => { document.body.style.overflow = "" }
  }, [ideOpen])

  const tabs = [
    { id: "process",  label: "Process"  },
    { id: "preview",  label: "Preview"  },
    { id: "worklog",  label: "Worklog"  },
    { id: "goals",    label: "Goals"    },
    { id: "memory",   label: "Memory"   },
    { id: "real",     label: "REAL"     },
    { id: "cip",      label: "C.I.P."   },
    { id: "tasks",    label: "Tasks"    },
    { id: "topics",   label: "Topics"   },
    { id: "files",    label: "Files"    },
    { id: "terminal", label: "Terminal" },
  ] as const

  const wcDot =
    containerStatus === "ready"  ? "bg-[#22c55e]" :
    containerStatus === "error"  ? "bg-[#ef4444]" :
    containerStatus === "idle"   ? "bg-[#374151]" : "bg-[#f59e0b]"

  // Calculate sheet position
  // expanded = false → top starts at (100 - COLLAPSED_PCT)% → peek shows bottom portion
  // expanded = true → top at 0 (or dragged offset)
  const baseTop = expanded ? 0 : 100 - COLLAPSED_PCT
  const dragDelta = isDragging ? dragOffset : 0
  const sheetTop = `calc(${baseTop}vh + ${dragDelta}px)`

  if (!ideOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={toggleIDE}
        style={{ top: 0 }}
      />

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        className="fixed left-0 right-0 z-50 flex flex-col rounded-t-2xl shadow-2xl overflow-hidden"
        style={{
          top: sheetTop,
          height: expanded ? "100vh" : `${COLLAPSED_PCT}vh`,
          transition: isDragging ? "none" : "top 0.3s cubic-bezier(0.32, 0.72, 0, 1), height 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
          backgroundColor: "#1A1A1A",
          borderTop: "1px solid #333333",
        }}
      >
        {/* Drag Handle */}
        <div
          className="shrink-0 flex items-center justify-between px-4"
          style={{ height: HANDLE_HEIGHT }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Left: Brain toggle + title */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded bg-purple-500/20 flex items-center justify-center">
                <Brain size={11} className="text-purple-400" />
              </div>
              <span className="text-xs font-semibold text-[#F5F5F5]">Sparkie&apos;s Brain</span>
            </div>
            {isExecuting && (
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            )}
          </div>

          {/* Right: Collapse/Expand indicator + Close */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-[10px] text-[#666666] hover:text-[#A0A0A0] transition-colors px-2 py-1 rounded"
            >
              {expanded ? "▼ Collapse" : "▲ Expand"}
            </button>
            <button
              onClick={toggleIDE}
              className="p-1 rounded hover:bg-[#3A3A3A] text-[#666666] hover:text-[#A0A0A0] transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-[#333333]" />

        {/* Tab Bar */}
        <div className="shrink-0 flex items-center overflow-x-auto bg-[#151515] border-b border-[#333333] px-1 gap-0.5"
          style={{ height: 36 }}
        >
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => { setIdeTab(t.id); setExpanded(true) }}
              className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded transition-colors shrink-0 whitespace-nowrap
                ${ideTab === t.id
                  ? "bg-[#2D2D2D] text-[#F5F5F5] border border-[#444]"
                  : "text-[#666666] hover:text-[#A0A0A0] hover:bg-[#252525]"
                }`}
            >
              {t.id === "terminal" && (
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${wcDot} ${!["idle","ready","error"].includes(containerStatus) ? "animate-pulse" : ""}`} />
              )}
              {t.label}
            </button>
          ))}
        </div>

        {/* Content — hideHeader=true because MobileIDEPanel provides its own tab bar */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <IDEPanelInner hideHeader={true} />
        </div>
      </div>
    </>
  )
}
