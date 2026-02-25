"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Mic, MicOff, X, Volume2, Loader2, Phone } from "lucide-react"

// MiniMax voice options — from platform.minimax.io/docs/faq/system-voice-id
const SPARKIE_VOICES = [
  // Girls
  { id: "English_radiant_girl",        label: "Radiant Girl",       cat: "Girl" },
  { id: "English_PlayfulGirl",         label: "Playful Girl",       cat: "Girl" },
  { id: "English_LovelyGirl",          label: "Lovely Girl",        cat: "Girl" },
  { id: "English_Kind-heartedGirl",    label: "Kind-Hearted Girl",  cat: "Girl" },
  { id: "English_WhimsicalGirl",       label: "Whimsical Girl",     cat: "Girl" },
  { id: "English_Soft-spokenGirl",     label: "Soft-Spoken Girl",   cat: "Girl" },
  { id: "English_Whispering_girl",     label: "Whispering Girl",    cat: "Girl" },
  { id: "English_UpsetGirl",           label: "Upset Girl",         cat: "Girl" },
  { id: "English_AnimeCharacter",      label: "Anime Girl",         cat: "Girl" },
  // Women
  { id: "English_CalmWoman",           label: "Calm Woman",         cat: "Woman" },
  { id: "English_Upbeat_Woman",        label: "Upbeat Woman",       cat: "Woman" },
  { id: "English_SereneWoman",         label: "Serene Woman",       cat: "Woman" },
  { id: "English_ConfidentWoman",      label: "Confident Woman",    cat: "Woman" },
  { id: "English_AssertiveQueen",      label: "Assertive Queen",    cat: "Woman" },
  { id: "English_ImposingManner",      label: "Imposing Queen",     cat: "Woman" },
  { id: "English_WiseladyWise",        label: "Wise Lady",          cat: "Woman" },
  { id: "English_Graceful_Lady",       label: "Graceful Lady",      cat: "Woman" },
  { id: "English_compelling_lady1",    label: "Compelling Lady",    cat: "Woman" },
  { id: "English_captivating_female1", label: "Captivating Female", cat: "Woman" },
  { id: "English_MaturePartner",       label: "Mature Partner",     cat: "Woman" },
  { id: "English_MatureBoss",          label: "Bossy Lady",         cat: "Woman" },
  { id: "English_SentimentalLady",     label: "Sentimental Lady",   cat: "Woman" },
  { id: "English_StressedLady",        label: "Stressed Lady",      cat: "Woman" },
  // Male
  { id: "English_expressive_narrator", label: "Expressive",         cat: "Male" },
  { id: "Deep_Voice_Man",              label: "Deep Voice",         cat: "Male" },
  { id: "Gentle_Man",                  label: "Gentle Man",         cat: "Male" },
  { id: "Friendly_Person",             label: "Friendly",           cat: "Male" },
  { id: "news_anchor_en",              label: "News Anchor",        cat: "Male" },
]

interface VoiceChatProps {
  onClose: () => void
  onSendMessage: (text: string) => Promise<string>
  voiceId?: string
  isActive: boolean
}

type VoiceState = "idle" | "listening" | "thinking" | "speaking"

// Silence detection threshold and duration
const SILENCE_THRESHOLD = 0.015  // RMS below this = silence
const SILENCE_DURATION  = 1400   // ms of silence before auto-stop

