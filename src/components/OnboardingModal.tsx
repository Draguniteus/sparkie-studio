"use client"

import { useState } from "react"
import { useAppStore, UserProfile } from "@/store/appStore"
import { Sparkles, ArrowRight, Check, Plug, SkipForward } from "lucide-react"

const QUESTIONS = [
  {
    id: "name",
    question: "What should Sparkie call you?",
    placeholder: "Your name or handle",
    type: "text",
  },
  {
    id: "role",
    question: "What best describes you?",
    type: "choice",
    options: [
      "Indie developer",
      "Full-stack engineer",
      "Designer who codes",
      "Startup founder",
      "Creator / artist",
      "Student / learning",
    ],
  },
  {
    id: "goals",
    question: "What are you building or exploring?",
    placeholder: "e.g. web apps, music, content, ideas...",
    type: "text",
  },
  {
    id: "experience",
    question: "How would you rate your tech experience?",
    type: "choice",
    options: ["Just starting out", "Getting comfortable", "Pretty experienced", "Expert-level"],
  },
  {
    id: "connect",
    question: "Connect your world to Sparkie",
    type: "connect",
  },
]

const FEATURED_APPS = [
  { name: "Gmail", slug: "gmail", icon: "📧", description: "Read & send emails" },
  { name: "Twitter/X", slug: "twitter", icon: "🐦", description: "Post & search tweets" },
  { name: "GitHub", slug: "github", icon: "🐙", description: "Read repos & issues" },
  { name: "Google Calendar", slug: "google-calendar", icon: "📅", description: "Check your schedule" },
  { name: "Instagram", slug: "instagram", icon: "📸", description: "Post content" },
  { name: "Slack", slug: "slack", icon: "💬", description: "Send messages" },
]

const EXP_MAP: Record<string, string> = {
  "Just starting out": "beginner",
  "Getting comfortable": "intermediate",
  "Pretty experienced": "intermediate",
  "Expert-level": "expert",
}

