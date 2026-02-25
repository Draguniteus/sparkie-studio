"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Mic, MicOff, X, Volume2, PhoneOff, Settings2, ChevronUp, ChevronDown } from "lucide-react"
import Image from "next/image"

// Sparkie's voice identity — sweet, magical-girl energy
const SPARKIE_DEFAULT_VOICE = "English_radiant_girl"

// MiniMax voice options — platform.minimax.io/docs/faq/system-voice-id
const SPARKIE_VOICES = [
  { id: "English_radiant_girl",        label: "Radiant Girl",       cat: "Girl"  as const },
  { id: "English_PlayfulGirl",         label: "Playful Girl",       cat: "Girl"  as const },
  { id: "English_LovelyGirl",          label: "Lovely Girl",        cat: "Girl"  as const },
  { id: "English_Kind-heartedGirl",    label: "Kind-Hearted",       cat: "Girl"  as const },
  { id: "English_WhimsicalGirl",       label: "Whimsical",          cat: "Girl"  as const },
  { id: "English_Soft-spokenGirl",     label: "Soft-Spoken",        cat: "Girl"  as const },
  { id: "English_Whispering_girl",     label: "Whispering",         cat: "Girl"  as const },
  { id: "English_UpsetGirl",           label: "Upset Girl",         cat: "Girl"  as const },
  { id: "English_AnimeCharacter",      label: "Anime Girl",         cat: "Girl"  as const },
  { id: "English_CalmWoman",           label: "Calm",               cat: "Woman" as const },
  { id: "English_Upbeat_Woman",        label: "Upbeat",             cat: "Woman" as const },
  { id: "English_SereneWoman",         label: "Serene",             cat: "Woman" as const },
  { id: "English_ConfidentWoman",      label: "Confident",          cat: "Woman" as const },
  { id: "English_AssertiveQueen",      label: "Assertive",          cat: "Woman" as const },
  { id: "English_ImposingManner",      label: "Imposing",           cat: "Woman" as const },
  { id: "English_WiseladyWise",        label: "Wise Lady",          cat: "Woman" as const },
  { id: "English_Graceful_Lady",       label: "Graceful",           cat: "Woman" as const },
  { id: "English_compelling_lady1",    label: "Compelling",         cat: "Woman" as const },
  { id: "English_captivating_female1", label: "Captivating",        cat: "Woman" as const },
  { id: "English_MaturePartner",       label: "Mature",             cat: "Woman" as const },
  { id: "English_MatureBoss",          label: "Bossy",              cat: "Woman" as const },
  { id: "English_SentimentalLady",     label: "Sentimental",        cat: "Woman" as const },
  { id: "English_StressedLady",        label: "Stressed",           cat: "Woman" as const },
  { id: "English_expressive_narrator", label: "Expressive",         cat: "Male"  as const },
  { id: "Deep_Voice_Man",              label: "Deep Voice",         cat: "Male"  as const },
  { id: "Gentle_Man",                  label: "Gentle",             cat: "Male"  as const },
  { id: "Friendly_Person",             label: "Friendly",           cat: "Male"  as const },
  { id: "news_anchor_en",              label: "News Anchor",        cat: "Male"  as const },
]

interface VoiceChatProps {
  onClose: () => void
  onSendMessage: (text: string) => Promise<string>
  voiceId?: string
  isActive: boolean
}

type VoiceState = "idle" | "listening" | "thinking" | "speaking"
type VoiceCat = "Girl" | "Woman" | "Male"

const SILENCE_THRESHOLD = 0.015
const SILENCE_DURATION  = 1400

