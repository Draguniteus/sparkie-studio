"use client"

import { useState, useRef, useCallback } from "react"
import { useAppStore } from "@/store/appStore"
import { parseAIResponse, getLanguageFromFilename } from "@/lib/fileParser"
import { Paperclip, ArrowUp, Sparkles, ChevronDown, Image as ImageIcon, Video } from "lucide-react"

const MODELS = [
  { id: "minimax-m2.5-free", name: "MiniMax M2.5", tag: "Free", type: "chat" },
  { id: "glm-5-free", name: "GLM 5", tag: "Free", type: "chat" },
  { id: "big-pickle", name: "Big Pickle", tag: "Free", type: "chat" },
]

const IMAGE_MODELS = [
  { id: "flux", name: "Flux", tag: "Free", desc: "Fast high-quality" },
  { id: "zimage", name: "Z-Image", tag: "Free", desc: "Turbo with 2x upscale" },
  { id: "klein", name: "Klein 4B", tag: "Free", desc: "FLUX.2 fast" },
  { id: "klein-large", name: "Klein 9B", tag: "Free", desc: "FLUX.2 high quality" },
  { id: "gptimage", name: "GPT Image", tag: "Free", desc: "OpenAI image gen" },
]

const VIDEO_MODELS = [
  { id: "seedance", name: "Seedance", tag: "Free", desc: "BytePlus text-to-video" },
]

type GenMode = "chat" | "image" | "video"

