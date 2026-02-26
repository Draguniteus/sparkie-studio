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
  const [stationUploadFile, setStationUploadFile] = useState<File | null>(null)
  const [stationUploadTitle, setStationUploadTitle] = useState("")
  const [stationUploadArtist, setStationUploadArtist] = useState("")
  const [stationUploading, setStationUploading] = useState(false)
  const [stationUploadError, setStationUploadError] = useState<string | null>(null)
  const stationFileInputRef = useRef<HTMLInputElement | null>(null)
  const stationCoverInputRef = useRef<HTMLInputElement | null>(null)
  const [stationCoverFile, setStationCoverFile] = useState<File | null>(null)
  const [stationCoverPreview, setStationCoverPreview] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Hydrate from localStorage on mount
  useEffect(() => {
    setTracks(loadTracks())
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
  }, [tracks, volume, isMuted, startProgressTracking])

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
  }, [isPlaying, currentTrack, tracks, playTrack, clearProgressInterval, startProgressTracking])

  const skipNext = useCallback(() => {
    if (allTracks.length === 0) return
    const next = currentIndex < allTracks.length - 1 ? currentIndex + 1 : 0
    playTrack(next)
  }, [currentIndex, tracks.length, playTrack])

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
  }, [stationUploadFile, stationUploadTitle, stationUploadArtist, syncStation])

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
        onError={() => { setIsPlaying(false); clearProgressInterval(); setPlayError(true) }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,video/mp4"
        multiple
        className="hidden"
        onChange={handleFileUpload}
      />
      <input
        ref={stationFileInputRef}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/ogg,audio/aac,audio/wav,.mp3,.ogg,.aac,.wav"
        className="hidden"
        onChange={e => {
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
        accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) {
            setStationCoverFile(f)
            const url = URL.createObjectURL(f)
            setStationCoverPreview(url)
          }
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-hive-border shrink-0">
        <div className="flex items-center gap-2">
          <Radio size={16} className="text-honey-500" />
          <span className="text-sm font-semibold text-honey-500">Sparkie Radio</span>
          <div className="flex items-center gap-1 ml-1">
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
          </div>
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
          {/* Now playing — Pro player */}
          <div className="px-4 py-4 border-b border-hive-border shrink-0">
            {/* Cover art + track info row */}
            <div className="flex items-center gap-3 mb-3">
              {/* Cover art */}
              <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-gradient-to-br from-honey-500/20 to-hive-700 border border-honey-500/20 shadow-lg">
                {activeTab === "station" && currentTrack?.coverUrl ? (
                  <img
                    src={currentTrack.coverUrl}
                    alt={currentTrack.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {isPlaying ? (
                      <Music size={22} className="text-honey-500 animate-pulse" />
                    ) : (
                      <Music size={22} className="text-honey-500/40" />
                    )}
                  </div>
                )}
                {isPlaying && (
                  <div className="absolute inset-0 bg-black/10 flex items-end justify-center pb-1">
                    <div className="flex gap-0.5 items-end h-3">
                      <span className="w-0.5 bg-honey-400 rounded-full animate-[equalizer_0.8s_ease-in-out_infinite]" style={{height: '40%', animationDelay: '0ms'}} />
                      <span className="w-0.5 bg-honey-400 rounded-full animate-[equalizer_0.8s_ease-in-out_infinite]" style={{height: '100%', animationDelay: '150ms'}} />
                      <span className="w-0.5 bg-honey-400 rounded-full animate-[equalizer_0.8s_ease-in-out_infinite]" style={{height: '60%', animationDelay: '300ms'}} />
                      <span className="w-0.5 bg-honey-400 rounded-full animate-[equalizer_0.8s_ease-in-out_infinite]" style={{height: '80%', animationDelay: '100ms'}} />
                    </div>
                  </div>
                )}
              </div>

              {/* Track info + download */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text-primary truncate leading-tight">
                  {currentTrack?.title ?? "No track selected"}
                </p>
                <p className="text-xs text-text-muted truncate mt-0.5">
                  {playError
                    ? <span className="text-yellow-400">⚠ Use a direct audio URL (.mp3/.ogg/stream)</span>
                    : (currentTrack?.artist ?? (allTracks.length === 0 ? "Add tracks to get started" : ""))}
                </p>
                {/* Download button — station tracks only */}
                {activeTab === "station" && currentTrack && !playError && (
                  <a
                    href={currentTrack.src}
                    download={currentTrack.title + ".mp3"}
                    className="inline-flex items-center gap-1 mt-1.5 text-[10px] px-2 py-0.5 rounded-full bg-honey-500/10 text-honey-500/80 border border-honey-500/20 hover:bg-honey-500/20 hover:text-honey-500 transition-all"
                    onClick={e => e.stopPropagation()}
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 15V3m0 12-4-4m4 4 4-4M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17"/></svg>
                    Download
                  </a>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-3">
              <input
                type="range"
                min={0}
                max={duration || 1}
                value={progress}
                onChange={handleSeek}
                className="w-full h-1 accent-honey-500 cursor-pointer rounded-full"
                style={{background: `linear-gradient(to right, var(--color-honey-500, #f59e0b) ${duration ? (progress/duration*100) : 0}%, rgba(255,255,255,0.1) 0%)`}}
              />
              <div className="flex justify-between text-[10px] text-text-muted mt-1">
                <span>{formatTime(progress)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={skipPrev}
                  disabled={allTracks.length === 0}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-text-secondary hover:text-honey-500 disabled:opacity-30 transition-colors hover:bg-honey-500/10"
                >
                  <SkipBack size={15} />
                </button>
                <button
                  onClick={togglePlay}
                  disabled={allTracks.length === 0}
                  className="w-10 h-10 rounded-full bg-honey-500 flex items-center justify-center text-hive-900 hover:bg-honey-400 disabled:opacity-30 transition-all shadow-lg shadow-honey-500/20 active:scale-95"
                >
                  {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
                </button>
                <button
                  onClick={skipNext}
                  disabled={allTracks.length === 0}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-text-secondary hover:text-honey-500 disabled:opacity-30 transition-colors hover:bg-honey-500/10"
                >
                  <SkipForward size={15} />
                </button>
              </div>

              {/* Volume */}
              <div className="flex items-center gap-1.5">
                <button onClick={toggleMute} className="text-text-muted hover:text-honey-500 transition-colors p-1 rounded-md hover:bg-honey-500/10">
                  {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
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
          <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
            {activeTab === "station" && (
              <div className="border-b border-hive-border shrink-0">
                <div className="px-4 py-1.5 flex items-center justify-between">
                  <span className="text-[10px] text-text-muted">
                    {lastSync ? `Synced ${lastSync.toLocaleTimeString()}` : "Syncing…"}
                  </span>
                  <div className="flex items-center gap-2">
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
                      className="text-[10px] text-text-muted hover:text-honey-500 transition-colors disabled:opacity-40"
                    >
                      {isSyncing ? "Syncing…" : "↻ Refresh"}
                    </button>
                  </div>
                </div>
                {isAdmin && showStationUpload && (
                  <div className="px-4 pb-3 flex flex-col gap-2 border-t border-hive-border pt-2">
                    {/* Audio + Cover row */}
                    <div className="flex gap-2">
                      {/* Audio file picker */}
                      <div
                        onClick={() => stationFileInputRef.current?.click()}
                        className="flex-1 py-2 border border-dashed border-hive-border rounded-lg text-center cursor-pointer hover:border-honey-500/50 transition-colors"
                      >
                        {stationUploadFile ? (
                          <span className="text-[10px] text-honey-500 font-medium leading-tight block px-1 truncate">{stationUploadFile.name}</span>
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
                          <span className="text-[9px] text-text-muted text-center leading-tight">🖼<br/>Art</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Title *"
                        value={stationUploadTitle}
                        onChange={e => setStationUploadTitle(e.target.value)}
                        className="flex-1 text-xs bg-hive-700 border border-hive-border rounded-md px-2 py-1.5 text-text-primary placeholder:text-text-muted outline-none focus:border-honey-500/50"
                      />
                      <input
                        type="text"
                        placeholder="Artist"
                        value={stationUploadArtist}
                        onChange={e => setStationUploadArtist(e.target.value)}
                        className="flex-1 text-xs bg-hive-700 border border-hive-border rounded-md px-2 py-1.5 text-text-primary placeholder:text-text-muted outline-none focus:border-honey-500/50"
                      />
                    </div>
                    {stationUploadError && (
                      <p className="text-[10px] text-red-400">{stationUploadError}</p>
                    )}
                    <button
                      onClick={handleStationUpload}
                      disabled={!stationUploadFile || !stationUploadTitle.trim() || stationUploading}
                      className="w-full text-xs py-1.5 rounded-md bg-honey-500 text-hive-900 font-semibold hover:bg-honey-400 disabled:opacity-30 transition-all shadow-sm shadow-honey-500/20"
                    >
                      {stationUploading ? "Uploading to Station…" : "🎙 Upload to SparkieRadio"}
                    </button>
                  </div>
                )}
              </div>
            )}
            {allTracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-text-muted text-sm gap-2">
                <Radio size={24} className="text-honey-500/30" />
                {activeTab === "station" ? (
                  <><p>Station is empty</p><p className="text-xs">Add MP3s to SparkieRadio on GitHub</p></>
                ) : (
                  <><p>No tracks yet</p><p className="text-xs">Upload MP3s or add URL links</p></>
                )}
              </div>
            ) : (
              <div className="p-2 flex flex-col gap-0.5">
                {allTracks.map((track, idx) => (
                  <div
                    key={track.id}
                    onClick={() => playTrack(idx)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer group transition-colors ${
                      idx === currentIndex
                        ? "bg-honey-500/10 border border-honey-500/20"
                        : "hover:bg-hive-hover"
                    }`}
                  >
                    <div className="w-7 h-7 rounded-md overflow-hidden shrink-0 border border-honey-500/10 bg-honey-500/5 flex items-center justify-center">
                      {activeTab === "station" && track.coverUrl ? (
                        idx === currentIndex && isPlaying ? (
                          <div className="relative w-full h-full">
                            <img src={track.coverUrl} alt="" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <div className="flex gap-px items-end h-3">
                                <span className="w-0.5 bg-honey-400 rounded-full animate-[equalizer_0.8s_ease-in-out_infinite]" style={{height:'40%',animationDelay:'0ms'}} />
                                <span className="w-0.5 bg-honey-400 rounded-full animate-[equalizer_0.8s_ease-in-out_infinite]" style={{height:'100%',animationDelay:'150ms'}} />
                                <span className="w-0.5 bg-honey-400 rounded-full animate-[equalizer_0.8s_ease-in-out_infinite]" style={{height:'60%',animationDelay:'300ms'}} />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <img src={track.coverUrl} alt="" className="w-full h-full object-cover" />
                        )
                      ) : (
                        <span className={`text-[10px] font-medium ${idx === currentIndex ? "text-honey-500" : "text-text-muted"}`}>
                          {idx === currentIndex && isPlaying ? "♪" : idx + 1}
                        </span>
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

          {/* Add track section — only for My Tracks tab */}
          {activeTab === "mine" && <div className="border-t border-hive-border p-3 shrink-0">
            {showAddForm ? (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="Direct audio URL (.mp3, .ogg, stream link)"
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
          </div>}
        </>
      )}
    </div>
  )
}
