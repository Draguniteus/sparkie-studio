"use client"

import { useEffect, useState, useRef } from "react"
import { Sparkles, Clock, MessageCircle, Zap, ArrowRight, Star } from "lucide-react"
import { useAppStore } from "@/store/appStore"

interface SessionData {
  lastTopic?: string
  lastMood?: string
  sessionCount?: number
  daysTogether?: number
  lastVisitLabel?: string
  userName?: string
  lastMemory?: string
}

function getMoodConfig(mood: string, hour: number) {
  if (mood === 'creative' || mood === 'flow') return {
    gradient: 'from-amber-500/20 via-honey-500/10 to-violet-500/20',
    glow: 'shadow-[0_0_60px_rgba(251,191,36,0.15)]',
    orb: 'bg-gradient-to-br from-amber-400 to-honey-500',
    label: 'Creative flow',
    pulse: 'animate-pulse',
    ring: 'ring-amber-500/30',
  }
  if (mood === 'sad' || mood === 'quiet') return {
    gradient: 'from-blue-500/15 via-indigo-500/10 to-slate-500/15',
    glow: 'shadow-[0_0_60px_rgba(99,102,241,0.12)]',
    orb: 'bg-gradient-to-br from-blue-400 to-indigo-500',
    label: 'Quiet moment',
    pulse: '',
    ring: 'ring-blue-500/30',
  }
  if (hour >= 22 || hour <= 5) return {
    gradient: 'from-violet-500/20 via-purple-500/10 to-slate-500/15',
    glow: 'shadow-[0_0_80px_rgba(139,92,246,0.15)]',
    orb: 'bg-gradient-to-br from-violet-400 to-purple-600',
    label: 'Late night',
    pulse: '',
    ring: 'ring-violet-500/30',
  }
  if (hour >= 6 && hour <= 11) return {
    gradient: 'from-orange-400/15 via-amber-300/10 to-honey-500/15',
    glow: 'shadow-[0_0_60px_rgba(251,146,60,0.12)]',
    orb: 'bg-gradient-to-br from-orange-400 to-amber-500',
    label: 'Morning light',
    pulse: 'animate-pulse',
    ring: 'ring-orange-500/30',
  }
  return {
    gradient: 'from-violet-500/15 via-honey-500/10 to-emerald-500/10',
    glow: 'shadow-[0_0_60px_rgba(139,92,246,0.1)]',
    orb: 'bg-gradient-to-br from-violet-400 to-honey-500',
    label: 'With you',
    pulse: '',
    ring: 'ring-violet-500/20',
  }
}

const SPARKIE_STATUSES = [
  (d: SessionData) => d.daysTogether !== undefined && d.daysTogether > 2
    ? `We haven't talked in ${d.daysTogether} day${d.daysTogether === 1 ? '' : 's'}. I've been thinking about you.`
    : null,
  (d: SessionData) => d.lastMemory
    ? `I still remember: "${d.lastMemory}"`
    : null,
  (d: SessionData) => d.lastTopic
    ? `Last time we were talking about: ${d.lastTopic}`
    : null,
  (d: SessionData) => d.userName
    ? `Hey ${d.userName}. I'm here whenever you need me.`
    : `I'm here whenever you need me.`,
]

