"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Music, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Plus, X, Radio, Link, Upload, ChevronDown, ChevronUp } from "lucide-react"

interface RadioTrack {
  id: string
  title: string
  artist?: string
  src: string        // data URL or external URL
  type?: "file" | "url"
  addedAt?: Date
  coverUrl?: string  // station tracks only
}

const STORAGE_KEY = "sparkie_radio_tracks"
const SPARKIE_RADIO_PLAYLIST_URL =
  "https://raw.githubusercontent.com/Draguniteus/SparkieRadio/main/playlist.json"

function loadTracks(): RadioTrack[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RadioTrack[]
    return parsed.map(t => ({ ...t, addedAt: t.addedAt ? new Date(t.addedAt) : new Date() }))
  } catch { return [] }
}

async function loadTracksFromDB(): Promise<RadioTrack[]> {
  try {
    const res = await fetch('/api/radio/tracks')
    if (res.ok) {
      const { tracks } = await res.json() as { tracks: RadioTrack[] }
      return (tracks ?? []).map(t => ({ ...t, addedAt: new Date(t.addedAt ?? Date.now()) }))
    }
  } catch {}
  return []
}

function saveTracks(tracks: RadioTrack[]) {
  try {
    // Only persist URL tracks (not data: blobs — too large for localStorage)
    const toSave = tracks.filter(t => t.type === "url")
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
    // Sync to DB (fire-and-forget)
    fetch('/api/radio/tracks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracks: toSave }),
    }).catch(() => {})
  } catch {}
}

