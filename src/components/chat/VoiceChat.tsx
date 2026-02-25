"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Mic, MicOff, X, PhoneOff, ChevronUp, ChevronDown } from "lucide-react"
import Image from "next/image"

const STORAGE_KEY      = "sparkie_voice_pref"
const DEFAULT_VOICE    = "English_radiant_girl"
const SILENCE_THRESH   = 0.015
const SILENCE_MS       = 1400
const MS_PER_WORD      = 420

const SPARKIE_VOICES = [
  { id: "English_radiant_girl",        label: "Radiant Girl",    cat: "Girl"  as const },
  { id: "English_PlayfulGirl",         label: "Playful Girl",    cat: "Girl"  as const },
  { id: "English_LovelyGirl",          label: "Lovely Girl",     cat: "Girl"  as const },
  { id: "English_Kind-heartedGirl",    label: "Kind-Hearted",    cat: "Girl"  as const },
  { id: "English_WhimsicalGirl",       label: "Whimsical",       cat: "Girl"  as const },
  { id: "English_Soft-spokenGirl",     label: "Soft-Spoken",     cat: "Girl"  as const },
  { id: "English_Whispering_girl",     label: "Whispering",      cat: "Girl"  as const },
  { id: "English_UpsetGirl",           label: "Upset Girl",      cat: "Girl"  as const },
  { id: "English_AnimeCharacter",      label: "Anime Girl",      cat: "Girl"  as const },
  { id: "English_CalmWoman",           label: "Calm",            cat: "Woman" as const },
  { id: "English_Upbeat_Woman",        label: "Upbeat",          cat: "Woman" as const },
  { id: "English_SereneWoman",         label: "Serene",          cat: "Woman" as const },
  { id: "English_ConfidentWoman",      label: "Confident",       cat: "Woman" as const },
  { id: "English_AssertiveQueen",      label: "Assertive",       cat: "Woman" as const },
  { id: "English_ImposingManner",      label: "Imposing",        cat: "Woman" as const },
  { id: "English_WiseladyWise",        label: "Wise Lady",       cat: "Woman" as const },
  { id: "English_Graceful_Lady",       label: "Graceful",        cat: "Woman" as const },
  { id: "English_compelling_lady1",    label: "Compelling",      cat: "Woman" as const },
  { id: "English_captivating_female1", label: "Captivating",     cat: "Woman" as const },
  { id: "English_MaturePartner",       label: "Mature",          cat: "Woman" as const },
  { id: "English_MatureBoss",          label: "Bossy",           cat: "Woman" as const },
  { id: "English_SentimentalLady",     label: "Sentimental",     cat: "Woman" as const },
  { id: "English_StressedLady",        label: "Stressed",        cat: "Woman" as const },
  { id: "English_expressive_narrator", label: "Expressive",      cat: "Male"  as const },
  { id: "English_ManWithDeepVoice",    label: "Deep Voice",      cat: "Male"  as const },
  { id: "English_Gentle-voiced_man",   label: "Gentle",          cat: "Male"  as const },
  { id: "English_FriendlyPerson",      label: "Friendly",        cat: "Male"  as const },
  { id: "news_anchor_en",              label: "News Anchor",      cat: "Male"  as const },
]

interface VoiceChatProps {
  onClose: () => void
  onSendMessage: (text: string) => Promise<string>
  isActive: boolean
}

type VoiceState = "idle" | "listening" | "thinking" | "speaking"
type VoiceCat   = "Girl" | "Woman" | "Male"
interface Particle { x: number; y: number; r: number; alpha: number; dx: number; dy: number; pulse: number }

