"use client"

import { useRef } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Components } from "react-markdown"

interface Props {
  content: string
  isStreaming: boolean
  messageId: string
}

// Tracks which messages have finished animating (module-level, resets on page reload)
const animationDoneSet = new Set<string>()

// Per-render char offset — reset each render, incremented as spans are created
let renderCharOffset = 0

function AnimatedText({
  text,
  isDone,
}: {
  text: string
  isDone: boolean
}) {
  if (!text) return null

  // Already animated (or historical) — render settled plain text, no animation
  if (isDone) {
    return <>{text}</>
  }

  const startOffset = renderCharOffset
  const chars = Array.from(text)
  renderCharOffset += chars.length

  return (
    <>
      {chars.map((char, i) => (
        <span
          key={`${startOffset}-${i}`}
          className="char"
          style={{
            opacity: 0,
            animation: "colorShift 1s forwards",
            animationDelay: `${(startOffset + i) * 0.03}s`,
          }}
        >
          {char}
        </span>
      ))}
    </>
  )
}

// ── Media renderers ───────────────────────────────────────────────────────────

function SparkieImage({ src, alt }: { src: string; alt?: string }) {
  return (
    <div style={{ margin: "12px 0", borderRadius: "12px", overflow: "hidden", maxWidth: "480px" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? "Sparkie generated image"}
        style={{ width: "100%", display: "block", borderRadius: "12px" }}
        loading="lazy"
      />
    </div>
  )
}

function SparkieAudio({ src, label }: { src: string; label?: string }) {
  const parts = src.split("|")
  const audioUrl = parts[0].trim()
  const title = parts[1]?.trim() ?? label ?? "Sparkie track"

  return (
    <div
      style={{
        margin: "12px 0",
        padding: "12px 16px",
        background: "rgba(255, 195, 11, 0.08)",
        border: "1px solid rgba(255, 195, 11, 0.25)",
        borderRadius: "12px",
        maxWidth: "420px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
        <span style={{ fontSize: "18px" }}>🎵</span>
        <span style={{ color: "#FFC30B", fontWeight: 600, fontSize: "14px" }}>{title}</span>
      </div>
      <audio
        controls
        src={audioUrl}
        style={{ width: "100%", accentColor: "#FFC30B" }}
      />
    </div>
  )
}

function SparkieVideo({ src }: { src: string }) {
  return (
    <div style={{ margin: "12px 0", borderRadius: "12px", overflow: "hidden", maxWidth: "480px" }}>
      <video
        controls
        src={src.trim()}
        style={{ width: "100%", display: "block", borderRadius: "12px", background: "#000" }}
      />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function AnimatedMarkdown({ content, isStreaming, messageId }: Props) {
  const wasStreamingRef = useRef(isStreaming)
  const markedDoneRef = useRef(false)

  // Case A: was streaming, now done — mark after animation completes
  if (wasStreamingRef.current && !isStreaming && !markedDoneRef.current) {
    markedDoneRef.current = true
    const id = messageId
    const charCount = Array.from(content).length
    setTimeout(() => {
      animationDoneSet.add(id)
    }, (charCount * 0.03 + 1.2) * 1000)
  }
  wasStreamingRef.current = isStreaming

  // Case B: message was never streamed in this session (historical / loaded from DB)
  // Mark done IMMEDIATELY — no animation, render plain text right away
  const neverStreamedRef = useRef(!isStreaming)
  if (neverStreamedRef.current && !markedDoneRef.current) {
    markedDoneRef.current = true
    animationDoneSet.add(messageId)
  }

  const isDone = animationDoneSet.has(messageId)

  // Reset per-render offset at top of each render
  renderCharOffset = 0

  const makeComponents = (done: boolean): Components => ({
    p({ children }) {
      return <p><AnimatedNodes isDone={done}>{children}</AnimatedNodes></p>
    },
    h1({ children }) {
      return <h1><AnimatedNodes isDone={done}>{children}</AnimatedNodes></h1>
    },
    h2({ children }) {
      return <h2><AnimatedNodes isDone={done}>{children}</AnimatedNodes></h2>
    },
    h3({ children }) {
      return <h3><AnimatedNodes isDone={done}>{children}</AnimatedNodes></h3>
    },
    h4({ children }) {
      return <h4><AnimatedNodes isDone={done}>{children}</AnimatedNodes></h4>
    },
    strong({ children }) {
      return <strong><AnimatedNodes isDone={done}>{children}</AnimatedNodes></strong>
    },
    em({ children }) {
      return <em><AnimatedNodes isDone={done}>{children}</AnimatedNodes></em>
    },
    li({ children }) {
      return <li><AnimatedNodes isDone={done}>{children}</AnimatedNodes></li>
    },
    // Code blocks — intercept media fences, pass through real code
    code(props) {
      const { children, className } = props
      const lang = className?.replace("language-", "") ?? ""
      const raw = String(children).trim()

      if (lang === "image") {
        return <SparkieImage src={raw} />
      }
      if (lang === "audio") {
        return <SparkieAudio src={raw} />
      }
      if (lang === "video") {
        return <SparkieVideo src={raw} />
      }

      return <code className={className}>{children}</code>
    },
    pre({ children }) {
      return <pre>{children}</pre>
    },
  })

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={makeComponents(isDone)}>
      {content || " "}
    </ReactMarkdown>
  )
}

function AnimatedNodes({
  children,
  isDone,
}: {
  children: React.ReactNode
  isDone: boolean
}): React.ReactElement {
  return <>{flatMapChildren(children, isDone)}</>
}

function flatMapChildren(children: React.ReactNode, isDone: boolean): React.ReactNode[] {
  const result: React.ReactNode[] = []

  const walk = (node: React.ReactNode) => {
    if (typeof node === "string") {
      result.push(
        <AnimatedText key={`t-${result.length}`} text={node} isDone={isDone} />
      )
    } else if (Array.isArray(node)) {
      node.forEach(walk)
    } else {
      result.push(node)
    }
  }

  walk(children)
  return result
}
