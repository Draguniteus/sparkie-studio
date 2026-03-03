"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Music, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, X, Radio, Link, Upload, ChevronDown, ChevronUp, Pencil, Check, Megaphone, Image as ImageIcon, BookmarkPlus } from "lucide-react"

interface RadioTrack {
  id: string
  title: string
  artist?: string
  src: string
  type?: "file" | "url"
  addedAt?: Date
  coverUrl?: string
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
    const toSave = tracks.filter(t => t.type === "url")
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
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
  // Drag-reorder state
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
  const editCoverInputRef = useRef<HTMLInputElement>(null)
  const [stationCoverFile, setStationCoverFile] = useState<File | null>(null)
  const [stationCoverPreview, setStationCoverPreview] = useState<string | null>(null)
  // Edit track state (admin only)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editArtist, setEditArtist] = useState("")
  const [editCoverPreview, setEditCoverPreview] = useState<string | null>(null)
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  // Station announcement (owner only)
  const [showAnnouncement, setShowAnnouncement] = useState(false)
  const [announcementText, setAnnouncementText] = useState("")
  const [activeBroadcast, setActiveBroadcast] = useState<string | null>(null)
  // Track which station tracks the user has already saved to My Tracks
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const audioRef = useRef<HTMLAudioElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  useEffect(() => { saveTracks(tracks) }, [tracks])

  const syncStation = useCallback(async () => {
    setIsSyncing(true)
    try {
      const res = await fetch(SPARKIE_RADIO_PLAYLIST_URL + "?t=" + Date.now())
      if (!res.ok) throw new Error("fetch failed")
      const data = await res.json() as Array<{ id: string; title: string; artist?: string; url: string; coverUrl?: string }>
      const mapped: RadioTrack[] = data.map(item => ({
        id: item.id ?? crypto.randomUUID(),
        title: item.title ?? "Untitled",
        artist: item.artist,
        src: item.url ?? "",
        coverUrl: item.coverUrl,
      }))
      setStationTracks(mapped)
      setLastSync(new Date())
    } catch {} finally { setIsSyncing(false) }
  }, [])