export function VoiceChat({ onClose, onSendMessage, isActive }: VoiceChatProps) {
  const getSavedVoice = () => {
    if (typeof window === "undefined") return DEFAULT_VOICE
    try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_VOICE } catch { return DEFAULT_VOICE }
  }

  const [voiceState,      setVoiceState]      = useState<VoiceState>("idle")
  const [transcript,      setTranscript]      = useState("")
  const [replyWords,      setReplyWords]      = useState<string[]>([])
  const [highlightIdx,    setHighlightIdx]    = useState(-1)
  const [errorMsg,        setErrorMsg]        = useState("")
  const [selectedVoice,   setSelectedVoice]   = useState<string>(DEFAULT_VOICE)
  const [showPicker,      setShowPicker]      = useState(false)
  const [voiceCat,        setVoiceCat]        = useState<VoiceCat>("Girl")
  const [bars,            setBars]            = useState<number[]>(Array(20).fill(2))
  const [elapsedSec,      setElapsedSec]      = useState(0)
  // Ring state — 3 rings: [innerScale, innerOpacity, midScale, midOpacity, outerScale, outerOpacity]
  const [ring1, setRing1] = useState({ scale: 1, opacity: 0.25, glow: 0 })
  const [ring2, setRing2] = useState({ scale: 1, opacity: 0.15, glow: 0 })
  const [ring3, setRing3] = useState({ scale: 1, opacity: 0.08, glow: 0 })

  // ── Refs ─────────────────────────────────────────────────────────
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null)
  const audioChunksRef    = useRef<Blob[]>([])
  const audioPlayerRef    = useRef<HTMLAudioElement | null>(null)
  const streamRef         = useRef<MediaStream | null>(null)
  const isProcessingRef   = useRef(false)
  const silenceTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animFrameRef      = useRef<number | null>(null)
  const ringAnimRef       = useRef<number | null>(null)
  const particleAnimRef   = useRef<number | null>(null)
  // FIX: analyserRef is read INSIDE animation frames, not captured at mount
  const analyserRef       = useRef<AnalyserNode | null>(null)
  const audioCtxRef       = useRef<AudioContext | null>(null)
  const autoRestartRef    = useRef(true)
  const ttsAbortRef       = useRef<AbortController | null>(null)  // abort streaming TTS fetch on nuke
  const pttActiveRef      = useRef(false)  // push-to-talk: true while button/spacebar held
  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptRef     = useRef<HTMLDivElement>(null)
  const replyRef          = useRef<HTMLDivElement>(null)
  const canvasRef         = useRef<HTMLCanvasElement>(null)
  const particlesRef      = useRef<Particle[]>([])
  const voiceStateRef     = useRef<VoiceState>("idle")
  const volumeRef         = useRef(0)
  // FIX: track whether user is manually scrolling the reply container
  const userScrollingRef  = useRef(false)
  const scrollTimeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { voiceStateRef.current = voiceState }, [voiceState])

  // Load persisted voice
  useEffect(() => { setSelectedVoice(getSavedVoice()) }, [])
  useEffect(() => {
    if (typeof window !== "undefined") try { localStorage.setItem(STORAGE_KEY, selectedVoice) } catch {}
  }, [selectedVoice])

  // Session timer
  useEffect(() => {
    if (!isActive) return
    const t0 = Date.now()
    timerRef.current = setInterval(() => setElapsedSec(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isActive])

  // Auto-scroll transcript (user never scrolls this one)
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" })
  }, [transcript])

  // Auto-scroll reply ONLY if user is not manually scrolling
  useEffect(() => {
    if (!userScrollingRef.current) {
      replyRef.current?.scrollTo({ top: replyRef.current.scrollHeight, behavior: "smooth" })
    }
  }, [highlightIdx])

  // ── Nuclear mic shutdown (FIX: guaranteed cleanup) ───────────────
  const nukeAudio = useCallback(() => {
    // Kill silence detector
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
    // Kill media recorder
    try { if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop() } catch {}
    mediaRecorderRef.current = null
    // Kill stream tracks — THE actual microphone
    try { streamRef.current?.getTracks().forEach(t => { t.stop(); t.enabled = false }) } catch {}
    streamRef.current = null
    // Kill streaming TTS fetch (aborts the in-flight /api/speech-stream request)
    try { ttsAbortRef.current?.abort(); ttsAbortRef.current = null } catch {}
    // Kill audio playback
    try { audioPlayerRef.current?.pause() } catch {}
    audioPlayerRef.current = null
    // Kill analyser
    analyserRef.current = null
    // Kill audio context
    try { audioCtxRef.current?.close() } catch {}
    audioCtxRef.current = null
  }, [])

  // ── Kill mic immediately when voice chat is closed (isActive → false) ──
  // Component stays mounted (parent uses isActive flag, not conditional render)
  // so React's cleanup-on-unmount never fires. This effect fills that gap.
  useEffect(() => {
    if (!isActive) {
      autoRestartRef.current = false
      nukeAudio()
      setVoiceState("idle")
      setBars(Array(20).fill(2))
    }
  }, [isActive, nukeAudio])

  // ── Spacebar PTT ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return
      e.preventDefault()
      handlePTTStart()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return
      e.preventDefault()
      handlePTTEnd()
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, [isActive, handlePTTStart, handlePTTEnd])

  // ── Cleanup on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      autoRestartRef.current = false
      nukeAudio()
      if (animFrameRef.current)    cancelAnimationFrame(animFrameRef.current)
      if (ringAnimRef.current)     cancelAnimationFrame(ringAnimRef.current)
      if (particleAnimRef.current) cancelAnimationFrame(particleAnimRef.current)
      if (timerRef.current)        clearInterval(timerRef.current)
      if (highlightTimerRef.current) clearInterval(highlightTimerRef.current)
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    }
  }, [nukeAudio])

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`

  // ── Particles ─────────────────────────────────────────────────────
  const initParticles = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    particlesRef.current = Array.from({ length: 55 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      r: Math.random() * 1.8 + 0.4, alpha: Math.random() * 0.35 + 0.05,
      dx: (Math.random() - 0.5) * 0.3, dy: (Math.random() - 0.5) * 0.3,
      pulse: Math.random() * Math.PI * 2,
    }))
  }, [])

  const drawParticles = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext("2d"); if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const vol   = volumeRef.current
    const state = voiceStateRef.current
    const c = state === "listening" ? "248,113,113" : state === "speaking" ? "250,204,21"
            : state === "thinking"  ? "96,165,250"  : "200,200,255"
    particlesRef.current.forEach(p => {
      p.pulse += 0.02
      if (state === "speaking") { p.x += p.dx + Math.sin(p.pulse) * vol * 0.9; p.y += p.dy + Math.cos(p.pulse) * vol * 0.6 }
      else { p.x += p.dx; p.y += p.dy }
      if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0
      if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0
      const a = Math.min((state === "speaking" ? p.alpha + vol * 0.45 : p.alpha), 0.9)
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r + (state === "speaking" ? vol * 1.6 : 0), 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${c},${a})`
      ctx.fill()
    })
    particleAnimRef.current = requestAnimationFrame(drawParticles)
  }, [])

  useEffect(() => {
    if (!isActive) return
    const canvas = canvasRef.current; if (!canvas) return
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; initParticles() }
    resize(); window.addEventListener("resize", resize); drawParticles()
    return () => { window.removeEventListener("resize", resize); if (particleAnimRef.current) cancelAnimationFrame(particleAnimRef.current) }
  }, [isActive, initParticles, drawParticles])

  // ── Ring animation — FIX: read analyserRef.current INSIDE each frame ─
  useEffect(() => {
    if (!isActive) return
    if (ringAnimRef.current) cancelAnimationFrame(ringAnimRef.current)

    const tick = () => {
      const state = voiceStateRef.current
      // ✅ Read ref INSIDE the frame — never stale
      const analyser = analyserRef.current
      let vol = 0

      if (analyser) {
        const buf = new Float32Array(analyser.fftSize)
        analyser.getFloatTimeDomainData(buf)
        const rms = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length)
        vol = Math.min(rms * 10, 1)
        volumeRef.current = vol
      } else if (state === "thinking") {
        // Breathing pulse while thinking
        vol = (Math.sin(Date.now() / 500) + 1) / 2 * 0.4
        volumeRef.current = vol
      } else if (state === "speaking") {
        // Fallback if analyser not connected yet — gentle random pulse
        vol = 0.3 + Math.random() * 0.3
        volumeRef.current = vol
      } else {
        volumeRef.current = 0
      }

      const t = Date.now()
      // Inner ring — tight, fast, most reactive
      setRing1({
        scale:   1 + vol * 0.22 + Math.sin(t / 280) * 0.008,
        opacity: 0.35 + vol * 0.65,
        glow:    vol * 28,
      })
      // Mid ring
      setRing2({
        scale:   1 + vol * 0.34 + Math.sin(t / 420 + 1.2) * 0.014,
        opacity: 0.20 + vol * 0.50,
        glow:    vol * 22,
      })
      // Outer ring — slowest, most dramatic bounce
      setRing3({
        scale:   1 + vol * 0.50 + Math.sin(t / 600 + 2.4) * 0.020,
        opacity: 0.10 + vol * 0.35,
        glow:    vol * 16,
      })

      ringAnimRef.current = requestAnimationFrame(tick)
    }
    ringAnimRef.current = requestAnimationFrame(tick)
    return () => { if (ringAnimRef.current) cancelAnimationFrame(ringAnimRef.current) }
  }, [isActive])

  // ── Waveform bars ─────────────────────────────────────────────────
  const animateBars = useCallback((analyser: AnalyserNode, mode: "listen" | "speak") => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    const buf = new Float32Array(analyser.frequencyBinCount)
    const tick = () => {
      if (mode === "listen") {
        analyser.getFloatTimeDomainData(buf)
        const bs = Math.floor(buf.length / 20)
        setBars(Array.from({ length: 20 }, (_, i) => {
          const slice = buf.slice(i * bs, (i + 1) * bs)
          return Math.max(2, Math.round(Math.sqrt(slice.reduce((s, x) => s + x * x, 0) / bs) * 350))
        }))
      } else {
        setBars(Array.from({ length: 20 }, () => Math.max(2, Math.floor(Math.random() * 50 + 4))))
      }
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
  }, [])

  const stopBars = useCallback(() => {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
    setBars(Array(20).fill(2))
  }, [])

  // ── Karaoke ───────────────────────────────────────────────────────
  const startKaraoke = useCallback((words: string[], durationMs: number) => {
    if (highlightTimerRef.current) clearInterval(highlightTimerRef.current)
    // Reset scroll — start from top of reply for karaoke
    userScrollingRef.current = false
    if (replyRef.current) replyRef.current.scrollTop = 0
    setHighlightIdx(-1)
    const msPerWord = words.length > 0 ? Math.min(durationMs / words.length, MS_PER_WORD * 1.6) : MS_PER_WORD
    let idx = 0
    highlightTimerRef.current = setInterval(() => {
      setHighlightIdx(idx); idx++
      if (idx >= words.length && highlightTimerRef.current) clearInterval(highlightTimerRef.current)
    }, msPerWord)
  }, [])

  const stopKaraoke = useCallback(() => {
    if (highlightTimerRef.current) { clearInterval(highlightTimerRef.current); highlightTimerRef.current = null }
    setHighlightIdx(-1)
  }, [])

  // ── Core: STT → AI → TTS ─────────────────────────────────────────
  const processAudio = useCallback(async (mimeType: string) => {
    if (audioChunksRef.current.length === 0) { setVoiceState("idle"); return }
    isProcessingRef.current = true
    setVoiceState("thinking"); stopBars(); stopKaraoke(); setReplyWords([])

    try {
      // STT
      const blob = new Blob(audioChunksRef.current, { type: mimeType })
      const tr = await fetch("/api/transcribe", {
        method: "POST", headers: { "Content-Type": mimeType }, body: blob,
      })
      if (!tr.ok) throw new Error("STT failed")
      const { transcript: text } = await tr.json()
      if (!text?.trim()) { setVoiceState("idle"); isProcessingRef.current = false; return }
      setTranscript(text.trim())

      // AI — pass voiceMode:true so Sparkie knows she's in a live conversation
      const aiReply = await onSendMessage(text.trim())
      if (!aiReply?.trim()) { setVoiceState("idle"); isProcessingRef.current = false; return }

      const words = aiReply.trim().split(/\s+/)
      setReplyWords(words)
      setVoiceState("speaking")

      // TTS — streaming: pipe /api/speech-stream directly to Audio via Blob URL
      // First chunk arrives ~400ms after request, browser starts playing immediately
      const ttsAbort = new AbortController()
      ttsAbortRef.current = ttsAbort
      const ttsRes = await fetch("/api/speech-stream", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: aiReply.trim().slice(0, 2000), model: "speech-02-turbo", voice_id: selectedVoice }),
        signal: ttsAbort.signal,
      })

      if (ttsRes.ok && ttsRes.body) {
        // Collect the stream into a Blob, then create an object URL.
        // This lets us start building the audio while data arrives and play as soon as
        // enough data is buffered for the browser's audio decoder.
        const chunks: Uint8Array<ArrayBuffer>[] = []
        const reader = ttsRes.body.getReader()
        const ctx = new AudioContext()
        audioCtxRef.current = ctx
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256

        let audioStarted = false
        let audioEl: HTMLAudioElement | null = null

        const startAudioPlayback = (blobUrl: string) => {
          if (audioStarted) return
          audioStarted = true
          const audio = new Audio(blobUrl)
          audio.crossOrigin = "anonymous"
          audioPlayerRef.current = audio
          try {
            const src = ctx.createMediaElementSource(audio)
            src.connect(analyser)
            analyser.connect(ctx.destination)
          } catch {}
          analyserRef.current = analyser
          animateBars(analyser, "speak")
          audioEl = audio

          audio.onloadedmetadata = () => {
            const ms = isNaN(audio.duration) ? words.length * MS_PER_WORD : audio.duration * 1000
            startKaraoke(words, ms)
          }
          audio.onended = () => {
            stopBars(); stopKaraoke()
            analyserRef.current = null
            URL.revokeObjectURL(blobUrl)
            ctx.close(); audioCtxRef.current = null
            isProcessingRef.current = false
            if (autoRestartRef.current) {
              setVoiceState("idle")
              setTimeout(() => { if (autoRestartRef.current && !isProcessingRef.current) startListening() }, 600)
            } else {
              setVoiceState("idle")
            }
          }
          audio.onerror = () => {
            stopBars(); stopKaraoke(); analyserRef.current = null
            URL.revokeObjectURL(blobUrl)
            ctx.close(); audioCtxRef.current = null
            setVoiceState("idle"); isProcessingRef.current = false
          }
          audio.play().catch(() => {})
        }

        // Stream all chunks (break early if nukeAudio aborted the fetch)
        while (true) {
          let done = false, value: Uint8Array<ArrayBuffer> | undefined
          try {
            const res = await reader.read()
            done = res.done
            value = res.value as Uint8Array<ArrayBuffer> | undefined
          } catch { break }  // AbortError or network cancel — stop cleanly
          if (done) break
          if (value) chunks.push(value)
          // Start playback as soon as we have ≥32KB (enough for MP3 header + first frames)
          if (!audioStarted) {
            const totalBytes = chunks.reduce((s, c) => s + c.length, 0)
            if (totalBytes >= 32768) {
              const partialBlob = new Blob(chunks, { type: "audio/mpeg" })
              startAudioPlayback(URL.createObjectURL(partialBlob))
            }
          }
        }

        // If audio hasn't started yet (short response), play the complete audio
        if (!audioStarted && chunks.length > 0) {
          const fullBlob = new Blob(chunks, { type: "audio/mpeg" })
          startAudioPlayback(URL.createObjectURL(fullBlob))
        }
        return
      }
      setVoiceState("idle"); isProcessingRef.current = false
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Voice error")
      setVoiceState("idle"); isProcessingRef.current = false
      stopBars(); stopKaraoke()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSendMessage, selectedVoice, animateBars, stopBars, startKaraoke, stopKaraoke])

  // ── Listening ─────────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    if (isProcessingRef.current) return
    setErrorMsg(""); setTranscript(""); setReplyWords([]); stopKaraoke()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const ctx = new AudioContext(); audioCtxRef.current = ctx
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser(); analyser.fftSize = 256
      src.connect(analyser)
      analyserRef.current = analyser
      animateBars(analyser, "listen")

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4"
      const mr = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.onstop = async () => {
        // Kill stream tracks immediately when recording stops
        stream.getTracks().forEach(t => { t.stop(); t.enabled = false })
        streamRef.current = null
        ctx.close(); audioCtxRef.current = null; analyserRef.current = null
        stopBars(); await processAudio(mimeType)
      }
      mr.start(100); mediaRecorderRef.current = mr
      setVoiceState("listening")

      const buf = new Float32Array(analyser.frequencyBinCount)
      const checkSilence = () => {
        if (!analyserRef.current || mediaRecorderRef.current?.state !== "recording") return
        analyser.getFloatTimeDomainData(buf)
        const rms = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length)
        if (rms < SILENCE_THRESH) {
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              silenceTimerRef.current = null
              mediaRecorderRef.current?.stop(); mediaRecorderRef.current = null
            }, SILENCE_MS)
          }
        } else {
          if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
        }
        setTimeout(checkSilence, 100)
      }
      checkSilence()
    } catch {
      setErrorMsg("Microphone access denied."); setVoiceState("idle")
    }
  }, [animateBars, stopBars, processAudio, stopKaraoke])

  // FIX: stopListening now also kills the stream tracks
  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
    try { if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop() } catch {}
  }, [])

  const cancelSpeaking = useCallback(() => {
    autoRestartRef.current = false
    try { audioPlayerRef.current?.pause() } catch {}
    audioPlayerRef.current = null
    analyserRef.current = null
    stopBars(); stopKaraoke()
    setVoiceState("idle"); isProcessingRef.current = false
    setTimeout(() => { autoRestartRef.current = true }, 500)
  }, [stopBars, stopKaraoke])

  // Push-to-Talk handlers
  const handlePTTStart = useCallback(() => {
    if (voiceState === "speaking") cancelSpeaking()
    if (voiceState !== "idle") return
    pttActiveRef.current = true
    startListening()
  }, [voiceState, startListening, cancelSpeaking])

  const handlePTTEnd = useCallback(() => {
    if (!pttActiveRef.current) return
    pttActiveRef.current = false
    if (voiceState === "listening") stopListening()  // triggers mr.onstop → processAudio
  }, [voiceState, stopListening])

  // Legacy click handler (cancel speaking on tap when speaking)
  const handleMicClick = useCallback(() => {
    if (voiceState === "speaking") cancelSpeaking()
  }, [voiceState, cancelSpeaking])

  // FIX: handleClose uses nukeAudio for guaranteed mic shutdown
  const handleClose = useCallback(() => {
    autoRestartRef.current = false
    cancelSpeaking()
    stopListening()
    nukeAudio()  // nuclear option — kills everything
    onClose()
  }, [cancelSpeaking, stopListening, nukeAudio, onClose])

  if (!isActive) return null

  const COLOR = {
    idle:      { rgb: "200,200,255", text: "text-white/30",   bar: "rgba(200,200,255,0.2)" },
    listening: { rgb: "248,113,113", text: "text-red-400",    bar: "#f87171" },
    thinking:  { rgb: "96,165,250",  text: "text-blue-400",   bar: "#60a5fa" },
    speaking:  { rgb: "250,204,21",  text: "text-yellow-400", bar: "#facc15" },
  }[voiceState]

  const STATUS = { idle: "Tap to speak", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking…" }[voiceState]
  const cats: VoiceCat[] = ["Girl", "Woman", "Male"]

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between pb-6 pt-5 px-4 overflow-hidden"
      style={{ background: "radial-gradient(ellipse at 50% 20%, #0e0a1a 0%, #000 65%)" }}>

      {/* Particle canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }} />

      <div className="relative z-10 w-full flex flex-col items-center justify-between h-full">
        {/* Top bar */}
        <div className="w-full flex items-center justify-between shrink-0">
          <div className="bg-white/8 rounded-full px-3 py-1 text-xs text-white/50 font-mono tabular-nums">{fmt(elapsedSec)}</div>
          <button onClick={handleClose} className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/15 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Avatar + dancing rings */}
        <div className="flex flex-col items-center gap-3 shrink-0">
          <div className="relative flex items-center justify-center" style={{ width: 256, height: 256 }}>

            {/* Outer ring — most reactive */}
            <div className="absolute rounded-full border"
              style={{
                width: 252, height: 252,
                borderWidth: "1.5px",
                borderColor: `rgba(${COLOR.rgb},${ring3.opacity})`,
                transform: `scale(${ring3.scale})`,
                willChange: "transform, border-color",
                boxShadow: ring3.glow > 1 ? `0 0 ${ring3.glow * 2}px rgba(${COLOR.rgb},${ring3.opacity * 0.7}), 0 0 ${ring3.glow * 4}px rgba(${COLOR.rgb},${ring3.opacity * 0.3})` : "none",
              }} />

            {/* Mid ring */}
            <div className="absolute rounded-full border"
              style={{
                width: 218, height: 218,
                borderWidth: "1.5px",
                borderColor: `rgba(${COLOR.rgb},${ring2.opacity})`,
                transform: `scale(${ring2.scale})`,
                willChange: "transform, border-color",
                boxShadow: ring2.glow > 1 ? `0 0 ${ring2.glow * 2}px rgba(${COLOR.rgb},${ring2.opacity * 0.8}), 0 0 ${ring2.glow * 3}px rgba(${COLOR.rgb},${ring2.opacity * 0.4})` : "none",
              }} />

            {/* Inner ring — tightest */}
            <div className="absolute rounded-full border-2"
              style={{
                width: 188, height: 188,
                borderColor: `rgba(${COLOR.rgb},${ring1.opacity})`,
                transform: `scale(${ring1.scale})`,
                willChange: "transform, border-color",
                boxShadow: ring1.glow > 1 ? `0 0 ${ring1.glow * 2}px rgba(${COLOR.rgb},${ring1.opacity * 0.9}), 0 0 ${ring1.glow * 5}px rgba(${COLOR.rgb},${ring1.opacity * 0.5})` : "none",
              }} />

            {/* Avatar */}
            <div className="w-44 h-44 rounded-full overflow-hidden ring-2 ring-white/15 shadow-2xl"
              style={{
                boxShadow: `0 0 ${40 + ring1.glow * 2}px rgba(${COLOR.rgb},0.25), 0 20px 60px rgba(0,0,0,0.8)`,
                animation: voiceState === "thinking" ? "sparkieTilt 1.8s ease-in-out infinite" : "none",
              }}>
              <Image src="/sparkie-avatar.jpg" alt="Sparkie" width={176} height={176}
                className="w-full h-full object-cover object-top" priority />
            </div>
          </div>

          {/* Name + status */}
          <div className="text-center">
            <p className="text-white font-semibold text-base tracking-wide">Sparkie</p>
            <p className={`text-sm mt-0.5 transition-colors duration-300 ${COLOR.text}`}>{STATUS}</p>
          </div>

          {/* Waveform */}
          <div className="flex items-end gap-[2px] h-8">
            {bars.map((h, i) => (
              <div key={i} className="w-[3px] rounded-full transition-all duration-75"
                style={{ height: `${Math.min(h, 32)}px`, backgroundColor: COLOR.bar }} />
            ))}
          </div>
        </div>

        {/* Transcript + karaoke */}
        <div className="w-full max-w-sm flex-1 flex flex-col gap-3 overflow-hidden py-2 min-h-0">
          {replyWords.length > 0 && voiceState !== "thinking" && (
            <div className="flex flex-col gap-1 flex-1 min-h-0">
              <p className="text-[11px] text-yellow-400/50 text-center">Sparkie</p>
              {/* FIX: track user scroll to stop auto-scroll fighting */}
              <div
                ref={replyRef}
                className="flex-1 overflow-y-auto text-center leading-relaxed px-3 scrollbar-hide min-h-0"
                onScrollCapture={() => {
                  userScrollingRef.current = true
                  if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
                  // Resume auto-scroll 3s after user stops touching scrollbar
                  scrollTimeoutRef.current = setTimeout(() => { userScrollingRef.current = false }, 3000)
                }}
              >
                <p className="text-sm">
                  {replyWords.map((word, i) => (
                    <span key={i} className="transition-colors duration-100"
                      style={{
                        color: i === highlightIdx
                          ? "#fde047"  // bright yellow — current word
                          : i < highlightIdx
                            ? "rgba(253,224,71,0.55)"  // dimmed gold — spoken
                            : "rgba(255,255,255,0.18)", // dim white — not yet spoken
                        fontWeight: i === highlightIdx ? 600 : 400,
                        fontSize: i === highlightIdx ? "1.05em" : "1em",
                        textShadow: i === highlightIdx ? `0 0 12px rgba(253,224,71,0.8)` : "none",
                      }}
                    >{word}{" "}</span>
                  ))}
                </p>
              </div>
            </div>
          )}
          {errorMsg && <p className="text-xs text-red-400 text-center">{errorMsg}</p>}
        </div>

        {/* Controls */}
        <div className="w-full flex flex-col items-center gap-4 shrink-0">
          {showPicker && (
            <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl p-3 backdrop-blur-md">
              <div className="flex gap-1 mb-2.5">
                {cats.map(cat => (
                  <button key={cat} onClick={() => setVoiceCat(cat)}
                    className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      voiceCat === cat ? "bg-yellow-500 text-black" : "bg-white/8 text-white/50 hover:bg-white/15"
                    }`}>{cat}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SPARKIE_VOICES.filter(v => v.cat === voiceCat).map(v => (
                  <button key={v.id} onClick={() => setSelectedVoice(v.id)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                      selectedVoice === v.id
                        ? "bg-yellow-500 text-black"
                        : "bg-white/8 text-white/55 hover:bg-white/15 border border-white/10"
                    }`}>{v.label}</button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-8">
            <button onClick={handleClose}
              className="w-[52px] h-[52px] rounded-full bg-red-500/15 border border-red-500/35 flex items-center justify-center text-red-400 hover:bg-red-500/30 transition-all active:scale-95">
              <PhoneOff size={18} />
            </button>

            <button
              onMouseDown={handlePTTStart}
              onMouseUp={handlePTTEnd}
              onMouseLeave={handlePTTEnd}
              onTouchStart={(e) => { e.preventDefault(); handlePTTStart() }}
              onTouchEnd={(e) => { e.preventDefault(); handlePTTEnd() }}
              onClick={handleMicClick}
              disabled={voiceState === "thinking"}
              className={`w-[72px] h-[72px] rounded-full flex items-center justify-center transition-all duration-200 select-none ${
                voiceState === "thinking"   ? "bg-white/5 border border-white/10 text-white/20 cursor-wait"
                : voiceState === "listening" ? "bg-red-500/20 border-2 border-red-400/60 text-red-400 scale-110 animate-pulse"
                : voiceState === "speaking"  ? "bg-yellow-500/15 border-2 border-yellow-400/55 text-yellow-400 scale-105"
                : "bg-white/10 border-2 border-white/25 text-white hover:bg-white/18 active:scale-95 active:bg-red-500/20 active:border-red-400/60 active:text-red-400"
              }`}
              style={
                voiceState === "listening" ? { boxShadow: "0 0 28px rgba(248,113,113,0.55)" }
                : voiceState === "speaking" ? { boxShadow: "0 0 22px rgba(250,204,21,0.35)" } : {}
              }
            >
              {voiceState === "thinking" ? (
                <div className="w-5 h-5 border-2 border-white/20 border-t-white/55 rounded-full animate-spin" />
              ) : voiceState === "speaking" ? <X size={20} />
                : voiceState === "listening" ? <MicOff size={20} />
                : <Mic size={20} />}
            </button>
            <p className="text-[10px] text-white/30 text-center mt-1 select-none">
              {voiceState === "idle" ? "Hold · SPACE" : voiceState === "listening" ? "Release to send" : ""}
            </p>

            <button onClick={() => setShowPicker(p => !p)}
              className={`w-[52px] h-[52px] rounded-full border flex items-center justify-center transition-all active:scale-95 ${
                showPicker ? "bg-yellow-500/15 border-yellow-500/35 text-yellow-400"
                : "bg-white/8 border-white/12 text-white/40 hover:bg-white/15"
              }`}>
              {showPicker ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </button>
          </div>

          <p className="text-[10px] text-white/25">
            {SPARKIE_VOICES.find(v => v.id === selectedVoice)?.label ?? "Voice"} ·{" "}
            {voiceState === "idle"       ? "Auto-stops when you pause"
            : voiceState === "listening" ? "Tap mic to stop early"
            : voiceState === "speaking"  ? "Tap to interrupt"
            : "Processing…"}
          </p>
        </div>
      </div>

      <style>{`
        @keyframes sparkieTilt {
          0%, 100% { transform: rotate(-2deg) scale(1.00); }
          50%       { transform: rotate( 2deg) scale(1.02); }
        }
      `}</style>
    </div>
  )
}