export function VoiceChat({ onClose, onSendMessage, isActive }: VoiceChatProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle")
  const [transcript, setTranscript] = useState("")
  const [spokenReply, setSpokenReply] = useState("")
  const [errorMsg, setErrorMsg] = useState("")
  const [selectedVoiceId, setSelectedVoiceId] = useState(SPARKIE_DEFAULT_VOICE)
  const [showVoicePicker, setShowVoicePicker] = useState(false)
  const [voiceCat, setVoiceCat] = useState<VoiceCat>("Girl")
  const [bars, setBars] = useState<number[]>(Array(20).fill(2))
  const [isMuted, setIsMuted] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef   = useRef<Blob[]>([])
  const audioPlayerRef   = useRef<HTMLAudioElement | null>(null)
  const streamRef        = useRef<MediaStream | null>(null)
  const isProcessingRef  = useRef(false)
  const silenceTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animFrameRef     = useRef<number | null>(null)
  const analyserRef      = useRef<AnalyserNode | null>(null)
  const audioCtxRef      = useRef<AudioContext | null>(null)
  const autoRestartRef   = useRef(true)
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef     = useRef<number>(0)

  // Session timer
  useEffect(() => {
    if (isActive) {
      startTimeRef.current = Date.now()
      timerRef.current = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isActive])

  // Cleanup on unmount/close
  useEffect(() => {
    return () => {
      autoRestartRef.current = false
      mediaRecorderRef.current?.stop()
      audioPlayerRef.current?.pause()
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
      audioCtxRef.current?.close()
    }
  }, [])

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`

  const animateBars = useCallback((analyser: AnalyserNode, mode: "listen" | "speak") => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    const buf = new Float32Array(analyser.frequencyBinCount)
    const tick = () => {
      if (mode === "listen") {
        analyser.getFloatTimeDomainData(buf)
        const bandSize = Math.floor(buf.length / 20)
        const newBars = Array.from({ length: 20 }, (_, i) => {
          const slice = buf.slice(i * bandSize, (i + 1) * bandSize)
          const rms = Math.sqrt(slice.reduce((s, x) => s + x * x, 0) / bandSize)
          return Math.max(2, Math.round(rms * 350))
        })
        setBars(newBars)
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

  const processAudio = useCallback(async (mimeType: string) => {
    if (audioChunksRef.current.length === 0) { setVoiceState("idle"); return }
    isProcessingRef.current = true
    setVoiceState("thinking")
    stopBars()

    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
      const transcribeRes = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": mimeType },
        body: audioBlob,
      })
      if (!transcribeRes.ok) throw new Error("Transcription failed")
      const { transcript: text } = await transcribeRes.json()
      if (!text?.trim()) { setVoiceState("idle"); isProcessingRef.current = false; return }
      setTranscript(text.trim())

      const aiReply = await onSendMessage(text.trim())
      if (!aiReply?.trim()) { setVoiceState("idle"); isProcessingRef.current = false; return }
      setSpokenReply(aiReply.trim())

      setVoiceState("speaking")

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
          // Fake waveform while speaking — no analyser available for data URL
          const speakCtx = new AudioContext()
          audioCtxRef.current = speakCtx
          const speakAnalyser = speakCtx.createAnalyser()
          speakAnalyser.fftSize = 256
          animateBars(speakAnalyser, "speak")

          const audio = new Audio(url)
          audioPlayerRef.current = audio
          audio.onended = () => {
            stopBars()
            speakCtx.close()
            isProcessingRef.current = false
            if (autoRestartRef.current) {
              setVoiceState("idle")
              setTimeout(() => { if (autoRestartRef.current && !isProcessingRef.current) startListening() }, 700)
            } else {
              setVoiceState("idle")
            }
          }
          audio.onerror = () => { stopBars(); speakCtx.close(); setVoiceState("idle"); isProcessingRef.current = false }
          await audio.play()
          return
        }
      }
      setVoiceState("idle")
      isProcessingRef.current = false
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Voice processing failed")
      setVoiceState("idle")
      isProcessingRef.current = false
      stopBars()
    }
  }, [onSendMessage, selectedVoiceId, animateBars, stopBars])

  const startListening = useCallback(async () => {
    if (isProcessingRef.current || isMuted) return
    setErrorMsg("")
    setTranscript("")
    setSpokenReply("")

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      const source   = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
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
        streamRef.current = null
        audioCtx.close()
        analyserRef.current = null
        stopBars()
        await processAudio(mimeType)
      }
      mr.start(100)
      mediaRecorderRef.current = mr
      setVoiceState("listening")

      // VAD silence detection
      const buf = new Float32Array(analyser.frequencyBinCount)
      const checkSilence = () => {
        if (!analyserRef.current || mediaRecorderRef.current?.state !== "recording") return
        analyser.getFloatTimeDomainData(buf)
        const rms = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length)
        if (rms < SILENCE_THRESHOLD) {
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              silenceTimerRef.current = null
              mediaRecorderRef.current?.stop()
              mediaRecorderRef.current = null
            }, SILENCE_DURATION)
          }
        } else {
          if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
        }
        setTimeout(checkSilence, 100)
      }
      checkSilence()
    } catch {
      setErrorMsg("Microphone access denied.")
      setVoiceState("idle")
    }
  }, [isMuted, animateBars, stopBars, processAudio])

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
    mediaRecorderRef.current?.stop()
  }, [])

  const cancelSpeaking = useCallback(() => {
    autoRestartRef.current = false
    audioPlayerRef.current?.pause()
    audioPlayerRef.current = null
    stopBars()
    setVoiceState("idle")
    isProcessingRef.current = false
    setTimeout(() => { autoRestartRef.current = true }, 500)
  }, [stopBars])

  const handleMicClick = useCallback(() => {
    if (voiceState === "idle")      startListening()
    else if (voiceState === "listening") stopListening()
    else if (voiceState === "speaking")  cancelSpeaking()
  }, [voiceState, startListening, stopListening, cancelSpeaking])

  const handleClose = useCallback(() => {
    autoRestartRef.current = false
    cancelSpeaking()
    stopListening()
    onClose()
  }, [cancelSpeaking, stopListening, onClose])

  if (!isActive) return null

  const cats: VoiceCat[] = ["Girl", "Woman", "Male"]

  // Orb ring color by state
  const ringClass = {
    idle:      "ring-white/10",
    listening: "ring-red-400/70 animate-pulse",
    thinking:  "ring-blue-400/60",
    speaking:  "ring-honey-400/80",
  }[voiceState]

  const statusText = {
    idle:      "Tap to speak",
    listening: "Listening…",
    thinking:  "Thinking…",
    speaking:  "Speaking…",
  }[voiceState]

  const barColor = voiceState === "listening" ? "#f87171" : voiceState === "speaking" ? "#fbbf24" : "rgba(255,255,255,0.2)"

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-black pb-8 pt-6 px-6"
         style={{ background: "radial-gradient(ellipse at 50% 30%, #0d0d1a 0%, #000 70%)" }}>

      {/* Top bar — timer + close */}
      <div className="w-full flex items-center justify-between">
        <div className="bg-white/8 rounded-full px-3 py-1 text-xs text-white/60 font-mono tabular-nums">
          {formatTime(elapsedSec)}
        </div>
        <button onClick={handleClose}
          className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/15 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* ── Avatar focal point ─────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-6 flex-1 justify-center">

        {/* Halo ring + avatar */}
        <div className="relative flex items-center justify-center">
          {/* Outer glow rings — layered for depth */}
          <div className={`absolute w-64 h-64 rounded-full ring-2 transition-all duration-700 ${ringClass}`} />
          <div className={`absolute w-52 h-52 rounded-full ring-1 transition-all duration-500 ${ringClass} opacity-40`} />

          {/* Avatar circle */}
          <div className={`w-48 h-48 rounded-full overflow-hidden ring-2 ring-white/20 shadow-2xl transition-transform duration-700 ${
            voiceState === "speaking"  ? "scale-105" :
            voiceState === "listening" ? "scale-102" : "scale-100"
          }`}
            style={{ boxShadow: voiceState === "speaking" ? "0 0 60px rgba(251,191,36,0.35)" :
                                 voiceState === "listening" ? "0 0 40px rgba(248,113,113,0.3)" :
                                 voiceState === "thinking"  ? "0 0 40px rgba(96,165,250,0.3)" :
                                 "0 0 20px rgba(255,255,255,0.05)" }}>
            <Image
              src="/sparkie-avatar.jpg"
              alt="Sparkie"
              width={192}
              height={192}
              className="w-full h-full object-cover object-top"
              priority
            />
          </div>
        </div>

        {/* Name + state */}
        <div className="text-center">
          <p className="text-white font-semibold text-lg tracking-wide">Sparkie</p>
          <p className={`text-sm mt-0.5 transition-colors duration-300 ${
            voiceState === "listening" ? "text-red-400" :
            voiceState === "thinking"  ? "text-blue-400" :
            voiceState === "speaking"  ? "text-honey-400" :
            "text-white/40"
          }`}>{statusText}</p>
        </div>

        {/* Waveform bars */}
        <div className="flex items-end gap-[2px] h-10">
          {bars.map((h, i) => (
            <div key={i}
              className="w-[3px] rounded-full transition-all duration-75"
              style={{ height: `${Math.min(h, 40)}px`, backgroundColor: barColor }} />
          ))}
        </div>

        {/* Transcript */}
        {transcript && (
          <div className="text-center max-w-xs">
            <p className="text-xs text-white/40 mb-1">You</p>
            <p className="text-sm text-white/70 leading-relaxed line-clamp-2">{transcript}</p>
          </div>
        )}
        {spokenReply && voiceState !== "thinking" && (
          <div className="text-center max-w-xs">
            <p className="text-xs text-honey-400/60 mb-1">Sparkie</p>
            <p className="text-sm text-honey-400/80 leading-relaxed line-clamp-3">
              {spokenReply.slice(0, 180)}{spokenReply.length > 180 ? "…" : ""}
            </p>
          </div>
        )}
        {errorMsg && <p className="text-xs text-red-400 text-center max-w-xs">{errorMsg}</p>}
      </div>

      {/* ── Bottom controls ──────────────────────────────────────────────── */}
      <div className="w-full flex flex-col items-center gap-5">

        {/* Voice picker sheet */}
        {showVoicePicker && (
          <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md">
            <div className="flex gap-1 mb-3">
              {cats.map(cat => (
                <button key={cat} onClick={() => setVoiceCat(cat)}
                  className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    voiceCat === cat ? "bg-honey-500 text-black" : "bg-white/8 text-white/50 hover:bg-white/15"
                  }`}>{cat}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SPARKIE_VOICES.filter(v => v.cat === voiceCat).map(v => (
                <button key={v.id} onClick={() => setSelectedVoiceId(v.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                    selectedVoiceId === v.id
                      ? "bg-honey-500 text-black"
                      : "bg-white/8 text-white/60 hover:bg-white/15 border border-white/10"
                  }`}>{v.label}</button>
              ))}
            </div>
          </div>
        )}

        {/* Main controls row */}
        <div className="flex items-center gap-8">
          {/* End call */}
          <button onClick={handleClose}
            className="w-14 h-14 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 hover:bg-red-500/35 transition-all active:scale-95">
            <PhoneOff size={20} />
          </button>

          {/* Mic — primary CTA */}
          <button onClick={handleMicClick} disabled={voiceState === "thinking"}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 ${
              voiceState === "thinking"
                ? "bg-white/5 border border-white/10 text-white/20 cursor-wait"
                : voiceState === "listening"
                  ? "bg-red-500/25 border-2 border-red-400/70 text-red-400 scale-105"
                  : voiceState === "speaking"
                    ? "bg-honey-500/20 border-2 border-honey-400/60 text-honey-400 scale-105"
                    : "bg-white/10 border-2 border-white/30 text-white hover:bg-white/18"
            }`}
            style={voiceState === "listening" ? { boxShadow: "0 0 25px rgba(248,113,113,0.4)" } :
                   voiceState === "speaking"  ? { boxShadow: "0 0 25px rgba(251,191,36,0.4)" } : {}}>
            {voiceState === "thinking" ? (
              <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            ) : voiceState === "speaking" ? (
              <X size={22} />
            ) : voiceState === "listening" ? (
              <MicOff size={22} />
            ) : (
              <Mic size={22} />
            )}
          </button>

          {/* Voice settings */}
          <button onClick={() => setShowVoicePicker(p => !p)}
            className={`w-14 h-14 rounded-full border flex items-center justify-center transition-all active:scale-95 ${
              showVoicePicker ? "bg-honey-500/20 border-honey-500/40 text-honey-400" : "bg-white/8 border-white/15 text-white/50 hover:bg-white/15"
            }`}>
            {showVoicePicker ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
        </div>

        {/* Voice label */}
        <p className="text-[11px] text-white/30">
          {SPARKIE_VOICES.find(v => v.id === selectedVoiceId)?.label ?? "Voice"} · {
            voiceState === "idle" ? "Auto-stops when you pause" :
            voiceState === "listening" ? "Tap to stop early" :
            voiceState === "speaking" ? "Tap to interrupt" : "Processing…"
          }
        </p>
      </div>
    </div>
  )
}