export function OnboardingModal() {
  const { setUserProfile, dismissOnboarding } = useAppStore()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [textVal, setTextVal] = useState("")
  const [connecting, setConnecting] = useState<string | null>(null)
  const [connected, setConnected] = useState<string[]>([])

  const q = QUESTIONS[step]
  const isLast = step === QUESTIONS.length - 1

  const handleChoice = (choice: string) => {
    const next = { ...answers, [q.id]: choice }
    setAnswers(next)
    if (!isLast) {
      setTimeout(() => setStep(s => s + 1), 220)
    }
  }

  const handleTextNext = () => {
    if (!textVal.trim()) return
    const next = { ...answers, [q.id]: textVal.trim() }
    setAnswers(next)
    setTextVal("")
    setStep(s => s + 1)
  }

  const handleConnectApp = async (slug: string) => {
    setConnecting(slug)
    try {
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appName: slug }),
      })
      const data = await res.json()
      if (data.redirectUrl) {
        const popup = window.open(data.redirectUrl, "sparkie_connect", "width=600,height=700,scrollbars=yes")
        // Poll for popup close
        const poll = setInterval(() => {
          if (popup?.closed) {
            clearInterval(poll)
            setConnected(prev => [...prev, slug])
            setConnecting(null)
          }
        }, 500)
      }
    } catch {
      setConnecting(null)
    }
  }

  const finish = (finalAnswers: Record<string, string>) => {
    const profile: UserProfile = {
      name: finalAnswers.name || "there",
      role: finalAnswers.role || "creator",
      goals: finalAnswers.goals || "exploring",
      style: "minimal",
      experience: EXP_MAP[finalAnswers.experience] || "intermediate",
      completedAt: new Date().toISOString(),
    }
    setUserProfile(profile)

    // Persist to USER.md identity file — Sparkie reads this on every conversation
    const userMd = [
      `Name: ${profile.name}`,
      `Role: ${profile.role}`,
      `Building: ${profile.goals}`,
      `Experience: ${profile.experience}`,
      `Joined: ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}`,
    ].join("\n")
    fetch("/api/identity?type=user", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: userMd }),
    }).catch(() => {/* non-fatal */})
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleTextNext()
    }
  }

  const handleChoiceIsLast = step === QUESTIONS.length - 2 // role/experience questions

  // Finish connect step
  const handleFinish = () => {
    finish(answers)
  }

  const progressPct = ((step) / (QUESTIONS.length - 1)) * 100

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-hive-500 border border-hive-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-hive-600">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-honey-400 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <div className="text-xs text-hive-text-muted uppercase tracking-wider">
                {step + 1} of {QUESTIONS.length}
              </div>
              <div className="text-sm font-medium text-hive-text-secondary">Setting up your Studio</div>
            </div>
          </div>

          {/* Question */}
          <h2 className="text-xl font-semibold text-white mb-2">{q.question}</h2>

          {/* Text input */}
          {q.type === "text" && (
            <div className="mt-6">
              <input
                autoFocus
                type="text"
                value={textVal}
                onChange={e => setTextVal(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={q.placeholder}
                className="w-full bg-hive-600 border border-hive-border rounded-xl px-4 py-3 text-white placeholder-hive-text-muted outline-none focus:border-violet-500/60 transition-colors"
              />
              <button
                onClick={handleTextNext}
                disabled={!textVal.trim()}
                className="mt-3 w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Choice input */}
          {q.type === "choice" && (
            <div className="mt-6 flex flex-col gap-2">
              {q.options?.map(opt => (
                <button
                  key={opt}
                  onClick={() => handleChoice(opt)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all font-medium ${
                    answers[q.id] === opt
                      ? "bg-violet-600/30 border-violet-500 text-violet-200"
                      : "bg-hive-600 border-hive-border text-hive-text-secondary hover:border-violet-500/50 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {answers[q.id] === opt && <Check className="w-4 h-4 text-violet-400 shrink-0" />}
                    <span>{opt}</span>
                  </div>
                </button>
              ))}
              {answers[q.id] && !isLast && (
                <button
                  onClick={() => setStep(s => s + 1)}
                  className="mt-2 w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-medium py-3 rounded-xl transition-colors"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Connect apps step */}
          {q.type === "connect" && (
            <div className="mt-4">
              <p className="text-hive-text-muted text-sm mb-5">
                Connect your apps and Sparkie can act on your behalf — read emails, post to social,
                check your calendar. You can always connect more later in the Apps tab.
              </p>
              <div className="grid grid-cols-2 gap-2 mb-6">
                {FEATURED_APPS.map(app => {
                  const isConnected = connected.includes(app.slug)
                  const isConnecting = connecting === app.slug
                  return (
                    <button
                      key={app.slug}
                      onClick={() => !isConnected && handleConnectApp(app.slug)}
                      disabled={isConnecting}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                        isConnected
                          ? "bg-emerald-500/10 border-emerald-500/40 cursor-default"
                          : "bg-hive-600 border-hive-border hover:border-violet-500/50 cursor-pointer"
                      }`}
                    >
                      <span className="text-xl">{app.icon}</span>
                      <div className="min-w-0">
                        <div className={`text-sm font-medium truncate ${isConnected ? "text-emerald-300" : "text-white"}`}>
                          {isConnected ? "✓ " : ""}{app.name}
                        </div>
                        <div className="text-xs text-hive-text-muted truncate">{app.description}</div>
                      </div>
                      {isConnecting && (
                        <div className="w-3.5 h-3.5 border border-violet-400 border-t-transparent rounded-full animate-spin ml-auto shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleFinish}
                  className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-medium py-3 rounded-xl transition-colors"
                >
                  {connected.length > 0 ? (
                    <>Enter the Studio <Sparkles className="w-4 h-4" /></>
                  ) : (
                    <>Enter the Studio <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
                {connected.length === 0 && (
                  <button
                    onClick={handleFinish}
                    className="px-4 py-3 rounded-xl border border-hive-border text-hive-text-muted hover:text-white hover:border-hive-text-muted transition-colors text-sm"
                    title="Skip for now"
                  >
                    Skip
                  </button>
                )}
              </div>
              {connected.length > 0 && (
                <p className="text-center text-xs text-emerald-400 mt-3">
                  ✓ {connected.length} app{connected.length > 1 ? "s" : ""} connected
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
