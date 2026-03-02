"use client"

import { useEffect, useState, useRef } from "react"
import { Play, Pause, Volume2, VolumeX, Headphones } from "lucide-react"

// ─── Animated Waveform Bars ───────────────────────────────────────────────────
function WaveformBars({ playing, count = 28, height = 36 }: { playing: boolean; count?: number; height?: number }) {
  const [phases] = useState(() => Array.from({ length: count }, (_, i) => Math.random() * Math.PI * 2))
  const [speeds] = useState(() => Array.from({ length: count }, () => 0.04 + Math.random() * 0.06))
  const [baseH] = useState(() => Array.from({ length: count }, () => 0.25 + Math.random() * 0.65))
  const [tick, setTick] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }
    let frame = 0
    function loop() {
      frame++
      if (frame % 2 === 0) setTick(t => t + 1)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [playing])

  const now = tick * 80

  return (
    <div className="flex items-end gap-[2px]" style={{ height }}>
      {phases.map((phase, i) => {
        const animated = playing
          ? (Math.sin(now * speeds[i] + phase) * 0.45 + 0.55) * baseH[i]
          : baseH[i] * 0.22
        const px = Math.max(3, animated * height)
        const color = i % 4 === 0
          ? "rgba(245,197,66,0.9)"
          : i % 4 === 1
          ? "rgba(167,139,250,0.75)"
          : i % 4 === 2
          ? "rgba(34,211,238,0.6)"
          : "rgba(245,197,66,0.5)"
        return (
          <div
            key={i}
            className="rounded-full flex-shrink-0"
            style={{ width: 3, height: px, background: color, transition: playing ? "none" : "height 0.5s ease" }}
          />
        )
      })}
    </div>
  )
}


// ─── Audio Player ─────────────────────────────────────────────────────────────
function AudioPlayer({ src, title }: { src: string; title?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.8)
  const [muted, setMuted] = useState(false)
  const [loadError, setLoadError] = useState(false)

  function fmt(s: number) {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, "0")}`
  }

  function togglePlay() {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) }
    else { a.play().then(() => setPlaying(true)).catch(() => setLoadError(true)) }
  }

  function onTimeUpdate() {
    const a = audioRef.current
    if (!a || !a.duration) return
    setProgress(a.currentTime / a.duration)
  }

  function onLoadedMetadata() {
    const a = audioRef.current
    if (!a) return
    setDuration(a.duration)
    a.volume = volume
  }

  function onEnded() { setPlaying(false); setProgress(0) }

  function seekTo(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current
    if (!a || !a.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    a.currentTime = ((e.clientX - rect.left) / rect.width) * a.duration
    setProgress(a.currentTime / a.duration)
  }

  function changeVolume(v: number) {
    setVolume(v)
    if (audioRef.current) audioRef.current.volume = v
    if (v > 0) setMuted(false)
  }

  function toggleMute() {
    const a = audioRef.current
    if (!a) return
    a.muted = !muted
    setMuted(!muted)
  }

  if (loadError || !src) return (
    <div className="mt-2 rounded-xl border border-hive-border/40 bg-hive-elevated px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-honey-500/10 flex items-center justify-center shrink-0">
        <Headphones size={16} className="text-honey-500/50" />
      </div>
      <div>
        <div className="text-sm text-text-muted">Audio unavailable</div>
        <div className="text-[10px] text-text-muted/50">Track link expired or not yet generated</div>
      </div>
    </div>
  )

  return (
    <div
      className="mt-3 rounded-2xl border border-hive-border overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0d0d1a 0%, #12122a 50%, #0d0d1a 100%)" }}
    >
      <audio
        ref={audioRef} src={src} preload="metadata"
        onTimeUpdate={onTimeUpdate} onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded} onError={() => setLoadError(true)}
      />

      <div className="px-4 pt-4 pb-3">
        {/* Track title + waveform row */}
        <div className="flex items-center gap-3 mb-3">
          {/* Animated disc icon */}
          <div
            className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center border-2 transition-all"
            style={{
              background: playing
                ? "conic-gradient(from 0deg, #f5c542, #a78bfa, #22d3ee, #f5c542)"
                : "linear-gradient(135deg, #1a1a2e, #16213e)",
              borderColor: playing ? "rgba(245,197,66,0.4)" : "rgba(255,255,255,0.08)",
              boxShadow: playing ? "0 0 16px rgba(245,197,66,0.3)" : "none",
              animation: playing ? "spin 4s linear infinite" : "none"
            }}
          >
            <div className="w-4 h-4 rounded-full bg-hive-surface" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-text-primary truncate">
              {title || "Sparkie Track"}
            </p>
            <p className="text-[10px] text-text-muted">Sparkie Records</p>
          </div>

          <Music2 size={13} style={{ color: "rgba(245,197,66,0.4)" }} />
        </div>

        {/* Waveform */}
        <div className="flex items-center justify-center mb-3">
          <WaveformBars playing={playing} count={36} height={44} />
        </div>

        {/* Seek bar */}
        <div
          className="w-full rounded-full cursor-pointer mb-2.5 group/seek"
          style={{ height: 4, background: "rgba(255,255,255,0.08)" }}
          onClick={seekTo}
        >
          <div
            className="h-full rounded-full relative transition-none"
            style={{ width: `${progress * 100}%`, background: "linear-gradient(90deg, #f5c542, #a78bfa)" }}
          >
            <div
              className="absolute right-0 top-1/2 w-3 h-3 rounded-full bg-white shadow-lg opacity-0 group-hover/seek:opacity-100 transition-opacity"
              style={{ transform: "translate(50%, -50%)" }}
            />
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-105 active:scale-95"
            style={{
              background: "linear-gradient(135deg, #f5c542, #e8a910)",
              boxShadow: playing ? "0 0 0 6px rgba(245,197,66,0.15), 0 0 18px rgba(245,197,66,0.35)" : "0 2px 8px rgba(0,0,0,0.4)"
            }}
          >
            {playing
              ? <Pause size={16} fill="#111" color="#111" />
              : <Play size={16} fill="#111" color="#111" style={{ marginLeft: 2 }} />
            }
          </button>

          <span className="text-[10px] tabular-nums" style={{ color: "rgba(255,255,255,0.4)" }}>
            {fmt(progress * duration)} / {fmt(duration)}
          </span>

          <div className="flex-1" />

          <button onClick={toggleMute} className="text-text-muted hover:text-honey-400 transition-colors">
            {muted || volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
          <input
            type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume}
            onChange={e => changeVolume(parseFloat(e.target.value))}
            className="w-16 h-1 cursor-pointer"
            style={{ accentColor: "#f5c542" }}
          />
        </div>
      </div>
    </div>
  )
}

export { WaveformBars, AudioPlayer }
