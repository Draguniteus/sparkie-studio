"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Components } from "react-markdown"

interface Props {
  content: string
  isStreaming: boolean
  messageId: string
}

// ── Media renderers ──────────────────────────────────────────────────────────

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
        <span style={{ fontSize: "18px" }}>&#x1F3B5;</span>
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

// ── Static markdown components (no animation) ────────────────────────────────

const components: Components = {
  p({ children }) {
    return <p style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>{children}</p>
  },
  a({ children, href }) {
    return <a href={href} target="_blank" rel="noopener noreferrer" style={{ wordBreak: "break-all" }}>{children}</a>
  },
  code(props) {
    const { children, className } = props
    const lang = className?.replace("language-", "") ?? ""
    const raw = String(children).trim()

    if (lang === "image") return <SparkieImage src={raw} />
    if (lang === "audio") return <SparkieAudio src={raw} />
    if (lang === "video") return <SparkieVideo src={raw} />

    return <code className={className}>{children}</code>
  },
  pre({ children }) {
    return <pre>{children}</pre>
  },
}

// ── Main component ────────────────────────────────────────────────────────────

export function AnimatedMarkdown({ content, isStreaming, messageId: _ }: Props) {
  // During streaming: plain pre-wrap render — fast, no re-parsing
  if (isStreaming) {
    return (
      <p style={{ wordBreak: "break-word", overflowWrap: "anywhere", whiteSpace: "pre-wrap", margin: 0 }}>
        {content || " "}
      </p>
    )
  }

  // After streaming: full markdown render, static, no animation
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content || " "}
    </ReactMarkdown>
  )
}
