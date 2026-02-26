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

// Tracks which messages have finished animating (survived unmount/remount)
// Key: messageId, Value: true = animation done, render plain text
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
  renderCharOffset += text.length

  return (
    <>
      {text.split("").map((char, i) => (
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
  // Track when streaming ends so we can mark this message as done
  const wasStreamingRef = useRef(isStreaming)
  const markedDoneRef = useRef(false)

  // When streaming transitions false → true, mark this message done
  // so subsequent re-renders (from other messages arriving) render plain text
  if (wasStreamingRef.current && !isStreaming && !markedDoneRef.current) {
    markedDoneRef.current = true
    // Delay to let the final animation frame complete before locking
    const id = messageId
    setTimeout(() => {
      animationDoneSet.add(id)
    }, (content.length * 0.03 + 1.2) * 1000)
  }
  wasStreamingRef.current = isStreaming

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