export function RadioPlayer() {
  const [tracks, setTracks] = useState<RadioTrack[]>([])
  const [currentIndex, setCurrentIndex] = useState<number>(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playError, setPlayError] = useState(false)
  const [volume, setVolume] = useState(0.8)
  const [isMuted, setIsMuted] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showAddForm, setShowAddForm] = useState(false)
  const [urlInput, setUrlInput] = useState("")
  const [titleInput, setTitleInput] = useState("")
  const [artistInput, setArtistInput] = useState("")
  const [isCollapsed, setIsCollapsed] = useState(false)
  const { data: session } = useSession()
  const isAdmin = session?.user?.email?.toLowerCase() === "draguniteus@gmail.com"
  const [stationTracks, setStationTracks] = useState<RadioTrack[]>([])
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [activeTab, setActiveTab] = useState<"station" | "mine">("station")
  const [showStationUpload, setShowStationUpload] = useState(false)
  // Drag-reorder state (admin Station tab only)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [isReordering, setIsReordering] = useState(false)
  const [stationUploadFile, setStationUploadFile] = useState<File | null>(null)
  const [stationUploadTitle, setStationUploadTitle] = useState("")
  const [stationUploadArtist, setStationUploadArtist] = useState("")
  const [stationUploading, setStationUploading] = useState(false)
  const [stationUploadError, setStationUploadError] = useState<string | null>(null)
  const stationFileInputRef = useRef<HTMLInputElement>(null)
  const stationCoverInputRef = useRef<HTMLInputElement>(null)
  const [stationCoverFile, setStationCoverFile] = useState<File | null>(null)
  const [stationCoverPreview, setStationCoverPreview] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Hydrate from localStorage on mount, then merge DB tracks (DB wins for cross-device)
  useEffect(() => {
    const localTracks = loadTracks()
    setTracks(localTracks)
    loadTracksFromDB().then(dbTracks => {
      if (dbTracks.length > 0) {
        setTracks(dbTracks)
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(dbTracks)) } catch {}
      }
    })
  }, [])

  // Save URL tracks when tracks change
  useEffect(() => {
    saveTracks(tracks)
  }, [tracks])

  // Fetch Sparkie Radio station playlist from GitHub
  const syncStation = useCallback(async () => {
    setIsSyncing(true)
    try {
      const res = await fetch(SPARKIE_RADIO_PLAYLIST_URL + "?t=" + Date.now())
      if (!res.ok) throw new Error("fetch failed")
      const data = await res.json() as Array<{ id: string; title: string; artist?: string; url: string }>
      const mapped: RadioTrack[] = data.map((item: { id?: string; title?: string; artist?: string; url?: string; coverUrl?: string }) => ({
        id: item.id ?? crypto.randomUUID(),
        title: item.title ?? "Untitled",
        artist: item.artist,
        src: item.url ?? "",
        coverUrl: item.coverUrl,
      }))
      setStationTracks(mapped)
      setLastSync(new Date())
    } catch {
      // silently ignore — keep existing station tracks
    } finally {
      setIsSyncing(false)
    }
  }, [])

  // Auto-sync on mount + every 5 minutes
  useEffect(() => {
    syncStation()
    const interval = setInterval(syncStation, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [syncStation])

  const allTracks = activeTab === "station" ? stationTracks : tracks
  const currentTrack = currentIndex >= 0 ? allTracks[currentIndex] : null

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
    if (index < 0 || index >= allTracks.length) return
    const track = allTracks[index]
    setCurrentIndex(index)

    const audio = audioRef.current
    if (!audio) return

    audio.src = track.src
    audio.volume = isMuted ? 0 : volume
    setPlayError(false)
    audio.play().then(() => {
      setIsPlaying(true)
      startProgressTracking()
    }).catch(() => {
      setIsPlaying(false)
    })
  }, [allTracks, volume, isMuted, startProgressTracking])

  // ─── Slash command event listeners (/startradio, /stopradio) ─────────────────
  useEffect(() => {
    const handleStart = () => {
      if (!isPlaying) {
        if (allTracks.length > 0) {
          playTrack(currentIndex >= 0 ? currentIndex : 0)
        }
      }
    }
    const handleStop = () => {
      const audio = audioRef.current
      if (audio && isPlaying) {
        audio.pause()
        setIsPlaying(false)
        clearProgressInterval()
      }
    }
    window.addEventListener('sparkie:startradio', handleStart)
    window.addEventListener('sparkie:stopradio', handleStop)
    return () => {
      window.removeEventListener('sparkie:startradio', handleStart)
      window.removeEventListener('sparkie:stopradio', handleStop)
    }
  }, [isPlaying, allTracks, currentIndex, playTrack, clearProgressInterval])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    if (!currentTrack && allTracks.length > 0) {
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
  }, [isPlaying, currentTrack, allTracks, playTrack, clearProgressInterval, startProgressTracking])

  const skipNext = useCallback(() => {
    if (allTracks.length === 0) return
    const next = currentIndex < allTracks.length - 1 ? currentIndex + 1 : 0
    playTrack(next)
  }, [currentIndex, allTracks.length, playTrack])

  const skipPrev = useCallback(() => {
    if (allTracks.length === 0) return
    const audio = audioRef.current
    // If more than 3s in, restart; otherwise go back
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0
      return
    }
    const prev = currentIndex > 0 ? currentIndex - 1 : allTracks.length - 1
    playTrack(prev)
  }, [currentIndex, allTracks.length, playTrack])

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

  const handleDragReorder = useCallback(async (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return
    const reordered = [...stationTracks]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setStationTracks(reordered)
    if (currentIndex === fromIdx) {
      setCurrentIndex(toIdx)
    } else if (currentIndex > fromIdx && currentIndex <= toIdx) {
      setCurrentIndex(i => i - 1)
    } else if (currentIndex < fromIdx && currentIndex >= toIdx) {
      setCurrentIndex(i => i + 1)
    }
    setIsReordering(true)
    try {
      const res = await fetch('/api/radio/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: reordered.map(t => t.id) })
      })
      if (!res.ok) {
        console.error('Reorder failed:', await res.json().catch(() => ({})))
        await syncStation()
      }
    } catch {
      await syncStation()
    } finally {
      setIsReordering(false)
    }
  }, [stationTracks, currentIndex, syncStation])

  const handleDragStart = useCallback((e: React.DragEvent, idx: number) => {
    setDragIndex(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(idx)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, toIdx: number) => {
    e.preventDefault()
    if (dragIndex !== null && dragIndex !== toIdx) {
      handleDragReorder(dragIndex, toIdx)
    }
    setDragIndex(null)
    setDragOverIndex(null)
  }, [dragIndex, handleDragReorder])

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
    setDragOverIndex(null)
  }, [])

    const handleStationUpload = useCallback(async () => {
    if (!stationUploadFile || !stationUploadTitle.trim()) return
    setStationUploading(true)
    setStationUploadError(null)
    try {
      const fd = new FormData()
      fd.append("file", stationUploadFile)
      fd.append("title", stationUploadTitle.trim())
      if (stationUploadArtist.trim()) fd.append("artist", stationUploadArtist.trim())
      if (stationCoverFile) fd.append("coverImage", stationCoverFile)
      const res = await fetch("/api/radio/upload", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Upload failed")
      // Reset form
      setStationUploadFile(null)
      setStationUploadTitle("")
      setStationUploadArtist("")
      setStationCoverFile(null)
      setStationCoverPreview(null)
      setShowStationUpload(false)
      if (stationFileInputRef.current) stationFileInputRef.current.value = ""
      if (stationCoverInputRef.current) stationCoverInputRef.current.value = ""
      // Refresh station immediately
      await syncStation()
    } catch (err) {
      setStationUploadError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setStationUploading(false)
    }
  }, [stationUploadFile, stationUploadTitle, stationUploadArtist, stationCoverFile, syncStation])

  const formatTime = (s: number) => {
    if (!isFinite(s)) return "0:00"
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, "0")}`
  }

  return (
    <div className="flex flex-col h-full bg-hive-700 rounded-xl border border-hive-border overflow-hidden">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onEnded={skipNext}
        onError={() => { setIsPlaying(false); clearProgressInterval(); setPlayError(true) }}
      />
      <input ref={fileInputRef} type="file" accept="audio/*" multiple className="hidden" onChange={handleFileUpload} />
      <input
        ref={stationFileInputRef}
        type="file"
        accept="audio/mpeg,audio/ogg,audio/aac,audio/wav"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) {
            setStationUploadFile(f)
            if (!stationUploadTitle) setStationUploadTitle(f.name.replace(/\.[^.]+$/, ""))
          }
        }}
      />
      <input
        ref={stationCoverInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) {
            setStationCoverFile(f)
            const url = URL.createObjectURL(f)
            setStationCoverPreview(url)
          }
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-hive-border shrink-0">
        <div className="flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5 text-honey-500" />
          <span className="text-xs font-semibold text-text-primary">Sparkie Radio</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setActiveTab("station"); setCurrentIndex(-1) }}
            className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${activeTab === "station" ? "bg-honey-500/20 text-honey-500" : "text-text-muted hover:text-text-secondary"}`}
          >
            🎙 Station {stationTracks.length > 0 && `(${stationTracks.length})`}
          </button>
          <button
            onClick={() => { setActiveTab("mine"); setCurrentIndex(-1) }}
            className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${activeTab === "mine" ? "bg-honey-500/20 text-honey-500" : "text-text-muted hover:text-text-secondary"}`}
          >
            My Tracks {tracks.length > 0 && `(${tracks.length})`}
          </button>
          <button
            onClick={() => setIsCollapsed(c => !c)}
            className="text-text-muted hover:text-text-secondary transition-colors"
          >
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Now playing — Pro player */}
          <div className="px-3 pt-3 pb-2 shrink-0">
            {/* Cover art + track info row */}
            <div className="flex items-start gap-3 mb-2">
              {/* Cover art */}
              <div className="relative w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-hive-600 border border-hive-border shadow-md flex items-center justify-center">
                {activeTab === "station" && currentTrack?.coverUrl ? (
                  <img src={currentTrack.coverUrl} alt={currentTrack.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex items-center justify-center w-full h-full">
                    {isPlaying ? (
                      <Music className="w-6 h-6 text-honey-500 animate-pulse" />
                    ) : (
                      <Music className="w-6 h-6 text-text-muted" />
                    )}
                  </div>
                )}
                {isPlaying && (
                  <div className="absolute inset-0 flex items-end justify-center gap-[2px] pb-1 bg-black/30">
                    <span className="w-[3px] bg-honey-500 rounded-sm animate-[equalizer_0.8s_ease-in-out_infinite]" style={{height:'40%',animationDelay:'0ms'}} />
                    <span className="w-[3px] bg-honey-500 rounded-sm animate-[equalizer_0.8s_ease-in-out_infinite]" style={{height:'65%',animationDelay:'150ms'}} />
                    <span className="w-[3px] bg-honey-500 rounded-sm animate-[equalizer_0.8s_ease-in-out_infinite]" style={{height:'50%',animationDelay:'300ms'}} />
                  </div>
                )}
              </div>
              {/* Track info + download */}
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-xs font-semibold text-text-primary truncate">{currentTrack?.title ?? "No track selected"}</p>
                <p className="text-[10px] text-text-muted truncate mt-0.5">
                  {playError
                    ? <span className="text-yellow-500">⚠ Use a direct audio URL (.mp3/.ogg/stream)</span>
                    : (currentTrack?.artist ?? (allTracks.length === 0 ? "Add tracks to get started" : ""))}
                </p>
                {/* Download button — station tracks only */}
                {activeTab === "station" && currentTrack && !playError && (
                  <a
                    href={currentTrack.src}
                    download={currentTrack.title + ".mp3"}
                    className="inline-flex items-center gap-1 mt-1.5 text-[10px] px-2 py-0.5 rounded-full bg-honey-500/10 text-honey-500/80 border border-honey-500/20 hover:bg-honey-500/20 transition-colors"
                    onClick={e => e.stopPropagation()}
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 15V3m0 12-4-4m4 4 4-4M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17" /></svg>
                    Download
                  </a>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[9px] text-text-muted w-6 text-right">{formatTime(progress)}</span>
              <input
                type="range" min={0} max={duration || 0} step={0.5} value={progress}
                onChange={handleSeek}
                className="flex-1 h-1 accent-honey-500 cursor-pointer rounded-full"
                style={{background: `linear-gradient(to right, var(--color-honey-500, #f59e0b) ${duration ? (progress/duration*100) : 0}%, rgba(255,255,255,0.1) 0%)`}}
              />
              <span className="text-[9px] text-text-muted w-6">{formatTime(duration)}</span>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-3 mb-2">
              <button onClick={skipPrev} className="text-text-muted hover:text-text-primary transition-colors"><SkipBack className="w-4 h-4" /></button>
              <button
                onClick={togglePlay}
                className="w-9 h-9 rounded-full bg-honey-500 hover:bg-honey-400 flex items-center justify-center transition-colors shadow-md"
              >
                {isPlaying ? <Pause className="w-4 h-4 text-hive-900" /> : <Play className="w-4 h-4 text-hive-900 ml-0.5" />}
              </button>
              <button onClick={skipNext} className="text-text-muted hover:text-text-primary transition-colors"><SkipForward className="w-4 h-4" /></button>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-1.5">
              <button onClick={toggleMute} className="text-text-muted hover:text-text-primary transition-colors">
                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
              <input
                type="range" min={0} max={1} step={0.01} value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="flex-1 h-1 accent-honey-500"
              />
            </div>
          </div>

          {/* Playlist */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {activeTab === "station" && (
              <div className="px-3 py-1.5 flex items-center justify-between border-b border-hive-border">
                <span className="text-[10px] text-text-muted">
                  {isReordering ? <span className="text-honey-500 animate-pulse">saving order…</span> : lastSync ? `Synced ${lastSync.toLocaleTimeString()}` : "Syncing…"}
                </span>
                <div className="flex items-center gap-1">
                  {isAdmin && (
                    <button
                      onClick={() => setShowStationUpload(v => !v)}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-honey-500/15 text-honey-500 hover:bg-honey-500/25 transition-colors"
                    >
                      {showStationUpload ? "✕ Cancel" : "＋ Add to Station"}
                    </button>
                  )}
                  <button
                    onClick={syncStation}
                    disabled={isSyncing}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-hive-600 text-text-muted hover:text-text-secondary transition-colors disabled:opacity-50"
                  >
                    {isSyncing ? "Syncing…" : "↻ Refresh"}
                  </button>
                </div>
              </div>
            )}

            {isAdmin && showStationUpload && (
              <div className="px-3 py-2 border-b border-hive-border space-y-2">
                {/* Audio + Cover row */}
                <div className="flex gap-2">
                  {/* Audio file picker */}
                  <div
                    onClick={() => stationFileInputRef.current?.click()}
                    className="flex-1 py-2 border border-dashed border-hive-border rounded-lg text-center cursor-pointer hover:border-honey-500/50 transition-colors"
                  >
                    {stationUploadFile ? (
                      <span className="text-[10px] text-text-primary truncate block px-1">{stationUploadFile.name}</span>
                    ) : (
                      <span className="text-[10px] text-text-muted">🎵 Pick MP3 / OGG</span>
                    )}
                  </div>
                  {/* Cover art picker */}
                  <div
                    onClick={() => stationCoverInputRef.current?.click()}
                    className="w-14 h-10 border border-dashed border-hive-border rounded-lg cursor-pointer hover:border-honey-500/50 transition-colors overflow-hidden flex items-center justify-center shrink-0 relative"
                  >
                    {stationCoverPreview ? (
                      <img src={stationCoverPreview} alt="cover" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-text-muted text-center leading-tight">🖼<br />Art</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <input
                    value={stationUploadTitle}
                    placeholder="Title *"
                    onChange={e => setStationUploadTitle(e.target.value)}
                    className="flex-1 text-xs bg-hive-700 border border-hive-border rounded-md px-2 py-1.5 text-text-primary placeholder:text-text-muted outline-none focus:border-honey-500/50"
                  />
                  <input
                    value={stationUploadArtist}
                    placeholder="Artist"
                    onChange={e => setStationUploadArtist(e.target.value)}
                    className="flex-1 text-xs bg-hive-700 border border-hive-border rounded-md px-2 py-1.5 text-text-primary placeholder:text-text-muted outline-none focus:border-honey-500/50"
                  />
                </div>
                {stationUploadError && (
                  <p className="text-[10px] text-red-400">{stationUploadError}</p>
                )}
                <button
                  onClick={handleStationUpload}
                  disabled={stationUploading || !stationUploadFile || !stationUploadTitle.trim()}
                  className="w-full text-xs py-1.5 rounded-md bg-honey-500 text-hive-900 font-semibold hover:bg-honey-400 disabled:opacity-50 transition-colors"
                >
                  {stationUploading ? "Uploading to Station…" : "🎙 Upload to SparkieRadio"}
                </button>
              </div>
            )}

            {allTracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                {activeTab === "station" ? (
                  <>
                    <Radio className="w-8 h-8 text-text-muted mb-2" />
                    <p className="text-xs text-text-muted">Station is empty</p>
                    <p className="text-[10px] text-text-muted mt-1">Add MP3s to SparkieRadio on GitHub</p>
                  </>
                ) : (
                  <>
                    <Music className="w-8 h-8 text-text-muted mb-2" />
                    <p className="text-xs text-text-muted">No tracks yet</p>
                    <p className="text-[10px] text-text-muted mt-1">Upload MP3s or add URL links</p>
                  </>
                )}
              </div>
            ) : (
              <div className="py-1">
                {allTracks.map((track, idx) => (
                  <div
                    key={track.id}
                    onClick={() => playTrack(idx)}
                    draggable={isAdmin && activeTab === "station"}
                    onDragStart={isAdmin && activeTab === "station" ? e => handleDragStart(e, idx) : undefined}
                    onDragOver={isAdmin && activeTab === "station" ? e => handleDragOver(e, idx) : undefined}
                    onDrop={isAdmin && activeTab === "station" ? e => handleDrop(e, idx) : undefined}
                    onDragEnd={isAdmin && activeTab === "station" ? handleDragEnd : undefined}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer group transition-colors ${
                      idx === currentIndex
                        ? "bg-honey-500/10 border border-honey-500/20"
                        : "hover:bg-hive-hover"
                    } ${dragOverIndex === idx && dragIndex !== idx ? "border border-honey-500/60 bg-honey-500/5" : ""} ${dragIndex === idx ? "opacity-40" : ""}`}
                  >
                    {isAdmin && activeTab === "station" && (
                      <div
                        className="shrink-0 text-text-muted opacity-0 group-hover:opacity-60 cursor-grab active:cursor-grabbing transition-opacity select-none"
                        title="Drag to reorder"
                        onMouseDown={e => e.stopPropagation()}
                      >
                        <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
                          <circle cx="3" cy="3" r="1.5"/><circle cx="7" cy="3" r="1.5"/>
                          <circle cx="3" cy="8" r="1.5"/><circle cx="7" cy="8" r="1.5"/>
                          <circle cx="3" cy="13" r="1.5"/><circle cx="7" cy="13" r="1.5"/>
                        </svg>
                      </div>
                    )}
                    <div className="w-8 h-8 rounded-md overflow-hidden shrink-0 bg-hive-600 flex items-center justify-center relative">
                      {activeTab === "station" && track.coverUrl ? (
                        idx === currentIndex && isPlaying ? (
                          <div className="relative w-full h-full">
                            <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 flex items-end justify-center gap-[2px] pb-0.5 bg-black/40">
                              <span className="w-[2px] bg-honey-500 rounded-sm animate-[equalizer_0.8s_ease-in-out_infinite]" style={{height:'40%',animationDelay:'0ms'}} />
                              <span className="w-[2px] bg-honey-500 rounded-sm animate-[equalizer_0.8s_ease-in-out_infinite]" style={{height:'65%',animationDelay:'150ms'}} />
                              <span className="w-[2px] bg-honey-500 rounded-sm animate-[equalizer_0.8s_ease-in-out_infinite]" style={{height:'50%',animationDelay:'300ms'}} />
                            </div>
                          </div>
                        ) : (
                          <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
                        )
                      ) : (
                        <span className="text-[10px] text-text-muted font-mono">{idx === currentIndex && isPlaying ? "♪" : idx + 1}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text-primary truncate">{track.title}</p>
                      {track.artist && (
                        <p className="text-[10px] text-text-muted truncate">{track.artist}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {track.type === "url" ? <Link className="w-3 h-3 text-text-muted" /> : <Upload className="w-3 h-3 text-text-muted" />}
                      <button
                        onClick={e => { e.stopPropagation(); removeTrack(track.id) }}
                        className="w-5 h-5 rounded flex items-center justify-center text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add track section — only for My Tracks tab */}
            {activeTab === "mine" &&
              <div className="px-3 py-2 border-t border-hive-border">
                {showAddForm ? (
                  <div className="space-y-1.5">
                    <input
                      value={urlInput}
                      placeholder="Audio URL (direct .mp3/.ogg/stream)"
                      onChange={e => setUrlInput(e.target.value)}
                      className="w-full text-xs bg-hive-700 border border-hive-border rounded-md px-2 py-1.5 text-text-primary placeholder:text-text-muted outline-none focus:border-honey-500/50"
                    />
                    <div className="flex gap-1">
                      <input
                        value={titleInput}
                        placeholder="Title"
                        onChange={e => setTitleInput(e.target.value)}
                        className="flex-1 text-xs bg-hive-700 border border-hive-border rounded-md px-2 py-1.5 text-text-primary placeholder:text-text-muted outline-none focus:border-honey-500/50"
                      />
                      <input
                        value={artistInput}
                        placeholder="Artist"
                        onChange={e => setArtistInput(e.target.value)}
                        className="flex-1 text-xs bg-hive-700 border border-hive-border rounded-md px-2 py-1.5 text-text-primary placeholder:text-text-muted outline-none focus:border-honey-500/50"
                      />
                    </div>
                    <div className="flex gap-1">
                      <button onClick={addUrlTrack} className="flex-1 text-xs py-1.5 rounded-md bg-honey-500 text-hive-900 font-semibold hover:bg-honey-400 transition-colors">Add Link</button>
                      <button
                        onClick={() => setShowAddForm(false)}
                        className="text-xs px-3 py-1.5 rounded-md bg-hive-700 text-text-muted hover:text-text-secondary transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md bg-hive-700 border border-hive-border text-text-secondary hover:text-honey-500 hover:border-honey-500/30 transition-all"
                    ><Upload className="w-3 h-3" /> Upload MP3</button>
                    <button
                      onClick={() => setShowAddForm(true)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md bg-hive-700 border border-hive-border text-text-secondary hover:text-honey-500 hover:border-honey-500/30 transition-all"
                    >
                      <Plus className="w-3 h-3" /> Add URL
                    </button>
                  </div>
                )}
              </div>
            }
          </div>
        </>
      )}
    </div>
  )
}
