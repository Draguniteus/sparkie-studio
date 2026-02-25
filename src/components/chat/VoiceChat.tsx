"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Mic, MicOff, X, PhoneOff, ChevronUp, ChevronDown } from "lucide-react"
import Image from "next/image"

const STORAGE_KEY = "sparkie_voice_pref"
const SPARKIE_DEFAULT_VOICE = "English_radiant_girl"
const SILENCE_THRESHOLD = 0.015
const SILENCE_DURATION  = 1400
const MS_PER_WORD       = 420

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

// Particle type for ambient stars
interface Particle { x: number; y: number; r: number; alpha: number; dx: number; dy: number; pulse: number }

export function VoiceChat({ onClose, onSendMessage, isActive }: VoiceChatProps) {
  // Load persisted voice from localStorage
  const getSavedVoice = () => {
    if (typeof window === "undefined") return SPARKIE_DEFAULT_VOICE
    try { return localStorage.getItem(STORAGE_KEY) || SPARKIE_DEFAULT_VOICE } catch { return SPARKIE_DEFAULT_VOICE }
  }

  const [voiceState,      setVoiceState]      = useState<VoiceState>("idle")
  const [transcript,      setTranscript]      = useState("")
  const [replyWords,      setReplyWords]      = useState<string[]>([])
  const [highlightIdx,    setHighlightIdx]    = useState(-1)
  const [errorMsg,        setErrorMsg]        = useState("")
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(SPARKIE_DEFAULT_VOICE)
  const [showVoicePicker, setShowVoicePicker] = useState(false)
  const [voiceCat,        setVoiceCat]        = useState<VoiceCat>("Girl")
  const [bars,            setBars]            = useState<number[]>(Array(20).fill(2))
  const [elapsedSec,      setElapsedSec]      = useState(0)
  // Ring animation values (3 rings, each with scale + opacity)
  const [rings,           setRings]           = useState<{scale: number; opacity: number}[]>([
    { scale: 1, opacity: 0.08 },
    { scale: 1, opacity: 0.05 },
    { scale: 1, opacity: 0.03 },
  ])

  const mediaRecorderRef  = useRef<MediaRecorder | null>(null)
  const audioChunksRef    = useRef<Blob[]>([])
  const audioPlayerRef    = useRef<HTMLAudioElement | null>(null)
  const streamRef         = useRef<MediaStream | null>(null)
  const isProcessingRef   = useRef(false)
  const silenceTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animFrameRef      = useRef<number | null>(null)
  const ringAnimRef       = useRef<number | null>(null)
  const particleAnimRef   = useRef<number | null>(null)
  const analyserRef       = useRef<AnalyserNode | null>(null)
  const audioCtxRef       = useRef<AudioContext | null>(null)
  const autoRestartRef    = useRef(true)
  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptRef     = useRef<HTMLDivElement>(null)
  const replyRef          = useRef<HTMLDivElement>(null)
  const canvasRef         = useRef<HTMLCanvasElement>(null)
  const particlesRef      = useRef<Particle[]>([])
  const voiceStateRef     = useRef<VoiceState>("idle")
  const volumeRef         = useRef(0)  // 0-1, live RMS

  // Keep voiceStateRef in sync
  useEffect(() => { voiceStateRef.current = voiceState }, [voiceState])

  // Load persisted voice on mount
  useEffect(() => { setSelectedVoiceId(getSavedVoice()) }, [])

  // Save voice to localStorage on change
  useEffect(() => {
    if (typeof window !== "undefined") {
      try { localStorage.setItem(STORAGE_KEY, selectedVoiceId) } catch {}
    }
  }, [selectedVoiceId])

  // Session timer
  useEffect(() => {
    if (!isActive) return
    const t0 = Date.now()
    timerRef.current = setInterval(() => setElapsedSec(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isActive])

  // Auto-scroll
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" })
  }, [transcript])
  useEffect(() => {
    replyRef.current?.scrollTo({ top: replyRef.current.scrollHeight, behavior: "smooth" })
  }, [highlightIdx])

  // ── Particle canvas ──────────────────────────────────────────────────
  const initParticles = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    particlesRef.current = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.8 + 0.4,
      alpha: Math.random() * 0.4 + 0.05,
      dx: (Math.random() - 0.5) * 0.3,
      dy: (Math.random() - 0.5) * 0.3,
      pulse: Math.random() * Math.PI * 2,
    }))
  }, [])

  const drawParticles = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const vol   = volumeRef.current
    const state = voiceStateRef.current
    const baseColor = state === "listening" ? "248,113,113"
                    : state === "speaking"  ? "250,204,21"
                    : state === "thinking"  ? "96,165,250"
                    : "200,200,255"

    particlesRef.current.forEach(p => {
      p.pulse += 0.02
      p.x += p.dx + (state === "speaking" ? Math.sin(p.pulse) * vol * 0.8 : 0)
      p.y += p.dy + (state === "speaking" ? Math.cos(p.pulse) * vol * 0.5 : 0)

      // Wrap around edges
      if (p.x < 0) p.x = canvas.width
      if (p.x > canvas.width) p.x = 0
      if (p.y < 0) p.y = canvas.height
      if (p.y > canvas.height) p.y = 0

      const alphaMod = state === "speaking" ? p.alpha + vol * 0.4 : p.alpha
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r + (state === "speaking" ? vol * 1.5 : 0), 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${baseColor},${Math.min(alphaMod, 0.9)})`
      ctx.fill()
    })
    particleAnimRef.current = requestAnimationFrame(drawParticles)
  }, [])

  useEffect(() => {
    if (!isActive) return
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
      initParticles()
    }
    resize()
    window.addEventListener("resize", resize)
    drawParticles()
    return () => {
      window.removeEventListener("resize", resize)
      if (particleAnimRef.current) cancelAnimationFrame(particleAnimRef.current)
    }
  }, [isActive, initParticles, drawParticles])

  // ── Animated rings (driven by AnalyserNode frequency data) ──────────
  const animateRings = useCallback(() => {
    if (ringAnimRef.current) cancelAnimationFrame(ringAnimRef.current)
    const analyser = analyserRef.current

    const tick = () => {
      const state = voiceStateRef.current
      let vol = 0

      if (analyser && (state === "listening" || state === "speaking")) {
        const buf = new Float32Array(analyser.fftSize)
        analyser.getFloatTimeDomainData(buf)
        const rms = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length)
        vol = Math.min(rms * 8, 1)
        volumeRef.current = vol
      } else if (state === "thinking") {
        // Slow gentle pulse while thinking
        vol = (Math.sin(Date.now() / 600) + 1) / 2 * 0.3
        volumeRef.current = vol
      } else {
        volumeRef.current = 0
      }

      const t = Date.now()
      setRings([
        {
          scale:   1 + vol * 0.18 + Math.sin(t / 380) * 0.012,
          opacity: 0.12 + vol * 0.55,
        },
        {
          scale:   1 + vol * 0.28 + Math.sin(t / 520 + 1) * 0.018,
          opacity: 0.07 + vol * 0.35,
        },
        {
          scale:   1 + vol * 0.40 + Math.sin(t / 700 + 2) * 0.025,
          opacity: 0.04 + vol * 0.20,
        },
      ])

      ringAnimRef.current = requestAnimationFrame(tick)
    }
    ringAnimRef.current = requestAnimationFrame(tick)
  }, [])

  // Start ring animation when active
  useEffect(() => {
    if (!isActive) return
    animateRings()
    return () => { if (ringAnimRef.current) cancelAnimationFrame(ringAnimRef.current) }
  }, [isActive, animateRings])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      autoRestartRef.current = false
      mediaRecorderRef.current?.stop()
      audioPlayerRef.current?.pause()
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (ringAnimRef.current) cancelAnimationFrame(ringAnimRef.current)
      if (particleAnimRef.current) cancelAnimationFrame(particleAnimRef.current)
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
      if (highlightTimerRef.current) clearInterval(highlightTimerRef.current)
      audioCtxRef.current?.close()
    }
  }, [])

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`

  // ── Waveform bars ────────────────────────────────────────────────────
  const animateBars = useCallback((analyser: AnalyserNode, mode: "listen" | "speak") => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    const buf = new Float32Array(analyser.frequencyBinCount)
    const tick = () => {
      if (mode === "listen") {
        analyser.getFloatTimeDomainData(buf)
        const bandSize = Math.floor(buf.length / 20)
        setBars(Array.from({ length: 20 }, (_, i) => {
          const slice = buf.slice(i * bandSize, (i + 1) * bandSize)
          const rms = Math.sqrt(slice.reduce((s, x) => s + x * x, 0) / bandSize)
          return Math.max(2, Math.round(rms * 350))
        }))
      } else {
        setBars(Array.from({ length: 20 }, () => Math.max(2, Math.floor(Math.random() * 48 + 4))))
      }
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
  }, [])

  const stopBars = useCallback(() => {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
    setBars(Array(20).fill(2))
  }, [])

  // ── Karaoke ──────────────────────────────────────────────────────────
  const startKaraoke = useCallback((words: string[], durationMs: number) => {
    if (highlightTimerRef.current) clearInterval(highlightTimerRef.current)
    setHighlightIdx(-1)
    const msPerWord = words.length > 0 ? Math.min(durationMs / words.length, MS_PER_WORD * 1.6) : MS_PER_WORD
    let idx = 0
    highlightTimerRef.current = setInterval(() => {
      setHighlightIdx(idx)
      idx++
      if (idx >= words.length && highlightTimerRef.current) clearInterval(highlightTimerRef.current)
    }, msPerWord)
  }, [])

  const stopKaraoke = useCallback(() => {
    if (highlightTimerRef.current) { clearInterval(highlightTimerRef.current); highlightTimerRef.current = null }
    setHighlightIdx(-1)
  }, [])

  // ── Process audio → STT → AI → TTS ──────────────────────────────────
  const processAudio = useCallback(async (mimeType: string) => {
    if (audioChunksRef.current.length === 0) { setVoiceState("idle"); return }
    isProcessingRef.current = true
    setVoiceState("thinking")
    stopBars(); stopKaraoke(); setReplyWords([])

    try {
      // 1. STT (Groq Whisper)
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
      const transcribeRes = await fetch("/api/transcribe", {
        method: "POST", headers: { "Content-Type": mimeType }, body: audioBlob,
      })
      if (!transcribeRes.ok) throw new Error("Transcription failed")
      const { transcript: text } = await transcribeRes.json()
      if (!text?.trim()) { setVoiceState("idle"); isProcessingRef.current = false; return }
      setTranscript(text.trim())

      // 2. AI reply
      const aiReply = await onSendMessage(text.trim())
      if (!aiReply?.trim()) { setVoiceState("idle"); isProcessingRef.current = false; return }

      const words = aiReply.trim().split(/\s+/)
      setReplyWords(words)
      setVoiceState("speaking")

      // 3. TTS
      const ttsRes = await fetch("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: aiReply.trim().slice(0, 2000),
          model: "speech-02-turbo",
          voice_id: selectedVoiceId,
        }),
      })

      if (ttsRes.ok) {
        const { url } = await ttsRes.json()
        if (url) {
          // Wire up AnalyserNode to audio output so rings react to TTS playback
          const speakCtx = new AudioContext()
          audioCtxRef.current = speakCtx
          const speakAnalyser = speakCtx.createAnalyser()
          speakAnalyser.fftSize = 256
          analyserRef.current = speakAnalyser
          animateBars(speakAnalyser, "speak")

          const audio = new Audio(url)
          audioPlayerRef.current = audio

          audio.onloadedmetadata = () => {
            const durationMs = (isNaN(audio.duration) ? words.length * MS_PER_WORD : audio.duration * 1000)
            startKaraoke(words, durationMs)
          }

          audio.onended = () => {
            stopBars(); stopKaraoke()
            analyserRef.current = null
            speakCtx.close()
            isProcessingRef.current = false
            if (autoRestartRef.current) {
              setVoiceState("idle")
              setTimeout(() => { if (autoRestartRef.current && !isProcessingRef.current) startListening() }, 700)
            } else {
              setVoiceState("idle")
            }
          }
          audio.onerror = () => {
            stopBars(); stopKaraoke(); analyserRef.current = null; speakCtx.close()
            setVoiceState("idle"); isProcessingRef.current = false
          }
          await audio.play()
          return
        }
      }
      setVoiceState("idle"); isProcessingRef.current = false
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Voice processing failed")
      setVoiceState("idle"); isProcessingRef.current = false
      stopBars(); stopKaraoke()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSendMessage, selectedVoiceId, animateBars, stopBars, startKaraoke, stopKaraoke])

  // ── Listening ────────────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    if (isProcessingRef.current) return
    setErrorMsg(""); setTranscript(""); setReplyWords([]); stopKaraoke()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const audioCtx  = new AudioContext()
      audioCtxRef.current = audioCtx
      const source    = audioCtx.createMediaStreamSource(stream)
      const analyser  = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser
      animateBars(analyser, "listen")

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4"

      const mr = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null; audioCtx.close(); analyserRef.current = null
        stopBars(); await processAudio(mimeType)
      }
      mr.start(100)
      mediaRecorderRef.current = mr
      setVoiceState("listening")

      const buf = new Float32Array(analyser.frequencyBinCount)
      const checkSilence = () => {
        if (!analyserRef.current || mediaRecorderRef.current?.state !== "recording") return
        analyser.getFloatTimeDomainData(buf)
        const rms = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length)
        if (rms < SILENCE_THRESHOLD) {
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              silenceTimerRef.current = null
              mediaRecorderRef.current?.stop(); mediaRecorderRef.current = null
            }, SILENCE_DURATION)
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

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
    mediaRecorderRef.current?.stop()
  }, [])

  const cancelSpeaking = useCallback(() => {
    autoRestartRef.current = false
    audioPlayerRef.current?.pause(); audioPlayerRef.current = null
    stopBars(); stopKaraoke(); analyserRef.current = null
    setVoiceState("idle"); isProcessingRef.current = false
    setTimeout(() => { autoRestartRef.current = true }, 500)
  }, [stopBars, stopKaraoke])

  const handleMicClick = useCallback(() => {
    if (voiceState === "idle")       startListening()
    else if (voiceState === "listening") stopListening()
    else if (voiceState === "speaking")  cancelSpeaking()
  }, [voiceState, startListening, stopListening, cancelSpeaking])

  const handleClose = useCallback(() => {
    autoRestartRef.current = false
    cancelSpeaking(); stopListening(); onClose()
  }, [cancelSpeaking, stopListening, onClose])

  if (!isActive) return null

  // Color scheme by state
  const stateColor = {
    idle:      { ring: "255,255,255",  glow: "rgba(255,255,255,0.05)",  text: "text-white/30",   bar: "rgba(255,255,255,0.15)" },
    listening: { ring: "248,113,113",  glow: "rgba(248,113,113,0.38)",  text: "text-red-400",    bar: "#f87171" },
    thinking:  { ring: "96,165,250",   glow: "rgba(96,165,250,0.32)",   text: "text-blue-400",   bar: "#60a5fa" },
    speaking:  { ring: "250,204,21",   glow: "rgba(250,204,21,0.42)",   text: "text-yellow-400", bar: "#facc15" },
  }[voiceState]

  const statusText = {
    idle: "Tap to speak", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking…",
  }[voiceState]

  const cats: VoiceCat[] = ["Girl", "Woman", "Male"]

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between pb-6 pt-5 px-4 overflow-hidden"
      style={{ background: "radial-gradient(ellipse at 50% 25%, #0d0d1a 0%, #000 68%)" }}>

      {/* Ambient particle canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }} />

      {/* All content above canvas */}
      <div className="relative z-10 w-full flex flex-col items-center justify-between h-full">

        {/* Top bar */}
        <div className="w-full flex items-center justify-between shrink-0">
          <div className="bg-white/8 rounded-full px-3 py-1 text-xs text-white/50 font-mono tabular-nums">
            {fmt(elapsedSec)}
          </div>
          <button onClick={handleClose}
            className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/15 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Avatar + dancing rings */}
        <div className="flex flex-col items-center gap-3 shrink-0">
          <div className="relative flex items-center justify-center" style={{ width: 240, height: 240 }}>

            {/* Outer ring 3 — most reactive, farthest */}
            <div className="absolute rounded-full border"
              style={{
                width: 238, height: 238,
                borderColor: `rgba(${stateColor.ring},${rings[2].opacity})`,
                transform: `scale(${rings[2].scale})`,
                transition: "transform 80ms ease-out, border-color 200ms",
                boxShadow: `0 0 ${30 * rings[2].opacity * 4}px rgba(${stateColor.ring},${rings[2].opacity * 0.5})`,
              }} />

            {/* Middle ring 2 */}
            <div className="absolute rounded-full border"
              style={{
                width: 210, height: 210,
                borderColor: `rgba(${stateColor.ring},${rings[1].opacity})`,
                transform: `scale(${rings[1].scale})`,
                transition: "transform 60ms ease-out, border-color 200ms",
                boxShadow: `0 0 ${20 * rings[1].opacity * 4}px rgba(${stateColor.ring},${rings[1].opacity * 0.6})`,
              }} />

            {/* Inner ring 1 — tightest to avatar */}
            <div className="absolute rounded-full border-2"
              style={{
                width: 185, height: 185,
                borderColor: `rgba(${stateColor.ring},${rings[0].opacity})`,
                transform: `scale(${rings[0].scale})`,
                transition: "transform 40ms ease-out, border-color 200ms",
                boxShadow: `0 0 ${15 * rings[0].opacity * 5}px rgba(${stateColor.ring},${rings[0].opacity * 0.8})`,
              }} />

            {/* Avatar */}
            <div
              className="w-44 h-44 rounded-full overflow-hidden ring-2 ring-white/15 shadow-2xl"
              style={{
                boxShadow: stateColor.glow + ", 0 20px 60px rgba(0,0,0,0.8)",
                transform: voiceState === "thinking" ? "rotate(-2deg)" : "rotate(0deg)",
                transition: "transform 0.6s ease-in-out, box-shadow 0.3s",
                animation: voiceState === "thinking" ? "sparkieTilt 2s ease-in-out infinite" : "none",
              }}
            >
              <Image src="/sparkie-avatar.jpg" alt="Sparkie" width={176} height={176}
                className="w-full h-full object-cover object-top" priority />
            </div>
          </div>

          {/* Name + status */}
          <div className="text-center">
            <p className="text-white font-semibold text-base tracking-wide">Sparkie</p>
            <p className={`text-sm mt-0.5 transition-colors duration-300 ${stateColor.text}`}>{statusText}</p>
          </div>

          {/* Waveform bars */}
          <div className="flex items-end gap-[2px] h-8">
            {bars.map((h, i) => (
              <div key={i} className="w-[3px] rounded-full transition-all duration-75"
                style={{ height: `${Math.min(h, 32)}px`, backgroundColor: stateColor.bar }} />
            ))}
          </div>
        </div>

        {/* Transcript + karaoke reply */}
        <div className="w-full max-w-sm flex-1 flex flex-col gap-3 overflow-hidden py-2 min-h-0">
          {transcript && (
            <div className="flex flex-col gap-1">
              <p className="text-[11px] text-white/35 text-center">You</p>
              <div ref={transcriptRef}
                className="max-h-20 overflow-y-auto text-sm text-white/65 text-center leading-relaxed px-2 scrollbar-hide">
                {transcript}
              </div>
            </div>
          )}
          {replyWords.length > 0 && voiceState !== "thinking" && (
            <div className="flex flex-col gap-1">
              <p className="text-[11px] text-yellow-400/50 text-center">Sparkie</p>
              <div ref={replyRef}
                className="max-h-32 overflow-y-auto text-center leading-relaxed px-2 scrollbar-hide">
                <p className="text-sm inline">
                  {replyWords.map((word, i) => (
                    <span key={i} className={`transition-colors duration-150 ${
                      i < highlightIdx  ? "text-yellow-300/70" :
                      i === highlightIdx ? "text-yellow-300 font-semibold" :
                      "text-white/22"
                    }`}>{word}{" "}</span>
                  ))}
                </p>
              </div>
            </div>
          )}
          {errorMsg && <p className="text-xs text-red-400 text-center">{errorMsg}</p>}
        </div>

        {/* Controls */}
        <div className="w-full flex flex-col items-center gap-4 shrink-0">
          {showVoicePicker && (
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
                  <button key={v.id} onClick={() => setSelectedVoiceId(v.id)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                      selectedVoiceId === v.id
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

            <button onClick={handleMicClick} disabled={voiceState === "thinking"}
              className={`w-[72px] h-[72px] rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 ${
                voiceState === "thinking"
                  ? "bg-white/5 border border-white/10 text-white/20 cursor-wait"
                  : voiceState === "listening"
                    ? "bg-red-500/20 border-2 border-red-400/60 text-red-400 scale-105"
                    : voiceState === "speaking"
                      ? "bg-yellow-500/15 border-2 border-yellow-400/55 text-yellow-400 scale-105"
                      : "bg-white/10 border-2 border-white/25 text-white hover:bg-white/18"
              }`}
              style={
                voiceState === "listening" ? { boxShadow: "0 0 22px rgba(248,113,113,0.35)" } :
                voiceState === "speaking"  ? { boxShadow: "0 0 22px rgba(250,204,21,0.35)" } : {}
              }
            >
              {voiceState === "thinking" ? (
                <div className="w-5 h-5 border-2 border-white/20 border-t-white/55 rounded-full animate-spin" />
              ) : voiceState === "speaking" ? <X size={20} />
                : voiceState === "listening" ? <MicOff size={20} />
                : <Mic size={20} />}
            </button>

            <button onClick={() => setShowVoicePicker(p => !p)}
              className={`w-[52px] h-[52px] rounded-full border flex items-center justify-center transition-all active:scale-95 ${
                showVoicePicker
                  ? "bg-yellow-500/15 border-yellow-500/35 text-yellow-400"
                  : "bg-white/8 border-white/12 text-white/40 hover:bg-white/15"
              }`}>
              {showVoicePicker ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </button>
          </div>

          <p className="text-[10px] text-white/25">
            {SPARKIE_VOICES.find(v => v.id === selectedVoiceId)?.label ?? "Voice"} ·{" "}
            {voiceState === "idle"      ? "Auto-stops when you pause"
            : voiceState === "listening" ? "Tap mic to stop early"
            : voiceState === "speaking"  ? "Tap to interrupt"
            : "Processing…"}
          </p>
        </div>
      </div>

      {/* Keyframe for Sparkie thinking tilt */}
      <style>{`
        @keyframes sparkieTilt {
          0%, 100% { transform: rotate(-2deg) scale(1); }
          50%       { transform: rotate(2deg) scale(1.02); }
        }
      `}</style>
    </div>
  )
}
