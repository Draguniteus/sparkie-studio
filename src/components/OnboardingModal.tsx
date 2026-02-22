"use client"

import { useState } from "react"
import { useAppStore, UserProfile } from "@/store/appStore"
import { Sparkles, ArrowRight, Check } from "lucide-react"

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
      "Student / learning",
    ],
  },
  {
    id: "goals",
    question: "What are you mainly building with Sparkie?",
    placeholder: "e.g. web apps, tools, games, prototypes...",
    type: "text",
  },
  {
    id: "experience",
    question: "How would you rate your coding experience?",
    type: "choice",
    options: ["Beginner", "Intermediate", "Expert"],
  },
  {
    id: "style",
    question: "How do you like your code?",
    type: "choice",
    options: [
      "Heavily commented — explain everything",
      "Clean & minimal — just the code",
      "Production-ready — with error handling",
    ],
  },
]

const STYLE_MAP: Record<string, string> = {
  "Heavily commented — explain everything": "commented",
  "Clean & minimal — just the code": "minimal",
  "Production-ready — with error handling": "production",
}

const EXP_MAP: Record<string, string> = {
  "Beginner": "beginner",
  "Intermediate": "intermediate",
  "Expert": "expert",
}

export function OnboardingModal() {
  const { setUserProfile, dismissOnboarding } = useAppStore()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [textVal, setTextVal] = useState("")

  const q = QUESTIONS[step]
  const isLast = step === QUESTIONS.length - 1
  const currentAnswer = answers[q.id] ?? ""

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
    if (!isLast) {
      setStep(s => s + 1)
    } else {
      finish(next)
    }
  }

  const finish = (finalAnswers: Record<string, string>) => {
    const profile: UserProfile = {
      name: finalAnswers.name || "there",
      role: finalAnswers.role || "developer",
      goals: finalAnswers.goals || "building projects",
      style: STYLE_MAP[finalAnswers.style] || "minimal",
      experience: EXP_MAP[finalAnswers.experience] || "intermediate",
      completedAt: new Date().toISOString(),
    }
    setUserProfile(profile)
  }

  // Auto-advance text step when user hits enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleTextNext()
    }
  }

  // If last choice question — finish on pick
  const handleLastChoice = (choice: string) => {
    const next = { ...answers, [q.id]: choice }
    setAnswers(next)
    setTimeout(() => finish(next), 300)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 bg-hive-800 border border-hive-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-8 pb-4">
          <div className="flex items-center gap-2 mb-6">
            <Sparkles size={18} className="text-honey-500" />
            <span className="text-xs text-honey-500 font-medium tracking-widest uppercase">Sparkie Studio</span>
          </div>
          <h2 className="text-xl font-semibold text-text-primary mb-1">
            Quick setup
          </h2>
          <p className="text-sm text-text-muted">
            5 questions to personalise your experience
          </p>
        </div>

        {/* Progress bar */}
        <div className="px-8 mb-6">
          <div className="h-1 bg-hive-600 rounded-full overflow-hidden">
            <div
              className="h-full bg-honey-500 rounded-full transition-all duration-500"
              style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-text-muted">Step {step + 1} of {QUESTIONS.length}</span>
          </div>
        </div>

        {/* Question */}
        <div className="px-8 pb-8 min-h-[200px]">
          <p className="text-base text-text-primary font-medium mb-5">{q.question}</p>

          {q.type === "text" && (
            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={textVal}
                onChange={e => setTextVal(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={q.placeholder}
                className="flex-1 px-4 py-2.5 bg-hive-700 border border-hive-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-honey-500 transition-colors"
              />
              <button
                onClick={handleTextNext}
                disabled={!textVal.trim()}
                className="px-4 py-2.5 bg-honey-500 text-black rounded-lg hover:bg-honey-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isLast ? <Check size={16} /> : <ArrowRight size={16} />}
              </button>
            </div>
          )}

          {q.type === "choice" && (
            <div className="flex flex-col gap-2">
              {q.options?.map(opt => (
                <button
                  key={opt}
                  onClick={() => isLast ? handleLastChoice(opt) : handleChoice(opt)}
                  className={`px-4 py-2.5 rounded-lg text-sm text-left border transition-all duration-150 ${
                    currentAnswer === opt
                      ? "bg-honey-500/20 border-honey-500 text-honey-400"
                      : "bg-hive-700 border-hive-border text-text-secondary hover:border-honey-500/50 hover:text-text-primary"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Skip */}
        <div className="px-8 pb-6 text-center">
          <button
            onClick={() => dismissOnboarding()}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}