export function VoiceChat({ onClose, onSendMessage, voiceId = "English_CalmWoman", isActive }: VoiceChatProps) {
  const [state, setState] = useState<VoiceState>("idle")
  const [transcript, setTranscript] = useState("")
  const [spokenReply, setSpokenReply] = useState("")
  const [errorMsg, setErrorMsg] = useState("")
  const [selectedVoiceId, setSelectedVoiceId] = useState(voiceId)
  const [showVoicePicker, setShowVoicePicker] = useState(false)
  const [voiceCat, setVoiceCat] = useState<"Girl" | "Woman" | "Male">("Woman")
  const [bars, setBars] = useState<number[]>(Array(12).fill(3))

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      autoRestartRef.current = false
      stopRecording()
      audioPlayerRef.current?.pause()
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      audioCtxRef.current?.close()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopRecording = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
    analyserRef.current = null
  }, [])

  // Animate waveform bars using AnalyserNode data
  const animateBars = useCallback((analyser: AnalyserNode) => {
    const buf = new Float32Array(analyser.frequencyBinCount)
    const tick = () => {
      analyser.getFloatTimeDomainData(buf)
      // Compute per-band RMS across 12 frequency buckets
      const bandSize = Math.floor(buf.length / 12)
      const newBars = Array.from({ length: 12 }, (_, i) => {
        const slice = buf.slice(i * bandSize, (i + 1) * bandSize)
        const rms = Math.sqrt(slice.reduce((s, x) => s + x * x, 0) / bandSize)
        return Math.max(3, Math.round(rms * 300))
      })
      setBars(newBars)
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
  }, [])

  const processAudio = useCallback(async (mimeType: string) => {
    if (audioChunksRef.current.length === 0) { setState("idle"); return }
    isProcessingRef.current = true
    setState("thinking")
    setBars(Array(12).fill(3))

    try {
      // Step 1: Transcribe
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
      const transcribeRes = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": mimeType },
        body: audioBlob,
      })
      if (!transcribeRes.ok) throw new Error("Transcription failed")
      const { transcript: text } = await transcribeRes.json()

      if (!text?.trim()) { setState("idle"); isProcessingRef.current = false; return }
      setTranscript(text.trim())

      // Step 2: AI reply
      const aiReply = await onSendMessage(text.trim())
      if (!aiReply?.trim()) { setState("idle"); isProcessingRef.current = false; return }
      setSpokenReply(aiReply.trim())

      // Step 3: TTS — use speech-02-turbo for better quality + selectedVoiceId
      setState("speaking")
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
          // Animate speaking bars
          const speakBars = () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
            const tick = () => {
              setBars(Array.from({ length: 12 }, () => Math.max(3, Math.floor(Math.random() * 40 + 5))))
              animFrameRef.current = requestAnimationFrame(tick)
            }
            animFrameRef.current = requestAnimationFrame(tick)
          }
          speakBars()

          const audio = new Audio(url)
          audioPlayerRef.current = audio

          audio.onended = () => {
            if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
            setBars(Array(12).fill(3))
            isProcessingRef.current = false
            // Auto-restart listening for continuous conversation
            if (autoRestartRef.current) {
              setState("idle")
              // Small delay before auto-listening feels more natural
              setTimeout(() => {
                if (autoRestartRef.current && !isProcessingRef.current) startListening()
              }, 600)
            } else {
              setState("idle")
            }
          }
          audio.onerror = () => {
            if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
            setBars(Array(12).fill(3))
            setState("idle")
            isProcessingRef.current = false
          }
          await audio.play()
          return
        }
      }

      setState("idle")
      isProcessingRef.current = false
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Voice processing failed"
      setErrorMsg(msg)
      setState("idle")
      isProcessingRef.current = false
      setBars(Array(12).fill(3))
    }
  }, [onSendMessage, selectedVoiceId])

  const startListening = useCallback(async () => {
    if (isProcessingRef.current) return
    setErrorMsg("")
    setTranscript("")
    setSpokenReply("")

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Set up AudioContext for VAD + waveform
      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      const source  = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser
      animateBars(analyser)

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
        await processAudio(mimeType)
      }

      mr.start(100) // collect in 100ms chunks
      mediaRecorderRef.current = mr
      setState("listening")

      // Silence detection using AnalyserNode RMS
      const buf = new Float32Array(analyser.frequencyBinCount)
      const checkSilence = () => {
        if (!analyserRef.current || mediaRecorderRef.current?.state !== "recording") return
        analyser.getFloatTimeDomainData(buf)
        const rms = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length)
        if (rms < SILENCE_THRESHOLD) {
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              silenceTimerRef.current = null
              if (mediaRecorderRef.current?.state === "recording") {
                mediaRecorderRef.current.stop()
                mediaRecorderRef.current = null
              }
            }, SILENCE_DURATION)
          }
        } else {
          // Voice detected — reset silence timer
          if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
        }
        setTimeout(checkSilence, 100)
      }
      checkSilence()

    } catch {
      setErrorMsg("Microphone access denied.")
      setState("idle")
    }
  }, [animateBars, processAudio])

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop()
  }, [])

  const cancelSpeaking = useCallback(() => {
    autoRestartRef.current = false
    audioPlayerRef.current?.pause()
    audioPlayerRef.current = null
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
    setBars(Array(12).fill(3))
    setState("idle")
    isProcessingRef.current = false
    // Re-enable auto-restart after manual cancel
    setTimeout(() => { autoRestartRef.current = true }, 500)
  }, [])

  const handleMicClick = useCallback(() => {
    if (state === "idle") startListening()
    else if (state === "listening") stopListening()
    else if (state === "speaking") cancelSpeaking()
  }, [state, startListening, stopListening, cancelSpeaking])

  const handleClose = useCallback(() => {
    autoRestartRef.current = false
    cancelSpeaking()
    stopListening()
    onClose()
  }, [cancelSpeaking, stopListening, onClose])

  if (!isActive) return null

  const stateLabel = { idle: "Tap mic to speak", listening: "Listening...", thinking: "Thinking...", speaking: "Speaking..." }[state]

  const orbColor = {
    idle:      "border-honey-500/30 bg-honey-500/5",
    listening: "border-red-500/50 bg-red-500/10",
    thinking:  "border-blue-500/50 bg-blue-500/10",
    speaking:  "border-green-500/50 bg-green-500/10",
  }[state]

  const barColor = state === "listening" ? "bg-red-400" : state === "speaking" ? "bg-green-400" : "bg-honey-500/40"

  const cats = ["Girl", "Woman", "Male"] as const

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md">
      <div className="relative flex flex-col items-center gap-5 bg-hive-800 border border-hive-border rounded-2xl px-6 pt-6 pb-5 w-72 shadow-2xl">

        {/* Header */}
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-honey-500/20 flex items-center justify-center">
              <Phone size={13} className="text-honey-500" />
            </div>
            <span className="text-sm font-semibold text-honey-500">Sparkie Voice</span>
          </div>
          <button onClick={handleClose} className="w-6 h-6 rounded-md flex items-center justify-center text-text-muted hover:text-text-secondary hover:bg-hive-hover transition-colors">
            <X size={13} />
          </button>
        </div>

        {/* Waveform orb */}
        <div className={`w-28 h-28 rounded-full flex flex-col items-center justify-center border-2 transition-all duration-300 ${orbColor} ${state === "listening" ? "scale-105" : state === "speaking" ? "scale-108" : ""}`}>
          {state === "thinking" ? (
            <Loader2 size={28} className="animate-spin text-blue-400" />
          ) : (
            <div className="flex items-end gap-[3px] h-10">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className={`w-[3px] rounded-full transition-all duration-75 ${barColor}`}
                  style={{ height: `${Math.min(h, 40)}px` }}
                />
              ))}
            </div>
          )}
          {state === "speaking" && <Volume2 size={12} className="text-green-400 mt-1 opacity-70" />}
        </div>

        {/* State label */}
        <p className="text-xs text-text-secondary -mt-1">{stateLabel}</p>

        {/* Transcript / reply */}
        {transcript && (
          <div className="w-full bg-hive-700 rounded-lg px-3 py-2">
            <p className="text-[10px] text-text-muted mb-0.5">You said</p>
            <p className="text-xs text-text-primary leading-relaxed line-clamp-3">{transcript}</p>
          </div>
        )}
        {spokenReply && state !== "thinking" && (
          <div className="w-full bg-honey-500/5 border border-honey-500/15 rounded-lg px-3 py-2">
            <p className="text-[10px] text-text-muted mb-0.5">Sparkie</p>
            <p className="text-xs text-honey-500/80 leading-relaxed line-clamp-3">{spokenReply.slice(0, 200)}{spokenReply.length > 200 ? "…" : ""}</p>
          </div>
        )}
        {errorMsg && <p className="text-[11px] text-red-400 text-center">{errorMsg}</p>}

        {/* Mic button */}
        <button
          onClick={handleMicClick}
          disabled={state === "thinking"}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 border ${
            state === "thinking" ? "bg-hive-700 border-hive-border text-text-muted cursor-wait" :
            state === "listening" ? "bg-red-500/20 border-red-500/40 text-red-400 scale-110 animate-pulse cursor-pointer" :
            state === "speaking" ? "bg-green-500/20 border-green-500/40 text-green-400 cursor-pointer" :
            "bg-honey-500/15 border-honey-500/40 text-honey-500 hover:bg-honey-500/25 cursor-pointer"
          }`}
        >
          {state === "thinking" ? <Loader2 size={18} className="animate-spin" /> :
           state === "speaking" ? <X size={18} /> :
           state === "listening" ? <MicOff size={18} /> :
           <Mic size={18} />}
        </button>

        <p className="text-[10px] text-text-muted -mt-2">
          {state === "idle" ? "Auto-stops when you pause" :
           state === "listening" ? "Tap to stop early" :
           state === "speaking" ? "Tap to stop" : "Processing…"}
        </p>

        {/* Voice picker — category tabs + chip scroll */}
        <div className="w-full">
          {/* Category tabs */}
          <div className="flex gap-1 mb-1.5">
            {cats.map(cat => (
              <button
                key={cat}
                onClick={() => setVoiceCat(cat)}
                className={`flex-1 py-1 text-[10px] font-medium rounded-md transition-colors ${
                  voiceCat === cat ? "bg-honey-500/20 text-honey-500" : "bg-hive-700 text-text-muted hover:text-text-secondary"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          {/* Voice chips — horizontal scroll */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {SPARKIE_VOICES.filter(v => v.cat === voiceCat).map(v => (
              <button
                key={v.id}
                onClick={() => setSelectedVoiceId(v.id)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors whitespace-nowrap ${
                  selectedVoiceId === v.id
                    ? "bg-honey-500 text-black"
                    : "bg-hive-700 text-text-secondary hover:bg-hive-hover hover:text-text-primary border border-hive-border"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