  useEffect(() => {
    syncStation()
    const interval = setInterval(syncStation, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [syncStation])

  const allTracks = activeTab === "station" ? stationTracks : tracks
  const currentTrack = currentIndex >= 0 ? allTracks[currentIndex] : null
  const upNextTrack = currentIndex >= 0 && currentIndex < allTracks.length - 1 ? allTracks[currentIndex + 1] : (allTracks.length > 1 ? allTracks[0] : null)

  const clearProgressInterval = useCallback(() => {
    if (progressIntervalRef.current) { clearInterval(progressIntervalRef.current); progressIntervalRef.current = null }
  }, [])

  const startProgressTracking = useCallback(() => {
    clearProgressInterval()
    progressIntervalRef.current = setInterval(() => {
      const audio = audioRef.current
      if (audio && !isNaN(audio.duration)) { setProgress(audio.currentTime); setDuration(audio.duration) }
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
    audio.play().then(() => { setIsPlaying(true); startProgressTracking() }).catch(() => setIsPlaying(false))
  }, [allTracks, volume, isMuted, startProgressTracking])

  useEffect(() => {
    const handleStart = () => { if (!isPlaying && allTracks.length > 0) playTrack(currentIndex >= 0 ? currentIndex : 0) }
    const handleStop = () => {
      const audio = audioRef.current
      if (audio && isPlaying) { audio.pause(); setIsPlaying(false); clearProgressInterval() }
    }
    window.addEventListener('sparkie:startradio', handleStart)
    window.addEventListener('sparkie:stopradio', handleStop)
    return () => { window.removeEventListener('sparkie:startradio', handleStart); window.removeEventListener('sparkie:stopradio', handleStop) }
  }, [isPlaying, allTracks, currentIndex, playTrack, clearProgressInterval])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (!currentTrack && allTracks.length > 0) { playTrack(0); return }
    if (isPlaying) { audio.pause(); setIsPlaying(false); clearProgressInterval() }
    else { audio.play().then(() => { setIsPlaying(true); startProgressTracking() }).catch(() => {}) }
  }, [isPlaying, currentTrack, allTracks, playTrack, clearProgressInterval, startProgressTracking])

  const skipNext = useCallback(() => {
    if (allTracks.length === 0) return
    playTrack(currentIndex < allTracks.length - 1 ? currentIndex + 1 : 0)
  }, [currentIndex, allTracks.length, playTrack])

  const skipPrev = useCallback(() => {
    if (allTracks.length === 0) return
    const audio = audioRef.current
    if (audio && audio.currentTime > 3) { audio.currentTime = 0; return }
    playTrack(currentIndex > 0 ? currentIndex - 1 : allTracks.length - 1)
  }, [currentIndex, allTracks.length, playTrack])

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (!audio) return
    const t = parseFloat(e.target.value)
    audio.currentTime = t; setProgress(t)
  }, [])

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    setVolume(v); setIsMuted(false)
    if (audioRef.current) audioRef.current.volume = v
  }, [])

  const toggleMute = useCallback(() => {
    const next = !isMuted; setIsMuted(next)
    if (audioRef.current) audioRef.current.volume = next ? 0 : volume
  }, [isMuted, volume])

  const addUrlTrack = useCallback(() => {
    if (!urlInput.trim()) return
    const track: RadioTrack = {
      id: crypto.randomUUID(),
      title: titleInput.trim() || urlInput.split("/").pop() || "Track",
      artist: artistInput.trim() || undefined,
      src: urlInput.trim(), type: "url", addedAt: new Date(),
    }
    setTracks(prev => [...prev, track])
    setUrlInput(""); setTitleInput(""); setArtistInput(""); setShowAddForm(false)
  }, [urlInput, titleInput, artistInput])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach(file => {
      if (!file.type.startsWith("audio/") && !file.type.startsWith("video/")) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        const src = ev.target?.result as string
        if (!src) return
        setTracks(prev => [...prev, { id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ""), src, type: "file", addedAt: new Date() }])
      }
      reader.readAsDataURL(file)
    })
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [])

  const removeTrack = useCallback((id: string) => {
    setTracks(prev => {
      const idx = prev.findIndex(t => t.id === id)
      const next = prev.filter(t => t.id !== id)
      if (idx === currentIndex) { audioRef.current?.pause(); setIsPlaying(false); setCurrentIndex(-1); clearProgressInterval() }
      else if (idx < currentIndex) { setCurrentIndex(i => i - 1) }
      return next
    })
    // Also delete from DB (station tracks)
    fetch('/api/radio/tracks?id=' + encodeURIComponent(id), { method: 'DELETE' }).catch(() => {})
  }, [currentIndex, clearProgressInterval])

  const handleDragReorder = useCallback(async (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return
    const reordered = [...stationTracks]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setStationTracks(reordered)
    if (currentIndex === fromIdx) setCurrentIndex(toIdx)
    else if (currentIndex > fromIdx && currentIndex <= toIdx) setCurrentIndex(i => i - 1)
    else if (currentIndex < fromIdx && currentIndex >= toIdx) setCurrentIndex(i => i + 1)
    setIsReordering(true)
    try {
      const res = await fetch('/api/radio/reorder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: reordered.map(t => t.id) })
      })
      if (!res.ok) await syncStation()
    } catch { await syncStation() } finally { setIsReordering(false) }
  }, [stationTracks, currentIndex, syncStation])

  const handleDragStart = useCallback((e: React.DragEvent, idx: number) => {
    setDragIndex(idx); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(idx))
  }, [])
  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverIndex(idx)
  }, [])
  const handleDrop = useCallback((e: React.DragEvent, toIdx: number) => {
    e.preventDefault()
    if (dragIndex !== null && dragIndex !== toIdx) handleDragReorder(dragIndex, toIdx)
    setDragIndex(null); setDragOverIndex(null)
  }, [dragIndex, handleDragReorder])
  const handleDragEnd = useCallback(() => { setDragIndex(null); setDragOverIndex(null) }, [])

  const handleStationUpload = useCallback(async () => {
    if (!stationUploadFile || !stationUploadTitle.trim()) return
    setStationUploading(true); setStationUploadError(null)
    try {
      const fd = new FormData()
      fd.append("file", stationUploadFile); fd.append("title", stationUploadTitle.trim())
      if (stationUploadArtist.trim()) fd.append("artist", stationUploadArtist.trim())
      if (stationCoverFile) fd.append("coverImage", stationCoverFile)
      const res = await fetch("/api/radio/upload", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Upload failed")
      setStationUploadFile(null); setStationUploadTitle(""); setStationUploadArtist("")
      setStationCoverFile(null); setStationCoverPreview(null); setShowStationUpload(false)
      if (stationFileInputRef.current) stationFileInputRef.current.value = ""
      if (stationCoverInputRef.current) stationCoverInputRef.current.value = ""
      await syncStation()
    } catch (err) {
      setStationUploadError(err instanceof Error ? err.message : "Upload failed")
    } finally { setStationUploading(false) }
  }, [stationUploadFile, stationUploadTitle, stationUploadArtist, stationCoverFile, syncStation])

  // Save track edits (admin only) — PATCH via POST single track upsert
  const saveTrackEdit = useCallback(async () => {
    if (!editingId) return
    setIsSavingEdit(true)
    try {
      const track = stationTracks.find(t => t.id === editingId)
      if (!track) return
      let coverUrl = track.coverUrl ?? undefined
      // Upload new cover if selected
      if (editCoverFile) {
        const fd = new FormData(); fd.append("coverImage", editCoverFile); fd.append("trackId", editingId)
        const res = await fetch("/api/radio/cover", { method: "POST", body: fd })
        if (res.ok) { const d = await res.json(); coverUrl = d.coverUrl }
      }
      // Save via PATCH
      const res = await fetch('/api/radio/tracks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, title: editTitle.trim() || track.title, artist: editArtist.trim() || null, coverUrl: coverUrl ?? null })
      })
      if (res.ok) {
        setStationTracks(prev => prev.map(t => t.id === editingId ? {
          ...t, title: editTitle.trim() || t.title, artist: editArtist.trim() || undefined, coverUrl: coverUrl
        } : t))
      }
    } catch {} finally {
      setIsSavingEdit(false); setEditingId(null); setEditCoverFile(null); setEditCoverPreview(null)
    }
  }, [editingId, editTitle, editArtist, editCoverFile, stationTracks])

  const startEdit = useCallback((track: RadioTrack) => {
    setEditingId(track.id); setEditTitle(track.title); setEditArtist(track.artist ?? "")
    setEditCoverPreview(track.coverUrl ?? null); setEditCoverFile(null)
  }, [])

  const sendBroadcast = useCallback(() => {
    if (!announcementText.trim()) return
    setActiveBroadcast(announcementText.trim())
    setAnnouncementText(""); setShowAnnouncement(false)
  }, [announcementText])

  // Save a station track to the user's personal My Tracks (cross-tab)
  const saveStationTrackToMine = useCallback((track: RadioTrack) => {
    if (savedIds.has(track.id)) return
    const myTrack: RadioTrack = {
      id: crypto.randomUUID(),
      title: track.title,
      artist: track.artist,
      src: track.src,
      type: 'url',
      addedAt: new Date(),
    }
    setTracks(prev => {
      const next = [...prev, myTrack]
      saveTracks(next)
      return next
    })
    setSavedIds(prev => new Set([...prev, track.id]))
  }, [savedIds])

  const formatTime = (s: number) => {
    if (!isFinite(s)) return "0:00"
    const m = Math.floor(s / 60); const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, "0")}`
  }

  return (
    <div className="flex flex-col h-full bg-hive-700 md:rounded-xl border border-hive-border overflow-hidden">
      {/* Hidden inputs */}
      <audio ref={audioRef} onEnded={skipNext} onError={() => { setIsPlaying(false); clearProgressInterval(); setPlayError(true) }} />
      <input ref={fileInputRef} type="file" accept="audio/*" multiple className="hidden" onChange={handleFileUpload} />
      <input ref={stationFileInputRef} type="file" accept="audio/mpeg,audio/ogg,audio/aac,audio/wav" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { setStationUploadFile(f); if (!stationUploadTitle) setStationUploadTitle(f.name.replace(/\.[^.]+$/, "")) } }} />
      <input ref={stationCoverInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { setStationCoverFile(f); setStationCoverPreview(URL.createObjectURL(f)) } }} />
      <input ref={editCoverInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { setEditCoverFile(f); setEditCoverPreview(URL.createObjectURL(f)) } }} />

      {/* Station Announcement Banner — rainbow animated */}
      {activeBroadcast && (
        <div className="px-3 py-2 bg-black/30 border-b border-white/10 flex items-center gap-2 shrink-0 relative overflow-hidden">
          <div className="absolute inset-0 opacity-20" style={{background: 'linear-gradient(90deg,#ff0055,#ff6600,#ffee00,#00ff88,#00ccff,#aa44ff,#ff0055)', backgroundSize: '300% 100%', animation: 'rainbowSlide 4s linear infinite'}} />
          <Megaphone className="w-3.5 h-3.5 shrink-0 relative z-10" style={{color: 'white'}} />
          <p className="flex-1 text-xs font-bold relative z-10 rainbow-broadcast">{activeBroadcast}</p>
          {isAdmin && (
            <button onClick={() => setActiveBroadcast(null)} className="relative z-10 text-white/60 hover:text-white transition-colors">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-hive-border shrink-0">
        <div className="flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5 text-honey-500" />
          <span className="text-xs font-semibold text-text-primary">Sparkie Radio</span>
          {isPlaying && <span className="flex gap-[2px] ml-1 items-end h-3">{['0ms','150ms','300ms'].map((d,i)=><span key={i} className="w-[2px] bg-honey-500 rounded-sm animate-[equalizer_0.8s_ease-in-out_infinite]" style={{height:`${[40,65,50][i]}%`,animationDelay:d}}/>)}</span>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => { setActiveTab("station"); setCurrentIndex(-1) }}
            className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${activeTab === "station" ? "bg-honey-500/20 text-honey-500" : "text-text-muted hover:text-text-secondary"}`}>
            🎙 Station {stationTracks.length > 0 && `(${stationTracks.length})`}
          </button>
          <button onClick={() => { setActiveTab("mine"); setCurrentIndex(-1) }}
            className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${activeTab === "mine" ? "bg-honey-500/20 text-honey-500" : "text-text-muted hover:text-text-secondary"}`}>
            My Tracks {tracks.length > 0 && `(${tracks.length})`}
          </button>
          {isAdmin && (
            <button onClick={() => setShowAnnouncement(v => !v)} title="Station announcement"
              className={`p-0.5 rounded transition-colors ${showAnnouncement ? "text-honey-500" : "text-text-muted hover:text-honey-500"}`}>
              <Megaphone className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => setIsCollapsed(c => !c)} className="text-text-muted hover:text-text-secondary transition-colors">
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Announcement composer (admin) */}
      {isAdmin && showAnnouncement && (
        <div className="px-3 py-2 border-b border-hive-border bg-honey-500/5 shrink-0">
          <p className="text-[10px] text-honey-500 font-semibold mb-1.5 uppercase tracking-wide">📣 Broadcast to Listeners</p>
          <div className="flex gap-1.5">
            <input
              value={announcementText}
              onChange={e => setAnnouncementText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendBroadcast()}
              placeholder="Type your message..."
              className="flex-1 text-xs bg-hive-600 border border-honey-500/30 rounded-lg px-2.5 py-1.5 text-text-primary placeholder:text-text-muted outline-none focus:border-honey-500/60"
            />
            <button onClick={sendBroadcast}
              className="px-3 py-1.5 rounded-lg bg-honey-500 text-hive-900 text-[11px] font-bold hover:bg-honey-400 transition-colors">
              Send
            </button>
          </div>
        </div>
      )}

      {!isCollapsed && (
        <>
          {/* HERO — Now Playing */}
          <div className="relative shrink-0 overflow-hidden" style={{background: 'linear-gradient(180deg, rgba(20,16,8,0.95) 0%, rgba(10,10,10,0.98) 100%)'}}>
            {/* Background cover blur */}
            {currentTrack?.coverUrl && (
              <div className="absolute inset-0 overflow-hidden">
                <img src={currentTrack.coverUrl} alt="" className="w-full h-full object-cover opacity-20 blur-lg scale-110" />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-hive-700/95" />
              </div>
            )}
            <div className="relative px-4 pt-4 pb-3">
              {/* Cover + track info */}
              <div className="flex items-center gap-3 mb-3">
                <div className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0 shadow-lg shadow-black/50 bg-hive-600 border border-white/10 flex items-center justify-center">
                  {activeTab === "station" && currentTrack?.coverUrl ? (
                    <img src={currentTrack.coverUrl} alt={currentTrack.title} className="w-full h-full object-cover" />
                  ) : (
                    <Music className={`w-7 h-7 ${isPlaying ? 'text-honey-500 animate-pulse' : 'text-text-muted'}`} />
                  )}
                  {isPlaying && (
                    <div className="absolute inset-0 flex items-end justify-center gap-[2px] pb-1.5 bg-black/25">
                      {['0ms','150ms','300ms'].map((d,i)=><span key={i} className="w-[3px] bg-honey-500 rounded-sm animate-[equalizer_0.8s_ease-in-out_infinite]" style={{height:`${[45,70,55][i]}%`,animationDelay:d}}/>)}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[9px] uppercase tracking-widest text-honey-500/70 font-semibold">Now Playing</span>
                  </div>
                  <p className="text-sm font-bold text-text-primary truncate leading-tight">{currentTrack?.title ?? "— Select a track —"}</p>
                  {(currentTrack?.artist || playError) && (
                    <p className="text-[11px] truncate mt-0.5">
                      {playError
                        ? <span className="text-yellow-500">⚠ Use a direct audio URL</span>
                        : <span className="text-text-muted">{currentTrack?.artist}</span>}
                    </p>
                  )}
                  {activeTab === "station" && currentTrack && !playError && (
                    <a href={currentTrack.src} download={currentTrack.title + ".mp3"}
                      className="inline-flex items-center gap-1 mt-1 text-[9px] px-2 py-0.5 rounded-full bg-honey-500/10 text-honey-500/70 border border-honey-500/15 hover:bg-honey-500/20 transition-colors"
                      onClick={e => e.stopPropagation()}>
                      ↓ Download
                    </a>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-[9px] text-text-muted w-7 text-right tabular-nums">{formatTime(progress)}</span>
                <div className="flex-1 relative h-1.5 group">
                  <input type="range" min={0} max={duration || 0} step={0.5} value={progress} onChange={handleSeek}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                  <div className="w-full h-full rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full bg-honey-500 transition-all duration-300"
                      style={{width: `${duration ? (progress/duration*100) : 0}%`}} />
                  </div>
                </div>
                <span className="text-[9px] text-text-muted w-7 tabular-nums">{formatTime(duration)}</span>
              </div>

              {/* Controls row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 w-20">
                  <button onClick={toggleMute} className="text-text-muted hover:text-text-primary transition-colors">
                    {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </button>
                  <input type="range" min={0} max={1} step={0.01} value={isMuted ? 0 : volume} onChange={handleVolumeChange}
                    className="flex-1 h-0.5 accent-honey-500 cursor-pointer" />
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={skipPrev} className="text-text-muted hover:text-text-primary transition-colors">
                    <SkipBack className="w-4.5 h-4.5" />
                  </button>
                  <button onClick={togglePlay}
                    className="w-10 h-10 rounded-full bg-honey-500 hover:bg-honey-400 flex items-center justify-center transition-all shadow-lg shadow-honey-500/20 hover:shadow-honey-500/40 hover:scale-105">
                    {isPlaying ? <Pause className="w-4 h-4 text-hive-900" /> : <Play className="w-4 h-4 text-hive-900 ml-0.5" />}
                  </button>
                  <button onClick={skipNext} className="text-text-muted hover:text-text-primary transition-colors">
                    <SkipForward className="w-4.5 h-4.5" />
                  </button>
                </div>
                {/* Up next mini preview */}
                <div className="w-20 flex flex-col items-end justify-center overflow-hidden">
                  {upNextTrack && upNextTrack.id !== currentTrack?.id && (
                    <>
                      <p className="text-[8px] text-text-muted uppercase tracking-wide">Up Next</p>
                      <p className="text-[10px] text-text-secondary truncate max-w-full text-right">{upNextTrack.title}</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Track Edit Panel (admin, inline) */}
          {isAdmin && editingId && (
            <div className="px-3 py-3 border-b border-hive-border bg-hive-600/50 shrink-0">
              <p className="text-[10px] text-honey-500 font-semibold uppercase tracking-wide mb-2">Edit Track</p>
              <div className="flex gap-2 items-start">
                {/* Cover picker */}
                <button onClick={() => editCoverInputRef.current?.click()}
                  className="w-12 h-12 rounded-lg overflow-hidden bg-hive-600 border border-hive-border hover:border-honey-500/40 flex items-center justify-center shrink-0 transition-colors relative group">
                  {editCoverPreview
                    ? <img src={editCoverPreview} alt="cover" className="w-full h-full object-cover" />
                    : <ImageIcon className="w-4 h-4 text-text-muted" />}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <ImageIcon className="w-3 h-3 text-white" />
                  </div>
                </button>
                <div className="flex-1 space-y-1.5">
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    placeholder="Track title"
                    className="w-full text-xs bg-hive-700 border border-hive-border rounded-md px-2 py-1.5 text-text-primary placeholder:text-text-muted outline-none focus:border-honey-500/50" />
                  <input value={editArtist} onChange={e => setEditArtist(e.target.value)}
                    placeholder="Artist (optional)"
                    className="w-full text-xs bg-hive-700 border border-hive-border rounded-md px-2 py-1.5 text-text-primary placeholder:text-text-muted outline-none focus:border-honey-500/50" />
                </div>
              </div>
              <div className="flex gap-1.5 mt-2">
                <button onClick={saveTrackEdit} disabled={isSavingEdit}
                  className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-md bg-honey-500 text-hive-900 font-semibold hover:bg-honey-400 transition-colors disabled:opacity-50">
                  {isSavingEdit ? 'Saving…' : <><Check className="w-3 h-3" /> Save</>}
                </button>
                <button onClick={() => { setEditingId(null); setEditCoverFile(null); setEditCoverPreview(null) }}
                  className="px-3 py-1.5 rounded-md text-xs text-text-muted hover:text-text-primary bg-hive-600 hover:bg-hive-500 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Playlist */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {activeTab === "station" && (
              <div className="px-3 py-1.5 flex items-center justify-between border-b border-hive-border shrink-0">
                <span className="text-[10px] text-text-muted">
                  {isReordering ? <span className="text-honey-500 animate-pulse">saving order…</span> : lastSync ? `Synced ${lastSync.toLocaleTimeString()}` : "Syncing…"}
                </span>
                <div className="flex items-center gap-1">
                  {isAdmin && (
                    <button onClick={() => setShowStationUpload(v => !v)}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-honey-500/15 text-honey-500 hover:bg-honey-500/25 transition-colors">
                      {showStationUpload ? "✕ Cancel" : "＋ Add to Station"}
                    </button>
                  )}
                  <button onClick={syncStation} disabled={isSyncing}
                    className="text-[10px] px-1.5 py-0.5 rounded text-text-muted hover:text-text-secondary transition-colors disabled:opacity-50">
                    {isSyncing ? "⟳" : "↺"}
                  </button>
                </div>
              </div>
            )}

            {/* Station upload panel */}
            {isAdmin && showStationUpload && activeTab === "station" && (
              <div className="mx-3 my-2 p-3 rounded-xl bg-hive-600/60 border border-hive-border">
                <div className="flex gap-2 mb-2">
                  {/* Audio file */}
                  <button onClick={() => stationFileInputRef.current?.click()}
                    className={`flex-1 flex items-center gap-1.5 text-[11px] px-2 py-2 rounded-lg border ${stationUploadFile ? 'border-honey-500/40 bg-honey-500/5 text-honey-500' : 'border-hive-border text-text-muted hover:border-honey-500/30'} transition-colors`}>
                    <Upload className="w-3 h-3" />
                    {stationUploadFile ? stationUploadFile.name.slice(0,20) + (stationUploadFile.name.length > 20 ? '…' : '') : "Choose Audio"}
                  </button>
                  {/* Cover art */}
                  <button onClick={() => stationCoverInputRef.current?.click()}
                    className="w-12 h-full min-h-[36px] rounded-lg bg-hive-600 border border-hive-border hover:border-honey-500/40 flex items-center justify-center overflow-hidden transition-colors">
                    {stationCoverPreview
                      ? <img src={stationCoverPreview} alt="cover" className="w-full h-full object-cover" />
                      : <ImageIcon className="w-3.5 h-3.5 text-text-muted" />}
                  </button>
                </div>
                <div className="flex gap-1 mb-2">
                  <input value={stationUploadTitle} onChange={e => setStationUploadTitle(e.target.value)} placeholder="Title *"
                    className="flex-1 text-xs bg-hive-700 border border-hive-border rounded-md px-2 py-1.5 text-text-primary placeholder:text-text-muted outline-none focus:border-honey-500/50" />
                  <input value={stationUploadArtist} onChange={e => setStationUploadArtist(e.target.value)} placeholder="Artist"
                    className="flex-1 text-xs bg-hive-700 border border-hive-border rounded-md px-2 py-1.5 text-text-primary placeholder:text-text-muted outline-none focus:border-honey-500/50" />
                </div>
                {stationUploadError && <p className="text-[10px] text-red-400 mb-1.5">{stationUploadError}</p>}
                <button onClick={handleStationUpload} disabled={stationUploading || !stationUploadFile || !stationUploadTitle.trim()}
                  className="w-full py-1.5 rounded-md text-xs font-semibold bg-honey-500 text-hive-900 hover:bg-honey-400 transition-colors disabled:opacity-50">
                  {stationUploading ? "Uploading…" : "Upload to Station"}
                </button>
              </div>
            )}

            {allTracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-6 gap-3">
                <div className="w-12 h-12 rounded-2xl bg-honey-500/10 flex items-center justify-center">
                  <Radio className="w-6 h-6 text-honey-500/40" />
                </div>
                <p className="text-sm font-medium text-text-muted">No tracks yet</p>
                {activeTab === "mine" && <>
                  <p className="text-[10px] text-text-muted">Upload MP3s or add URL links</p>
                </>}
              </div>
            ) : (
              <div className="py-1 px-1">
                {allTracks.map((track, idx) => (
                  <div key={track.id}
                    onClick={() => editingId !== track.id && playTrack(idx)}
                    draggable={isAdmin && activeTab === "station"}
                    onDragStart={isAdmin && activeTab === "station" ? e => handleDragStart(e, idx) : undefined}
                    onDragOver={isAdmin && activeTab === "station" ? e => handleDragOver(e, idx) : undefined}
                    onDrop={isAdmin && activeTab === "station" ? e => handleDrop(e, idx) : undefined}
                    onDragEnd={isAdmin && activeTab === "station" ? handleDragEnd : undefined}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer group transition-all ${
                      idx === currentIndex
                        ? "bg-honey-500/10 border border-honey-500/20 shadow-sm"
                        : "hover:bg-hive-600/60"
                    } ${dragOverIndex === idx && dragIndex !== idx ? "border border-honey-500/60" : ""} ${dragIndex === idx ? "opacity-40" : ""}`}
                  >
                    {isAdmin && activeTab === "station" && (
                      <div className="shrink-0 text-text-muted opacity-0 group-hover:opacity-40 cursor-grab active:cursor-grabbing select-none"
                        onMouseDown={e => e.stopPropagation()}>
                        <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor">
                          <circle cx="2" cy="2" r="1.4"/><circle cx="6" cy="2" r="1.4"/>
                          <circle cx="2" cy="7" r="1.4"/><circle cx="6" cy="7" r="1.4"/>
                          <circle cx="2" cy="12" r="1.4"/><circle cx="6" cy="12" r="1.4"/>
                        </svg>
                      </div>
                    )}
                    <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-hive-600 flex items-center justify-center relative border border-white/5">
                      {activeTab === "station" && track.coverUrl ? (
                        idx === currentIndex && isPlaying ? (
                          <div className="relative w-full h-full">
                            <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 flex items-end justify-center gap-[2px] pb-0.5 bg-black/40">
                              {['0ms','150ms','300ms'].map((d,i)=><span key={i} className="w-[2px] bg-honey-500 rounded-sm animate-[equalizer_0.8s_ease-in-out_infinite]" style={{height:`${[40,65,50][i]}%`,animationDelay:d}}/>)}
                            </div>
                          </div>
                        ) : <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-text-muted font-mono">{idx === currentIndex && isPlaying ? "♪" : idx + 1}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs truncate font-medium ${idx === currentIndex ? 'text-honey-400' : 'text-text-primary'}`}>{track.title}</p>
                      {track.artist && <p className="text-[10px] text-text-muted truncate">{track.artist}</p>}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {activeTab === "station" && (
                        <button onClick={e => { e.stopPropagation(); saveStationTrackToMine(track) }}
                          className={`w-6 h-6 rounded-md flex items-center justify-center transition-all ${savedIds.has(track.id) ? 'text-honey-500 bg-honey-500/10' : 'text-text-muted hover:text-honey-400 hover:bg-honey-500/10'}`}
                          title={savedIds.has(track.id) ? "Saved to My Tracks" : "Save to My Tracks"}>
                          {savedIds.has(track.id) ? <Check className="w-3 h-3" /> : <BookmarkPlus className="w-3 h-3" />}
                        </button>
                      )}
                      {isAdmin && activeTab === "station" && (
                        <button onClick={e => { e.stopPropagation(); startEdit(track) }}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-text-muted hover:text-honey-400 hover:bg-honey-500/10 transition-all"
                          title="Edit track">
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                      {(isAdmin || activeTab === "mine") && (
                        <button onClick={e => { e.stopPropagation(); removeTrack(track.id) }}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add track section — only for My Tracks tab */}
            {activeTab === "mine" && (
              <div className="px-3 py-2 border-t border-hive-border">
                {showAddForm ? (
                  <div className="space-y-1.5">
                    <input value={urlInput} placeholder="Audio URL (direct .mp3/.ogg/stream)" onChange={e => setUrlInput(e.target.value)}
                      className="w-full text-xs bg-hive-700 border border-hive-border rounded-md px-2 py-1.5 text-text-primary placeholder:text-text-muted outline-none focus:border-honey-500/50" />
                    <div className="flex gap-1">
                      <input value={titleInput} placeholder="Title" onChange={e => setTitleInput(e.target.value)}
                        className="flex-1 text-xs bg-hive-700 border border-hive-border rounded-md px-2 py-1.5 text-text-primary placeholder:text-text-muted outline-none focus:border-honey-500/50" />
                      <input value={artistInput} placeholder="Artist" onChange={e => setArtistInput(e.target.value)}
                        className="flex-1 text-xs bg-hive-700 border border-hive-border rounded-md px-2 py-1.5 text-text-primary placeholder:text-text-muted outline-none focus:border-honey-500/50" />
                    </div>
                    <div className="flex gap-1">
                      <button onClick={addUrlTrack} className="flex-1 text-xs py-1.5 rounded-md bg-honey-500 text-hive-900 font-semibold hover:bg-honey-400 transition-colors">Add Link</button>
                      <button onClick={() => setShowAddForm(false)} className="px-3 text-xs py-1.5 rounded-md text-text-muted hover:text-text-primary bg-hive-600 hover:bg-hive-500 transition-colors">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <button onClick={() => setShowAddForm(true)}
                      className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-md bg-hive-600 hover:bg-hive-500 text-text-muted hover:text-text-primary transition-colors border border-hive-border">
                      <Link className="w-3 h-3" /> Add URL
                    </button>
                    <button onClick={() => fileInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-md bg-hive-600 hover:bg-hive-500 text-text-muted hover:text-text-primary transition-colors border border-hive-border">
                      <Upload className="w-3 h-3" /> Upload
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