export function ChatInput() {
  const [input, setInput] = useState("")
  const [showModels, setShowModels] = useState(false)
  const [genMode, setGenMode] = useState<GenMode>("chat")
  const [selectedImageModel, setSelectedImageModel] = useState("flux")
  const [selectedVideoModel, setSelectedVideoModel] = useState("seedance")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const {
    selectedModel, setSelectedModel, createChat, addMessage,
    updateMessage, currentChatId, isStreaming, setStreaming,
    openIDE, setExecuting, addFile, setActiveFile, setIDETab, ideOpen,
    clearLiveCode, appendLiveCode, addLiveCodeFile,
    addWorklogEntry, updateWorklogEntry,
    setContainerStatus, setPreviewUrl, setFiles,
  } = useAppStore()

  const streamChat = useCallback(async (chatId: string, userContent: string) => {
    const chat = useAppStore.getState().chats.find((c) => c.id === chatId)
    if (!chat) return

    const apiMessages = chat.messages
      .filter((m) => m.type !== "image" && m.type !== "video")
      .map((m) => ({ role: m.role, content: m.content }))

    // Chat shows brief placeholder — code goes to LiveCodeView
    const assistantMsgId = addMessage(chatId, {
      role: "assistant", content: "⚡ Working on it...", model: selectedModel, isStreaming: true,
    })

    setStreaming(true)
    setExecuting(true)
    clearLiveCode()
    // Reset WebContainer state so the new task gets a fresh Preview
    setContainerStatus('idle')
    setPreviewUrl(null)
    setFiles([])

    // Open IDE to Current Process — will show LiveCodeView since isExecuting=true
    if (!ideOpen) openIDE()
    setIDETab("process")

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, model: selectedModel }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Unknown error" }))
        updateMessage(chatId, assistantMsgId, { content: `Error: ${err.error || response.statusText}`, isStreaming: false })
        setStreaming(false); setExecuting(false)
        return
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        updateMessage(chatId, assistantMsgId, { content: "Error: No response stream", isStreaming: false })
        setStreaming(false); setExecuting(false)
        return
      }

      let buffer = ""
      let fullContent = ""
      let filesCreated = 0
      const createdFileNames = new Set<string>()

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
            if (delta?.content) {
              fullContent += delta.content
              // Stream directly to LiveCodeView
              appendLiveCode(delta.content)
            }
          } catch { /* skip */ }
        }

        // Incrementally detect completed file blocks
        const partialParse = parseAIResponse(fullContent)
        for (const file of partialParse.files) {
          if (!createdFileNames.has(file.name)) {
            createdFileNames.add(file.name)

            // Clear old files on first file creation
            if (filesCreated === 0) {
              const oldFiles = useAppStore.getState().files
              oldFiles.forEach(f => useAppStore.getState().deleteFile(f.id))
            }

            const fileId = addFile({
              name: file.name,
              type: "file",
              content: file.content,
              language: getLanguageFromFilename(file.name),
            })

            if (filesCreated === 0) setActiveFile(fileId)
            filesCreated++

            // Show file badge in LiveCodeView header
            addLiveCodeFile(file.name)
          } else {
            // Update existing file content as it grows
            const existing = useAppStore.getState().files.find(f => f.name === file.name)
            if (existing && existing.content !== file.content) {
              useAppStore.getState().updateFileContent(existing.id, file.content)
            }
          }
        }
      }

      // Final parse
      const finalParse = parseAIResponse(fullContent)
      for (const file of finalParse.files) {
        if (!createdFileNames.has(file.name)) {
          createdFileNames.add(file.name)
          if (filesCreated === 0) {
            const oldFiles = useAppStore.getState().files
            oldFiles.forEach(f => useAppStore.getState().deleteFile(f.id))
          }
          const fileId = addFile({
            name: file.name, type: "file", content: file.content,
            language: getLanguageFromFilename(file.name),
          })
          if (filesCreated === 0) setActiveFile(fileId)
          filesCreated++
          addLiveCodeFile(file.name)
        } else {
          const existing = useAppStore.getState().files.find(f => f.name === file.name)
          if (existing && existing.content !== file.content) {
            useAppStore.getState().updateFileContent(existing.id, file.content)
          }
        }
      }

      // Update chat with description only
      if (filesCreated > 0) {
        const description = finalParse.text || `✨ Created ${filesCreated} file(s). Check the preview →`
        updateMessage(chatId, assistantMsgId, { content: description, isStreaming: false })
      } else {
        updateMessage(chatId, assistantMsgId, {
          content: fullContent || "The model used all tokens for reasoning. Try a simpler prompt.",
          isStreaming: false,
        })
      }
    } catch (error) {
      console.error("Stream error:", error)
      updateMessage(chatId, assistantMsgId, { content: "Connection error. Please try again.", isStreaming: false })
    } finally {
      // Stop executing — IDEPanel will swap from LiveCodeView to Preview
      setStreaming(false)
      setExecuting(false)
    }
  }, [selectedModel, addMessage, updateMessage, setStreaming, setExecuting, openIDE, setIDETab, ideOpen, addFile, setActiveFile, clearLiveCode, appendLiveCode, addLiveCodeFile, addWorklogEntry, updateWorklogEntry, setContainerStatus, setPreviewUrl, setFiles])

  const generateMedia = useCallback(async (chatId: string, prompt: string, mediaType: "image" | "video") => {
    const model = mediaType === "video" ? selectedVideoModel : selectedImageModel
    const emoji = mediaType === "video" ? "\ud83c\udfac" : "\ud83c\udfa8"

    const assistantMsgId = addMessage(chatId, {
      role: "assistant", content: `${emoji} Generating ${mediaType}...`, isStreaming: true, type: mediaType,
    })

    setStreaming(true)
    if (!ideOpen) openIDE()
    setIDETab("process")

    const logId = addWorklogEntry({ type: "action", content: `Generating ${mediaType} with ${model}: "${prompt.slice(0, 60)}..."`, status: "running" })
    const startTime = Date.now()

    try {
      const body: Record<string, unknown> = { prompt, model }
      if (mediaType === "video") body.duration = 4

      const response = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Unknown" }))
        updateMessage(chatId, assistantMsgId, {
          content: `${mediaType} generation failed: ${err.error || response.status}`,
          isStreaming: false, type: "text",
        })
        updateWorklogEntry(logId, { status: "error", duration: Date.now() - startTime })
        setStreaming(false)
        return
      }

      const data = await response.json()
      updateMessage(chatId, assistantMsgId, {
        content: prompt, imageUrl: data.url, imagePrompt: prompt, isStreaming: false, type: mediaType, model: model,
      })
      updateWorklogEntry(logId, { status: "done", duration: Date.now() - startTime })
    } catch (error) {
      console.error(`${mediaType} gen error:`, error)
      updateMessage(chatId, assistantMsgId, { content: `${mediaType} generation failed`, isStreaming: false, type: "text" })
      updateWorklogEntry(logId, { status: "error", duration: Date.now() - startTime })
    } finally {
      setStreaming(false)
    }
  }, [selectedImageModel, selectedVideoModel, addMessage, updateMessage, setStreaming, addWorklogEntry, updateWorklogEntry, openIDE, setIDETab, ideOpen])

  const handleSubmit = useCallback(() => {
    if (!input.trim() || isStreaming) return

    let chatId = currentChatId
    if (!chatId) chatId = createChat()

    const userContent = input.trim()
    addMessage(chatId, { role: "user", content: userContent })
    setInput("")

    if (textareaRef.current) textareaRef.current.style.height = "auto"

    if (genMode === "image") {
      generateMedia(chatId, userContent, "image")
    } else if (genMode === "video") {
      generateMedia(chatId, userContent, "video")
    } else {
      streamChat(chatId, userContent)
    }
  }, [input, isStreaming, currentChatId, createChat, addMessage, genMode, streamChat, generateMedia])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 200) + "px"
  }

  const activeModels = genMode === "image" ? IMAGE_MODELS : genMode === "video" ? VIDEO_MODELS : MODELS
  const activeModelId = genMode === "image" ? selectedImageModel : genMode === "video" ? selectedVideoModel : selectedModel
  const activeModelName = activeModels.find(m => m.id === activeModelId)?.name || activeModels[0].name

  const placeholders: Record<GenMode, string> = {
    chat: "Enter your task and submit to Sparkie...",
    image: "Describe the image you want to generate...",
    video: "Describe the video you want to generate...",
  }

  return (
    <div className="relative">
      <div className="rounded-2xl bg-hive-surface border border-hive-border focus-within:border-honey-500/40 transition-colors">
        <textarea
          ref={textareaRef} value={input} onChange={handleInput} onKeyDown={handleKeyDown}
          placeholder={placeholders[genMode]} rows={1}
          className="w-full px-4 pt-3 pb-2 bg-transparent text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none min-h-[44px] max-h-[200px]"
        />
        <div className="flex items-center justify-between px-3 pb-2">
          <div className="flex items-center gap-1">
            <button className="p-1.5 rounded-md hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors" title="Attach file">
              <Paperclip size={15} />
            </button>
            <button
              onClick={() => setGenMode(genMode === "image" ? "chat" : "image")}
              className={`p-1.5 rounded-md transition-colors ${genMode === "image" ? "bg-honey-500/15 text-honey-500" : "hover:bg-hive-hover text-text-muted hover:text-text-secondary"}`}
              title={genMode === "image" ? "Switch to chat" : "Image generation"}
            >
              <ImageIcon size={15} />
            </button>
            <button
              onClick={() => setGenMode(genMode === "video" ? "chat" : "video")}
              className={`p-1.5 rounded-md transition-colors ${genMode === "video" ? "bg-honey-500/15 text-honey-500" : "hover:bg-hive-hover text-text-muted hover:text-text-secondary"}`}
              title={genMode === "video" ? "Switch to chat" : "Video generation"}
            >
              <Video size={15} />
            </button>

            <div className="relative">
              <button
                onClick={() => setShowModels(!showModels)}
                className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors text-xs"
              >
                <Sparkles size={12} className="text-honey-500" />
                {activeModelName}
                <ChevronDown size={12} />
              </button>
              {showModels && (
                <div className="absolute bottom-full left-0 mb-1 w-72 bg-hive-elevated border border-hive-border rounded-lg shadow-xl py-1 z-50">
                  {activeModels.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => {
                        if (genMode === "image") setSelectedImageModel(model.id)
                        else if (genMode === "video") setSelectedVideoModel(model.id)
                        else setSelectedModel(model.id)
                        setShowModels(false)
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-hive-hover transition-colors flex items-center justify-between ${
                        activeModelId === model.id ? "text-honey-500" : "text-text-secondary"
                      }`}
                    >
                      <div>
                        <span>{model.name}</span>
                        {"desc" in model && (model as { desc?: string }).desc && (
                          <span className="text-[10px] text-text-muted ml-2">{(model as { desc: string }).desc}</span>
                        )}
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        model.tag === "Free" ? "bg-green-500/15 text-green-400" : "bg-honey-500/15 text-honey-500"
                      }`}>{model.tag}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={handleSubmit} disabled={!input.trim() || isStreaming}
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