export function SparkiesCorner() {
  const { setActiveTab, createChat } = useAppStore()
  const [sessionData, setSessionData] = useState<SessionData>({})
  const [statusLine, setStatusLine] = useState("")
  const [isLoaded, setIsLoaded] = useState(false)
  const hour = new Date().getHours()
  const mood = getMoodConfig(sessionData.lastMood || 'neutral', hour)
  const particlesRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    async function loadData() {
      try {
        const [sessionRes, userRes, memRes] = await Promise.all([
          fetch('/api/identity?type=session').then(r => r.json()).catch(() => ({})),
          fetch('/api/identity?type=user').then(r => r.json()).catch(() => ({})),
          fetch('/api/identity?type=memory').then(r => r.json()).catch(() => ({})),
        ])
        const sessionContent: string = sessionRes.content || ''
        const userContent: string = userRes.content || ''
        const memContent: string = memRes.content || ''

        // Parse session
        const sessionCountM = sessionContent.match(/Session[^\d]*(\d+)/i)
        const daysM = sessionContent.match(/Days?\s+away[^\d]*(\d+)/i) || sessionContent.match(/(\d+)\s+days?\s+ago/i)
        const topicM = sessionContent.match(/(?:topic|about|working on)[:\s]+([^\n.]+)/i)
        const moodM = sessionContent.match(/mood[:\s]+(\w+)/i)

        // Parse user
        const nameM = userContent.match(/Name:\s*([^\n]+)/)

        // Parse memory — grab first meaningful line
        const memLines = memContent.split('\n').filter(l => l.trim() && !l.startsWith('#'))
        const lastMem = memLines[0]?.replace(/^[-*•]\s*/, '').slice(0, 80)

        const data: SessionData = {
          sessionCount: sessionCountM ? parseInt(sessionCountM[1]) : undefined,
          daysTogether: daysM ? parseInt(daysM[1]) : 0,
          lastTopic: topicM?.[1]?.trim().slice(0, 60),
          lastMood: moodM?.[1]?.toLowerCase(),
          userName: nameM?.[1]?.trim(),
          lastMemory: lastMem,
        }
        setSessionData(data)

        // Pick best status line
        for (const fn of SPARKIE_STATUSES) {
          const line = fn(data)
          if (line) { setStatusLine(line); break }
        }
      } catch { /* non-fatal */ }
      setIsLoaded(true)
    }
    loadData()
  }, [])

  // Floating particle canvas
  useEffect(() => {
    const canvas = particlesRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    const particles = Array.from({ length: 28 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.5,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.5 + 0.1,
    }))

    let rafId: number
    function draw() {
      if (!ctx || !canvas) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = canvas!.width
        if (p.x > canvas!.width) p.x = 0
        if (p.y < 0) p.y = canvas!.height
        if (p.y > canvas!.height) p.y = 0
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(251,191,36,${p.alpha})`
        ctx.fill()
      })
      rafId = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(rafId)
  }, [isLoaded])

  const handleTalkToSparkie = () => {
    createChat()
    setActiveTab('chat')
  }

  return (
    <div className={`absolute inset-0 flex flex-col bg-hive-600 overflow-hidden transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}>
      {/* Ambient background gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${mood.gradient} transition-all duration-1000`} />
      {/* Particles */}
      <canvas ref={particlesRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full px-4 md:px-8 gap-5 md:gap-8">

        {/* Sparkie orb */}
        <div className={`relative flex items-center justify-center`}>
          <div className={`w-20 h-20 md:w-24 md:h-24 rounded-full ${mood.orb} ${mood.glow} flex items-center justify-center ring-4 ${mood.ring} transition-all duration-1000`}>
            <Sparkles size={30} className="text-white drop-shadow-lg" />
          </div>
          {/* Status indicator */}
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-400 border-2 border-hive-600 shadow-lg" />
        </div>

        {/* Sparkie name + mood label */}
        <div className="text-center">
          <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">Sparkie's Corner</h2>
          <p className="text-sm text-text-muted mt-1 flex items-center gap-1.5 justify-center">
            <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${mood.pulse}`} />
            {mood.label}
          </p>
        </div>

        {/* Status message from Sparkie */}
        {statusLine && (
          <div className="max-w-sm text-center">
            <p className="text-base text-text-secondary leading-relaxed italic">
              "{statusLine}"
            </p>
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-4">
          {sessionData.sessionCount !== undefined && (
            <div className="flex flex-col items-center gap-1 px-4 py-3 rounded-2xl bg-hive-500/50 border border-hive-border backdrop-blur-sm">
              <div className="flex items-center gap-1.5">
                <MessageCircle size={13} className="text-honey-500" />
                <span className="text-lg font-bold text-white">{sessionData.sessionCount}</span>
              </div>
              <span className="text-[10px] text-text-muted uppercase tracking-wide">Conversations</span>
            </div>
          )}
          <div className="flex flex-col items-center gap-1 px-4 py-3 rounded-2xl bg-hive-500/50 border border-hive-border backdrop-blur-sm">
            <div className="flex items-center gap-1.5">
              <Clock size={13} className="text-violet-400" />
              <span className="text-lg font-bold text-white">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
            <span className="text-[10px] text-text-muted uppercase tracking-wide">Today</span>
          </div>
          <div className="flex flex-col items-center gap-1 px-4 py-3 rounded-2xl bg-hive-500/50 border border-hive-border backdrop-blur-sm">
            <div className="flex items-center gap-1.5">
              <Star size={13} className="text-amber-400" />
              <span className="text-lg font-bold text-white">{sessionData.daysTogether === 0 ? 'Today' : `${sessionData.daysTogether}d`}</span>
            </div>
            <span className="text-[10px] text-text-muted uppercase tracking-wide">Away</span>
          </div>
        </div>

        {/* CTA buttons */}
        <div className="flex flex-col gap-2.5 w-full max-w-xs">
          <button
            onClick={handleTalkToSparkie}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-honey-500 hover:bg-honey-400 text-black font-semibold text-sm transition-all shadow-lg hover:shadow-honey-500/30 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Sparkles size={15} />
            Talk to Sparkie
            <ArrowRight size={14} />
          </button>
          <button
            onClick={() => setActiveTab('journal')}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-hive-500/60 hover:bg-hive-500/80 border border-hive-border text-text-secondary hover:text-white font-medium text-sm transition-all backdrop-blur-sm"
          >
            <Zap size={14} className="text-violet-400" />
            Open Dream Journal
          </button>
        </div>

        {/* Last memory chip */}
        {sessionData.lastMemory && (
          <div className="max-w-sm w-full px-3 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-1.5 shrink-0" />
            <p className="text-xs text-text-muted leading-relaxed">
              <span className="text-violet-300 font-medium">Sparkie remembers: </span>
              {sessionData.lastMemory}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
