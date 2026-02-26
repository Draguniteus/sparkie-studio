"use client"

import { useRef, useCallback } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Components } from "react-markdown"

interface Props {
  content: string
  isStreaming: boolean
  messageId: string
}

// Global char index counter per message – persists across re-renders via ref
// We use a module-level map so each message tracks its own offset
const charOffsetMap = new Map<string, number>()

function AnimatedText({
  text,
  messageId,
}: {
  text: string
  messageId: string
}) {
  if (!text) return null

  // Get current offset for this message, then advance it
  const offset = charOffsetMap.get(messageId) ?? 0
  charOffsetMap.set(messageId, offset + text.length)

  return (
    <>
      {text.split("").map((char, i) => (
        <span
          key={`${offset}-${i}`}
          className="char"
          style={{
            opacity: 0,
            animation: "colorShift 1s forwards",
            animationDelay: `${(offset + i) * 0.03}s`,
          }}
        >
          {char}
        </span>
      ))}
    </>
  )
}

export function AnimatedMarkdown({ content, isStreaming, messageId }: Props) {
  // Reset char offset at the start of each render for this message
  // so stagger always starts from the rendered chars
  charOffsetMap.delete(messageId)

  const components: Components = {
    // Paragraphs — animate text
    p({ children }) {
      return <p><AnimatedNodes messageId={messageId}>{children}</AnimatedNodes></p>
    },
    // Headers — animate text
    h1({ children }) {
      return <h1><AnimatedNodes messageId={messageId}>{children}</AnimatedNodes></h1>
    },
    h2({ children }) {
      return <h2><AnimatedNodes messageId={messageId}>{children}</AnimatedNodes></h2>
    },
    h3({ children }) {
      return <h3><AnimatedNodes messageId={messageId}>{children}</AnimatedNodes></h3>
    },
    h4({ children }) {
      return <h4><AnimatedNodes messageId={messageId}>{children}</AnimatedNodes></h4>
    },
    // Bold / italic — animate text
    strong({ children }) {
      return <strong><AnimatedNodes messageId={messageId}>{children}</AnimatedNodes></strong>
    },
    em({ children }) {
      return <em><AnimatedNodes messageId={messageId}>{children}</AnimatedNodes></em>
    },
    // List items — animate text
    li({ children }) {
      return <li><AnimatedNodes messageId={messageId}>{children}</AnimatedNodes></li>
    },
    // Code blocks — NO animation (pass through untouched)
    code(props) {
      const { children, className } = props
      const isBlock = className?.includes("language-")
      if (isBlock) {
        return <code className={className}>{children}</code>
      }
      return <code>{children}</code>
    },
    pre({ children }) {
      return <pre>{children}</pre>
    },
  }

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content || " "}
    </ReactMarkdown>
  )
}

// Recursively walk React children and animate string nodes
function AnimatedNodes({
  children,
  messageId,
}: {
  children: React.ReactNode
  messageId: string
}): React.ReactElement {
  return (
    <>
      {flatMapChildren(children, messageId)}
    </>
  )
}

function flatMapChildren(children: React.ReactNode, messageId: string): React.ReactNode[] {
  const result: React.ReactNode[] = []

  const walk = (node: React.ReactNode) => {
    if (typeof node === "string") {
      result.push(<AnimatedText key={`t-${result.length}`} text={node} messageId={messageId} />)
    } else if (Array.isArray(node)) {
      node.forEach(walk)
    } else {
      result.push(node)
    }
  }

  walk(children)
  return result
}
