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

// Tracks which messages have finished animating
// Key: messageId → marked done = render plain settled text
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

  // Already animated — render settled plain text, no animation
  if (isDone) {
    return <>{text}</>
  }

  const startOffset = renderCharOffset
  // Use Array.from so multi-codepoint emoji (🎵, 📻, etc.) stay intact as one element
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

  // Case B: message was never streamed (slash commands, system messages, etc.)
  // isStreaming starts false and never transitions — mark done immediately
  // so it never re-animates on subsequent renders
  const neverStreamedRef = useRef(!isStreaming)
  if (neverStreamedRef.current && !markedDoneRef.current) {
    markedDoneRef.current = true
    const id = messageId
    // Short delay so first-render animation (if any) still plays out
    setTimeout(() => {
      animationDoneSet.add(id)
    }, (Array.from(content).length * 0.03 + 1.2) * 1000)
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
    // Code blocks — never animated
    code(props) {
      const { children, className } = props
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
