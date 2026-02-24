"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Mic, MicOff, X, Volume2, Loader2, Phone } from "lucide-react"

interface VoiceChatProps {
  onClose: () => void
  onSendMessage: (text: string) => Promise<string>  // returns AI text reply
  voiceId?: string
  isActive: boolean
}

type VoiceState = "idle" | "listening" | "thinking" | "speaking"

export function VoiceChat({ onClose, onSendMessage, voiceId = "Wise_Woman", isActive }: VoiceChatProps) {
  const [state, setState] = useState<VoiceState>("idle")
  const [transcript, setTranscript] = useState("")
  const [spokenReply, setSpokenReply] = useState("")
  const [errorMsg, setErrorMsg] = useState("")
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const isProcessingRef = useRef(false)

  // Cleanup on unmount or close
  useEffect(() => {
    return () => {
      stopRecording()
      audioPlayerRef.current?.pause()
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
  }, [])

  const startListening = useCallback(async () => {
    if (isProcessingRef.current) return
    setErrorMsg("")
    setTranscript("")
    setSpokenReply("")

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4"

      const mr = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
        if (audioChunksRef.current.length === 0) {
          setState("idle")
          return
        }

        isProcessingRef.current = true
        setState("thinking")

        try {
          // Step 1: Transcribe audio → text via Deepgram
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
          const transcribeRes = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": mimeType },
            body: audioBlob,
          })

          if (!transcribeRes.ok) throw new Error("Transcription failed")
          const { transcript: text } = await transcribeRes.json()

          if (!text?.trim()) {
            setState("idle")
            isProcessingRef.current = false
            return
          }

          setTranscript(text.trim())

          // Step 2: Send to AI, get text reply
          const aiReply = await onSendMessage(text.trim())

          if (!aiReply?.trim()) {
            setState("idle")
            isProcessingRef.current = false
            return
          }

          setSpokenReply(aiReply.trim())

          // Step 3: TTS — convert AI reply to speech via MiniMax speech-01-turbo
          setState("speaking")
          const ttsRes = await fetch("/api/speech", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: aiReply.trim().slice(0, 2000), // cap for TTS
              model: "speech-01-turbo",
              voice_id: voiceId,
            }),
          })

          if (ttsRes.ok) {
            const { url } = await ttsRes.json()
            if (url) {
              const audio = new Audio(url)
              audioPlayerRef.current = audio
              audio.onended = () => {
                setState("idle")
                isProcessingRef.current = false
              }
              audio.onerror = () => {
                setState("idle")
                isProcessingRef.current = false
              }
              await audio.play()
              return
            }
          }

          // TTS failed silently — still show reply, go back to idle
          setState("idle")
          isProcessingRef.current = false
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Voice processing failed"
          setErrorMsg(msg)
          setState("idle")
          isProcessingRef.current = false
        }
      }

      mr.start()
      mediaRecorderRef.current = mr
      setState("listening")
    } catch {
      setErrorMsg("Microphone access denied. Please allow microphone access.")
      setState("idle")
    }
  }, [onSendMessage, voiceId])

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop()
    }
  }, [])

  const cancelSpeaking = useCallback(() => {
    audioPlayerRef.current?.pause()
    audioPlayerRef.current = null
    setState("idle")
    isProcessingRef.current = false
  }, [])

  const handleMicClick = useCallback(() => {
    if (state === "idle") {
      startListening()
    } else if (state === "listening") {
      stopListening()
    } else if (state === "speaking") {
      cancelSpeaking()
    }
  }, [state, startListening, stopListening, cancelSpeaking])

  if (!isActive) return null

  const stateLabel = {
    idle: "Tap mic to speak",
    listening: "Listening...",
    thinking: "Thinking...",
    speaking: "Speaking...",
  }[state]

  const micColors = {
    idle: "bg-honey-500/20 hover:bg-honey-500/30 text-honey-500 border border-honey-500/40",
    listening: "bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse",
    thinking: "bg-blue-500/20 text-blue-400 border border-blue-500/40",
    speaking: "bg-green-500/20 text-green-400 border border-green-500/40",
  }[state]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative flex flex-col items-center gap-6 bg-hive-800 border border-hive-border rounded-2xl p-8 w-80 shadow-2xl">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-text-secondary hover:bg-hive-hover transition-colors"
        >
          <X size={14} />
        </button>

        {/* Sparkie label */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-honey-500/20 flex items-center justify-center">
            <Phone size={15} className="text-honey-500" />
          </div>
          <span className="text-sm font-semibold text-honey-500">Sparkie Voice</span>
        </div>

        {/* Animated orb / status indicator */}
        <div className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
          state === "listening" ? "ring-4 ring-red-500/40 scale-110" :
          state === "thinking" ? "ring-4 ring-blue-500/40" :
          state === "speaking" ? "ring-4 ring-green-500/40 scale-105" :
          "ring-2 ring-honey-500/20"
        } ${micColors}`}>
          {state === "thinking" ? (
            <Loader2 size={32} className="animate-spin" />
          ) : state === "speaking" ? (
            <Volume2 size={32} />
          ) : state === "listening" ? (
            <MicOff size={32} onClick={stopListening} className="cursor-pointer" />
          ) : (
            <Mic size={32} />
          )}
        </div>

        {/* State label */}
        <p className="text-sm text-text-secondary">{stateLabel}</p>

        {/* Transcript */}
        {transcript && (
          <div className="w-full text-center">
            <p className="text-xs text-text-muted mb-1">You said:</p>
            <p className="text-sm text-text-primary bg-hive-700 rounded-lg px-3 py-2 max-h-20 overflow-y-auto">{transcript}</p>
          </div>
        )}

        {/* Reply preview */}
        {spokenReply && state !== "thinking" && (
          <div className="w-full text-center">
            <p className="text-xs text-text-muted mb-1">Sparkie replied:</p>
            <p className="text-sm text-honey-500/80 bg-honey-500/5 rounded-lg px-3 py-2 max-h-20 overflow-y-auto line-clamp-4">{spokenReply.slice(0, 200)}{spokenReply.length > 200 ? "..." : ""}</p>
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <p className="text-xs text-red-400 text-center">{errorMsg}</p>
        )}

        {/* Main action button */}
        <button
          onClick={handleMicClick}
          disabled={state === "thinking"}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 ${
            state === "thinking"
              ? "bg-hive-700 text-text-muted cursor-wait"
              : "cursor-pointer " + micColors
          }`}
        >
          {state === "thinking" ? (
            <Loader2 size={22} className="animate-spin" />
          ) : state === "speaking" ? (
            <X size={22} />
          ) : state === "listening" ? (
            <MicOff size={22} />
          ) : (
            <Mic size={22} />
          )}
        </button>

        <p className="text-xs text-text-muted">
          {state === "idle" ? "Tap to start talking" :
           state === "listening" ? "Tap again to send" :
           state === "speaking" ? "Tap to stop" : "Processing..."}
        </p>
      </div>
    </div>
  )
}
