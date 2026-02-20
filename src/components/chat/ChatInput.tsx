"use client"

import { useState, useRef, useCallback } from "react"
import { useAppStore } from "@/store/appStore"
import { Paperclip, ArrowUp, Sparkles, ChevronDown, Image as ImageIcon } from "lucide-react"

const MODELS = [
  { id: "minimax-m2.5-free", name: "MiniMax M2.5", tag: "Free", type: "chat" },
  { id: "glm-5-free", name: "GLM 5", tag: "Free", type: "chat" },
  { id: "big-pickle", name: "Big Pickle", tag: "Free", type: "chat" },
]

const IMAGE_MODELS = [
  { id: "flux", name: "Flux", tag: "Free" },
  { id: "turbo", name: "Turbo", tag: "Free" },
]

export function ChatInput() {
  const [input, setInput] = useState("")
  const [showModels, setShowModels] = useState(false)
  const [isImageMode, setIsImageMode] = useState(false)
  const [selectedImageModel, setSelectedImageModel] = useState("flux")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { selectedModel, setSelectedModel, createChat, addMessage, appendToMessage, updateMessage, currentChatId, isStreaming, setStreaming } = useAppStore()

  const currentModel = MODELS.find((m) => m.id === selectedModel) || MODELS[0]

  const streamChat = useCallback(async (chatId: string, userContent: string) => {
    const chat = useAppStore.getState().chats.find((c) => c.id === chatId)
    if (!chat) return

    const apiMessages = chat.messages
      .filter((m) => m.type !== "image")
      .map((m) => ({ role: m.role, content: m.content }))

    const assistantMsgId = addMessage(chatId, {
      role: "assistant",
      content: "",
      model: selectedModel,
      isStreaming: true,
    })

    setStreaming(true)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          model: selectedModel,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Unknown error" }))
        updateMessage(chatId, assistantMsgId, {
          content: `⚠️ Error: ${err.error || response.statusText}`,
          isStreaming: false,
        })
        setStreaming(false)
        return
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        updateMessage(chatId, assistantMsgId, {
          content: "⚠️ Error: No response stream",
          isStreaming: false,
        })
        setStreaming(false)
        return
      }

      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith("data: ")) continue
          const data = trimmed.slice(6)
          if (data === "[DONE]") continue

          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta
            if (delta) {
              // Handle both regular content and reasoning content
              const text = delta.content || ""
              if (text) {
                appendToMessage(chatId, assistantMsgId, text)
              }
            }
          } catch {
            // Skip malformed JSON chunks
          }
        }
      }

      // If content is still empty after stream, check if model only produced reasoning
      const finalChat = useAppStore.getState().chats.find((c) => c.id === chatId)
      const finalMsg = finalChat?.messages.find((m) => m.id === assistantMsgId)
      if (finalMsg && !finalMsg.content.trim()) {
        updateMessage(chatId, assistantMsgId, {
          content: "🤔 The model used all tokens for reasoning. Try a simpler prompt or switch models.",
          isStreaming: false,
        })
      } else {
        updateMessage(chatId, assistantMsgId, { isStreaming: false })
      }
    } catch (error) {
      console.error("Stream error:", error)
      updateMessage(chatId, assistantMsgId, {
        content: "⚠️ Connection error. Please try again.",
        isStreaming: false,
      })
    } finally {
      setStreaming(false)
    }
  }, [selectedModel, addMessage, appendToMessage, updateMessage, setStreaming])

  const generateImage = useCallback(async (chatId: string, prompt: string) => {
    const assistantMsgId = addMessage(chatId, {
      role: "assistant",
      content: "🎨 Generating image...",
      isStreaming: true,
      type: "image",
    })

    setStreaming(true)

    try {
      const response = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model: selectedImageModel }),
      })

      if (!response.ok) {
        updateMessage(chatId, assistantMsgId, {
          content: "⚠️ Failed to generate image",
          isStreaming: false,
          type: "text",
        })
        setStreaming(false)
        return
      }

      const data = await response.json()
      updateMessage(chatId, assistantMsgId, {
        content: prompt,
        imageUrl: data.url,
        imagePrompt: prompt,
        isStreaming: false,
        type: "image",
      })
    } catch (error) {
      console.error("Image gen error:", error)
      updateMessage(chatId, assistantMsgId, {
        content: "⚠️ Image generation failed",
        isStreaming: false,
        type: "text",
      })
    } finally {
      setStreaming(false)
    }
  }, [selectedImageModel, addMessage, updateMessage, setStreaming])

  const handleSubmit = useCallback(() => {
    if (!input.trim() || isStreaming) return

    let chatId = currentChatId
    if (!chatId) {
      chatId = createChat()
    }

    const userContent = input.trim()
    addMessage(chatId, { role: "user", content: userContent })
    setInput("")

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }

    if (isImageMode) {
      generateImage(chatId, userContent)
    } else {
      streamChat(chatId, userContent)
    }
  }, [input, isStreaming, currentChatId, createChat, addMessage, isImageMode, streamChat, generateImage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 200) + "px"
  }

  return (
    <div className="relative">
      <div className="rounded-2xl bg-hive-surface border border-hive-border focus-within:border-honey-500/40 transition-colors">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={isImageMode ? "Describe the image you want to generate..." : "Enter your task and submit it to Sparkie..."}
          rows={1}
          className="w-full px-4 pt-3 pb-2 bg-transparent text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none min-h-[44px] max-h-[200px]"
        />

        <div className="flex items-center justify-between px-3 pb-2">
          <div className="flex items-center gap-1">
            <button className="p-1.5 rounded-md hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors" title="Attach file">
              <Paperclip size={15} />
            </button>

            <button
              onClick={() => setIsImageMode(!isImageMode)}
              className={`p-1.5 rounded-md transition-colors ${
                isImageMode
                  ? "bg-honey-500/15 text-honey-500"
                  : "hover:bg-hive-hover text-text-muted hover:text-text-secondary"
              }`}
              title={isImageMode ? "Switch to chat" : "Switch to image generation"}
            >
              <ImageIcon size={15} />
            </button>

            <div className="relative">
              <button
                onClick={() => setShowModels(!showModels)}
                className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors text-xs"
              >
                <Sparkles size={12} className="text-honey-500" />
                {isImageMode ? IMAGE_MODELS.find(m => m.id === selectedImageModel)?.name || "Flux" : currentModel.name}
                <ChevronDown size={12} />
              </button>
              {showModels && (
                <div className="absolute bottom-full left-0 mb-1 w-64 bg-hive-elevated border border-hive-border rounded-lg shadow-xl py-1 z-50">
                  {isImageMode ? (
                    IMAGE_MODELS.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => { setSelectedImageModel(model.id); setShowModels(false) }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-hive-hover transition-colors flex items-center justify-between ${
                          selectedImageModel === model.id ? "text-honey-500" : "text-text-secondary"
                        }`}
                      >
                        <span>{model.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400">{model.tag}</span>
                      </button>
                    ))
                  ) : (
                    MODELS.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => { setSelectedModel(model.id); setShowModels(false) }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-hive-hover transition-colors flex items-center justify-between ${
                          selectedModel === model.id ? "text-honey-500" : "text-text-secondary"
                        }`}
                      >
                        <span>{model.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          model.tag === "Free"
                            ? "bg-green-500/15 text-green-400"
                            : "bg-honey-500/15 text-honey-500"
                        }`}>{model.tag}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isStreaming}
            className={`p-2 rounded-lg transition-all ${
              input.trim()
                ? "bg-honey-500 text-hive-900 hover:bg-honey-400 shadow-lg shadow-honey-500/20"
                : "bg-hive-hover text-text-muted cursor-not-allowed"
            }`}
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
