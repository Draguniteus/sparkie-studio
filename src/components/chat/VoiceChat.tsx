"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Mic, MicOff, X, PhoneOff, ChevronUp, ChevronDown } from "lucide-react"
import Image from "next/image"

const SPARKIE_DEFAULT_VOICE = "English_radiant_girl"

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
  { id: "news_anchor_en",              label: "News Anchor",     cat: "Male"  as const },
]

interface VoiceChatProps {
  onClose: () => void
  onSendMessage: (text: string) => Promise<string>
  isActive: boolean
}

type VoiceState = "idle" | "listening" | "thinking" | "speaking"
type VoiceCat   = "Girl" | "Woman" | "Male"

const SILENCE_THRESHOLD = 0.015
const SILENCE_DURATION  = 1400

// Estimate ms-per-word for TTS at normal speed (~140 wpm = ~430ms/word average)
const MS_PER_WORD = 430

export function VoiceChat({ onClose, onSendMessage, isActive }: VoiceChatProps) {
  const [voiceState,      setVoiceState]      = useState<VoiceState>("idle")
  const [transcript,      setTranscript]      = useState("")
  const [replyWords,      setReplyWords]      = useState<string[]>([])
  const [highlightIdx,    setHighlightIdx]    = useState(-1)
  const [errorMsg,        setErrorMsg]        = useState("")
  const [selectedVoiceId, setSelectedVoiceId] = useState(SPARKIE_DEFAULT_VOICE)
  const [showVoicePicker, setShowVoicePicker] = useState(false)
  const [voiceCat,        setVoiceCat]        = useState<VoiceCat>("Girl")
  const [bars,            setBars]            = useState<number[]>(Array(20).fill(2))
  const [elapsedSec,      setElapsedSec]      = useState(0)

  const mediaRecorderRef  = useRef<MediaRecorder | null>(null)
  const audioChunksRef    = useRef<Blob[]>([])
  const audioPlayerRef    = useRef<HTMLAudioElement | null>(null)
  const streamRef         = useRef<MediaStream | null>(null)
  const isProcessingRef   = useRef(false)
  const silenceTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animFrameRef      = useRef<number | null>(null)
  const analyserRef       = useRef<AnalyserNode | null>(null)
  const audioCtxRef       = useRef<AudioContext | null>(null)
  const autoRestartRef    = useRef(true)
  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptRef     = useRef<HTMLDivElement>(null)
  const replyRef          = useRef<HTMLDivElement>(null)

  // Session timer
  useEffect(() => {
    if (!isActive) return
    const t0 = Date.now()
    timerRef.current = setInterval(() => setElapsedSec(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isActive])

  // Auto-scroll transcript as it updates
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" })
  }, [transcript])

  // Auto-scroll reply as words highlight
  useEffect(() => {
    replyRef.current?.scrollTo({ top: replyRef.current.scrollHeight, behavior: "smooth" })
  }, [highlightIdx])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      autoRestartRef.current = false
      mediaRecorderRef.current?.stop()
      audioPlayerRef.current?.pause()
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (animFrameRef.current)  cancelAnimationFrame(animFrameRef.current)
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
      if (highlightTimerRef.current) clearInterval(highlightTimerRef.current)
      audioCtxRef.current?.close()
    }
  }, [])

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`

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

  // Start word-by-word karaoke highlight
  const startKaraoke = useCallback((words: string[], audioDurationMs: number) => {
    if (highlightTimerRef.current) clearInterval(highlightTimerRef.current)
    setHighlightIdx(-1)
    const msPerWord = words.length > 0
      ? Math.min(audioDurationMs / words.length, MS_PER_WORD * 1.5)
      : MS_PER_WORD
    let idx = 0
    highlightTimerRef.current = setInterval(() => {
      setHighlightIdx(idx)
      idx++
      if (idx >= words.length) {
        if (highlightTimerRef.current) clearInterval(highlightTimerRef.current)
      }
    }, msPerWord)
  }, [])

  const stopKaraoke = useCallback(() => {
    if (highlightTimerRef.current) { clearInterval(highlightTimerRef.current); highlightTimerRef.current = null }
    setHighlightIdx(-1)
  }, [])

  const processAudio = useCallback(async (mimeType: string) => {
    if (audioChunksRef.current.length === 0) { setVoiceState("idle"); return }
    isProcessingRef.current = true
    setVoiceState("thinking")
    stopBars()
    setReplyWords([])
    stopKaraoke()

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

      const words = aiReply.trim().split(/\s+/)
      setReplyWords(words)
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
          const speakCtx = new AudioContext()
          audioCtxRef.current = speakCtx
          const speakAnalyser = speakCtx.createAnalyser()
          speakAnalyser.fftSize = 256
          animateBars(speakAnalyser, "speak")

          const audio = new Audio(url)
          audioPlayerRef.current = audio

          // Start karaoke once we know duration
          audio.onloadedmetadata = () => {
            const durationMs = audio.duration * 1000
            startKaraoke(words, durationMs)
          }
          // Fallback: estimate if metadata not available fast enough
          audio.onplay = () => {
            if (audio.duration && !isNaN(audio.duration)) return
            startKaraoke(words, words.length * MS_PER_WORD)
          }

          audio.onended = () => {
            stopBars()
            stopKaraoke()
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
            stopBars(); stopKaraoke(); speakCtx.close()
            setVoiceState("idle"); isProcessingRef.current = false
          }
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
      stopBars(); stopKaraoke()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSendMessage, selectedVoiceId, animateBars, stopBars, startKaraoke, stopKaraoke])

  const startListening = useCallback(async () => {
    if (isProcessingRef.current) return
    setErrorMsg("")
    setTranscript("")
    setReplyWords([])
    stopKaraoke()

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
        streamRef.current = null
        audioCtx.close()
        analyserRef.current = null
        stopBars()
        await processAudio(mimeType)
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
  }, [animateBars, stopBars, processAudio, stopKaraoke])

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
    mediaRecorderRef.current?.stop()
  }, [])

  const cancelSpeaking = useCallback(() => {
    autoRestartRef.current = false
    audioPlayerRef.current?.pause()
    audioPlayerRef.current = null
    stopBars(); stopKaraoke()
    setVoiceState("idle")
    isProcessingRef.current = false
    setTimeout(() => { autoRestartRef.current = true }, 500)
  }, [stopBars, stopKaraoke])

  const handleMicClick = useCallback(() => {
    if (voiceState === "idle")       startListening()
    else if (voiceState === "listening")  stopListening()
    else if (voiceState === "speaking")   cancelSpeaking()
  }, [voiceState, startListening, stopListening, cancelSpeaking])

  const handleClose = useCallback(() => {
    autoRestartRef.current = false
    cancelSpeaking(); stopListening(); onClose()
  }, [cancelSpeaking, stopListening, onClose])

  if (!isActive) return null

  const cats: VoiceCat[] = ["Girl", "Woman", "Male"]

  const ringColor = {
    idle:      "ring-white/10",
    listening: "ring-red-400/70",
    thinking:  "ring-blue-400/60",
    speaking:  "ring-yellow-400/70",
  }[voiceState]

  const glowStyle = {
    idle:      { boxShadow: "0 0 20px rgba(255,255,255,0.05)" },
    listening: { boxShadow: "0 0 45px rgba(248,113,113,0.40)" },
    thinking:  { boxShadow: "0 0 45px rgba(96,165,250,0.35)"  },
    speaking:  { boxShadow: "0 0 55px rgba(250,204,21,0.45)"  },
  }[voiceState]

  const statusText = {
    idle:      "Tap to speak",
    listening: "Listening…",
    thinking:  "Thinking…",
    speaking:  "Speaking…",
  }[voiceState]

  const statusColor = {
    idle:      "text-white/30",
    listening: "text-red-400",
    thinking:  "text-blue-400",
    speaking:  "text-yellow-400",
  }[voiceState]

  const barColor = voiceState === "listening" ? "#f87171"
                 : voiceState === "speaking"  ? "#facc15"
                 : "rgba(255,255,255,0.15)"

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-between pb-6 pt-5 px-4 overflow-hidden"
      style={{ background: "radial-gradient(ellipse at 50% 25%, #0d0d1a 0%, #000 68%)" }}
    >
      {/* ── Top bar ── */}
      <div className="w-full flex items-center justify-between shrink-0">
        <div className="bg-white/8 rounded-full px-3 py-1 text-xs text-white/50 font-mono tabular-nums">
          {fmt(elapsedSec)}
        </div>
        <button onClick={handleClose}
          className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/15 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* ── Avatar ── */}
      <div className="flex flex-col items-center gap-3 shrink-0">
        <div className="relative flex items-center justify-center">
          <div className={`absolute w-60 h-60 rounded-full ring-2 transition-all duration-700 ${ringColor} ${voiceState === "listening" ? "animate-pulse" : ""}`} />
          <div className={`absolute w-48 h-48 rounded-full ring-1 transition-all duration-500 ${ringColor} opacity-35`} />
          <div
            className={`w-44 h-44 rounded-full overflow-hidden ring-2 ring-white/15 shadow-2xl transition-transform duration-500 ${voiceState === "speaking" ? "scale-105" : "scale-100"}`}
            style={glowStyle}
          >
            <Image src="/sparkie-avatar.jpg" alt="Sparkie" width={176} height={176}
              className="w-full h-full object-cover object-top" priority />
          </div>
        </div>
        <div className="text-center">
          <p className="text-white font-semibold text-base tracking-wide">Sparkie</p>
          <p className={`text-sm mt-0.5 transition-colors duration-300 ${statusColor}`}>{statusText}</p>
        </div>
        {/* Waveform */}
        <div className="flex items-end gap-[2px] h-8">
          {bars.map((h, i) => (
            <div key={i} className="w-[3px] rounded-full transition-all duration-75"
              style={{ height: `${Math.min(h, 32)}px`, backgroundColor: barColor }} />
          ))}
        </div>
      </div>

      {/* ── Transcript scroll area ── */}
      <div className="w-full max-w-sm flex-1 flex flex-col gap-3 overflow-hidden py-2 min-h-0">
        {transcript && (
          <div className="flex flex-col gap-1">
            <p className="text-[11px] text-white/35 text-center">You</p>
            <div
              ref={transcriptRef}
              className="max-h-20 overflow-y-auto text-sm text-white/65 text-center leading-relaxed px-2 scrollbar-hide"
            >
              {transcript}
            </div>
          </div>
        )}

        {replyWords.length > 0 && voiceState !== "thinking" && (
          <div className="flex flex-col gap-1">
            <p className="text-[11px] text-yellow-400/50 text-center">Sparkie</p>
            <div
              ref={replyRef}
              className="max-h-32 overflow-y-auto text-center leading-relaxed px-2 scrollbar-hide"
            >
              <p className="text-sm inline">
                {replyWords.map((word, i) => (
                  <span
                    key={i}
                    className={`transition-colors duration-150 ${
                      i <= highlightIdx
                        ? "text-yellow-300 font-medium"
                        : i === highlightIdx + 1
                          ? "text-yellow-200/60"
                          : "text-white/25"
                    }`}
                  >
                    {word}{" "}
                  </span>
                ))}
              </p>
            </div>
          </div>
        )}

        {errorMsg && <p className="text-xs text-red-400 text-center">{errorMsg}</p>}
      </div>

      {/* ── Bottom controls ── */}
      <div className="w-full flex flex-col items-center gap-4 shrink-0">
        {/* Voice picker sheet */}
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

        {/* 3 buttons */}
        <div className="flex items-center gap-8">
          <button onClick={handleClose}
            className="w-13 h-13 w-[52px] h-[52px] rounded-full bg-red-500/15 border border-red-500/35 flex items-center justify-center text-red-400 hover:bg-red-500/30 transition-all active:scale-95">
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
            ) : voiceState === "speaking" ? (
              <X size={20} />
            ) : voiceState === "listening" ? (
              <MicOff size={20} />
            ) : (
              <Mic size={20} />
            )}
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

        {/* Hint text */}
        <p className="text-[10px] text-white/25">
          {SPARKIE_VOICES.find(v => v.id === selectedVoiceId)?.label ?? "Voice"} ·{" "}
          {voiceState === "idle"      ? "Auto-stops when you pause"
          : voiceState === "listening" ? "Tap mic to stop early"
          : voiceState === "speaking"  ? "Tap mic to interrupt"
          : "Processing…"}
        </p>
      </div>
    </div>
  )
}
