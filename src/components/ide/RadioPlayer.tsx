"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Music, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Plus, X, Radio, Link, Upload, ChevronDown, ChevronUp } from "lucide-react"

interface RadioTrack {
  id: string
  title: string
  artist?: string
  src: string        // data URL or external URL
  type: "file" | "url"
  addedAt: Date
}

const STORAGE_KEY = "sparkie_radio_tracks"

function loadTracks(): RadioTrack[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RadioTrack[]
    return parsed.map(t => ({ ...t, addedAt: new Date(t.addedAt) }))
  } catch { return [] }
}

function saveTracks(tracks: RadioTrack[]) {
  try {
    // Only persist URL tracks (not data: blobs — too large for localStorage)
    const toSave = tracks.filter(t => t.type === "url")
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  } catch {}
}

export function RadioPlayer() {
  const [tracks, setTracks] = useState<RadioTrack[]>([])
  const [currentIndex, setCurrentIndex] = useState<number>(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(0.8)
  const [isMuted, setIsMuted] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showAddForm, setShowAddForm] = useState(false)
  const [urlInput, setUrlInput] = useState("")
  const [titleInput, setTitleInput] = useState("")
  const [artistInput, setArtistInput] = useState("")
  const [isCollapsed, setIsCollapsed] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Hydrate from localStorage on mount
  useEffect(() => {
    setTracks(loadTracks())
  }, [])

  // Save URL tracks when tracks change
  useEffect(() => {
    saveTracks(tracks)
  }, [tracks])

  const currentTrack = currentIndex >= 0 ? tracks[currentIndex] : null

  const clearProgressInterval = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
  }, [])

  const startProgressTracking = useCallback(() => {
    clearProgressInterval()
    progressIntervalRef.current = setInterval(() => {
      const audio = audioRef.current
      if (audio && !isNaN(audio.duration)) {
        setProgress(audio.currentTime)
        setDuration(audio.duration)
      }
    }, 500)
  }, [clearProgressInterval])

  const playTrack = useCallback((index: number) => {
    if (index < 0 || index >= tracks.length) return
    const track = tracks[index]
    setCurrentIndex(index)

    const audio = audioRef.current
    if (!audio) return

    audio.src = track.src
    audio.volume = isMuted ? 0 : volume
    audio.play().then(() => {
      setIsPlaying(true)
      startProgressTracking()
    }).catch(() => {
      setIsPlaying(false)
    })
  }, [tracks, volume, isMuted, startProgressTracking])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    if (!currentTrack && tracks.length > 0) {
      playTrack(0)
      return
    }

    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
      clearProgressInterval()
    } else {
      audio.play().then(() => {
        setIsPlaying(true)
        startProgressTracking()
      }).catch(() => {})
    }
  }, [isPlaying, currentTrack, tracks, playTrack, clearProgressInterval, startProgressTracking])

  const skipNext = useCallback(() => {
    if (tracks.length === 0) return
    const next = currentIndex < tracks.length - 1 ? currentIndex + 1 : 0
    playTrack(next)
  }, [currentIndex, tracks.length, playTrack])

  const skipPrev = useCallback(() => {
    if (tracks.length === 0) return
    const audio = audioRef.current
    // If more than 3s in, restart; otherwise go back
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0
      return
    }
    const prev = currentIndex > 0 ? currentIndex - 1 : tracks.length - 1
    playTrack(prev)
  }, [currentIndex, tracks.length, playTrack])

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (!audio) return
    const t = parseFloat(e.target.value)
    audio.currentTime = t
    setProgress(t)
  }, [])

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    setVolume(v)
    setIsMuted(false)
    if (audioRef.current) audioRef.current.volume = v
  }, [])

  const toggleMute = useCallback(() => {
    const next = !isMuted
    setIsMuted(next)
    if (audioRef.current) audioRef.current.volume = next ? 0 : volume
  }, [isMuted, volume])

  const addUrlTrack = useCallback(() => {
    if (!urlInput.trim()) return
    const track: RadioTrack = {
      id: crypto.randomUUID(),
      title: titleInput.trim() || urlInput.split("/").pop() || "Track",
      artist: artistInput.trim() || undefined,
      src: urlInput.trim(),
      type: "url",
      addedAt: new Date(),
    }
    setTracks(prev => [...prev, track])
    setUrlInput("")
    setTitleInput("")
    setArtistInput("")
    setShowAddForm(false)
  }, [urlInput, titleInput, artistInput])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    files.forEach(file => {
      if (!file.type.startsWith("audio/") && !file.type.startsWith("video/")) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        const src = ev.target?.result as string
        if (!src) return
        const track: RadioTrack = {
          id: crypto.randomUUID(),
          title: file.name.replace(/\.[^.]+$/, ""),
          src,
          type: "file",
          addedAt: new Date(),
        }
        setTracks(prev => [...prev, track])
      }
      reader.readAsDataURL(file)
    })
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [])

  const removeTrack = useCallback((id: string) => {
    setTracks(prev => {
      const idx = prev.findIndex(t => t.id === id)
      const next = prev.filter(t => t.id !== id)
      if (idx === currentIndex) {
        audioRef.current?.pause()
        setIsPlaying(false)
        setCurrentIndex(-1)
        clearProgressInterval()
      } else if (idx < currentIndex) {
        setCurrentIndex(i => i - 1)
      }
      return next
    })
  }, [currentIndex, clearProgressInterval])

  const formatTime = (s: number) => {
    if (!isFinite(s)) return "0:00"
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, "0")}`
  }

  return (
    <div className="flex flex-col h-full bg-hive-900 select-none">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onEnded={skipNext}
        onError={() => { setIsPlaying(false); clearProgressInterval() }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,video/mp4"
        multiple
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-hive-border shrink-0">
        <div className="flex items-center gap-2">
          <Radio size={16} className="text-honey-500" />
          <span className="text-sm font-semibold text-honey-500">Sparkie Radio</span>
          <span className="text-xs text-text-muted">{tracks.length} tracks</span>
        </div>
        <button
          onClick={() => setIsCollapsed(c => !c)}
          className="text-text-muted hover:text-text-secondary transition-colors"
        >
          {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {!isCollapsed && (
        <>
          {/* Now playing */}
          <div className="px-4 py-4 border-b border-hive-border shrink-0">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-honey-500/10 border border-honey-500/20 flex items-center justify-center shrink-0">
                {isPlaying ? (
                  <Music size={18} className="text-honey-500 animate-pulse" />
                ) : (
                  <Music size={18} className="text-honey-500/50" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary truncate">
                  {currentTrack?.title ?? "No track selected"}
                </p>
                <p className="text-xs text-text-muted truncate">
                  {currentTrack?.artist ?? (tracks.length === 0 ? "Add tracks to get started" : "Unknown Artist")}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-2">
              <input
                type="range"
                min={0}
                max={duration || 1}
                value={progress}
                onChange={handleSeek}
                className="w-full h-1 accent-honey-500 cursor-pointer"
              />
              <div className="flex justify-between text-xs text-text-muted mt-1">
                <span>{formatTime(progress)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={skipPrev}
                  disabled={tracks.length === 0}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-text-secondary hover:text-honey-500 disabled:opacity-30 transition-colors"
                >
                  <SkipBack size={16} />
                </button>
                <button
                  onClick={togglePlay}
                  disabled={tracks.length === 0}
                  className="w-9 h-9 rounded-full bg-honey-500/15 border border-honey-500/30 flex items-center justify-center text-honey-500 hover:bg-honey-500/25 disabled:opacity-30 transition-all"
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <button
                  onClick={skipNext}
                  disabled={tracks.length === 0}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-text-secondary hover:text-honey-500 disabled:opacity-30 transition-colors"
                >
                  <SkipForward size={16} />
                </button>
              </div>

              {/* Volume */}
              <div className="flex items-center gap-1.5">
                <button onClick={toggleMute} className="text-text-muted hover:text-text-secondary transition-colors">
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 h-1 accent-honey-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Playlist */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {tracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-text-muted text-sm gap-2">
                <Radio size={24} className="text-honey-500/30" />
                <p>No tracks yet</p>
                <p className="text-xs">Upload MP3s or add URL links</p>
              </div>
            ) : (
              <div className="p-2 flex flex-col gap-0.5">
                {tracks.map((track, idx) => (
                  <div
                    key={track.id}
                    onClick={() => playTrack(idx)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer group transition-colors ${
                      idx === currentIndex
                        ? "bg-honey-500/10 border border-honey-500/20"
                        : "hover:bg-hive-hover"
                    }`}
                  >
                    <div className={`w-5 h-5 flex items-center justify-center shrink-0 ${
                      idx === currentIndex ? "text-honey-500" : "text-text-muted"
                    }`}>
                      {idx === currentIndex && isPlaying ? (
                        <Music size={12} className="animate-pulse" />
                      ) : (
                        <span className="text-xs">{idx + 1}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-medium truncate ${idx === currentIndex ? "text-honey-500" : "text-text-primary"}`}>
                        {track.title}
                      </p>
                      {track.artist && (
                        <p className="text-xs text-text-muted truncate">{track.artist}</p>
                      )}
                    </div>
                    <span className="text-xs text-text-muted shrink-0 opacity-0 group-hover:opacity-100">
                      {track.type === "url" ? <Link size={10} /> : <Upload size={10} />}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeTrack(track.id) }}
                      className="w-5 h-5 rounded flex items-center justify-center text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add track section */}
          <div className="border-t border-hive-border p-3 shrink-0">
            {showAddForm ? (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="URL (mp3, stream, YouTube...)"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  className="w-full text-xs bg-hive-700 border border-hive-border rounded-md px-2 py-1.5 text-text-primary placeholder:text-text-muted outline-none focus:border-honey-500/50"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Title (optional)"
                    value={titleInput}
                    onChange={e => setTitleInput(e.target.value)}
                    className="flex-1 text-xs bg-hive-700 border border-hive-border rounded-md px-2 py-1.5 text-text-primary placeholder:text-text-muted outline-none focus:border-honey-500/50"
                  />
                  <input
                    type="text"
                    placeholder="Artist"
                    value={artistInput}
                    onChange={e => setArtistInput(e.target.value)}
                    className="flex-1 text-xs bg-hive-700 border border-hive-border rounded-md px-2 py-1.5 text-text-primary placeholder:text-text-muted outline-none focus:border-honey-500/50"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={addUrlTrack}
                    disabled={!urlInput.trim()}
                    className="flex-1 text-xs py-1.5 rounded-md bg-honey-500/15 text-honey-500 border border-honey-500/30 hover:bg-honey-500/25 disabled:opacity-30 transition-all"
                  >
                    Add Link
                  </button>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="text-xs px-3 py-1.5 rounded-md bg-hive-700 text-text-muted hover:text-text-secondary transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md bg-hive-700 border border-hive-border text-text-secondary hover:text-honey-500 hover:border-honey-500/30 transition-all"
                >
                  <Upload size={12} />
                  Upload MP3
                </button>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md bg-hive-700 border border-hive-border text-text-secondary hover:text-honey-500 hover:border-honey-500/30 transition-all"
                >
                  <Link size={12} />
                  Add URL
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
