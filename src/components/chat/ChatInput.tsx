"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useAppStore } from "@/store/appStore"
import { parseAIResponse, getLanguageFromFilename, deriveProjectName } from "@/lib/fileParser"
import { Paperclip, ArrowUp, Sparkles, ChevronDown, Image as ImageIcon, Video, Mic, MicOff } from "lucide-react"

const MODELS = [
  { id: "glm-5-free", name: "GLM 5", tag: "Free", type: "chat" },
  { id: "minimax-m2.5-free", name: "MiniMax M2.5", tag: "Free", type: "chat" },
  { id: "minimax-m2.1-free", name: "MiniMax M2.1", tag: "Free", type: "chat" },
  { id: "kimi-k2.5-free", name: "Kimi K2.5", tag: "Free", type: "chat" },
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

const PROMPT_TEMPLATES = [
  { label: "Landing page", prompt: "Build a stunning landing page with hero section, features grid, and CTA. Dark theme, honey gold accents, plain CSS.", icon: "🌐" },
  { label: "REST API", prompt: "Build a full Express.js REST API with CRUD endpoints, input validation, and proper error handling. Include package.json.", icon: "⚡" },
  { label: "Dashboard", prompt: "Build an analytics dashboard with charts, stat cards, and a sidebar. Dark theme with honey gold data visualizations.", icon: "📊" },
  { label: "Todo app", prompt: "Build a beautiful todo app with add, complete, delete, and filter by status. Dark theme, smooth animations, plain CSS.", icon: "✅" },
  { label: "Auth UI", prompt: "Build a sign in / sign up UI with form validation, password strength meter, and animated transitions. Dark theme.", icon: "🔐" },
  { label: "Chat UI", prompt: "Build a chat interface with message bubbles, timestamps, typing indicator, and smooth animations. Dark theme.", icon: "💬" },
]

type GenMode = "chat" | "image" | "video"

export function ChatInput() {
  const [input, setInput] = useState("")
  const [showModels, setShowModels] = useState(false)
  const [genMode, setGenMode] = useState<GenMode>("chat")
  const [selectedImageModel, setSelectedImageModel] = useState("flux")
  const [selectedVideoModel, setSelectedVideoModel] = useState("seedance")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const agentAbortRef = useRef<AbortController | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const {
    selectedModel, setSelectedModel, createChat, addMessage,
    updateMessage, currentChatId, isStreaming, setStreaming,
    openIDE, setExecuting, setActiveFile, setIDETab, ideOpen,
    clearLiveCode, appendLiveCode, addLiveCodeFile,
    addWorklogEntry, updateWorklogEntry,
    setContainerStatus, setPreviewUrl, saveChatFiles, addAsset,
    setLastMode,
  } = useAppStore()

  // Upsert a file with a potentially nested path (e.g. "public/index.html")
  // into the Zustand files tree, creating intermediate folder nodes as needed.
  const upsertFile = useCallback((filePath: string, content: string, language?: string): string => {
    const parts = filePath.split('/').filter(Boolean)
    const store = useAppStore.getState()

    if (parts.length === 1) {
      // Flat file — only search non-archive top-level nodes
      const isArchivedNode = (f: import('@/store/appStore').FileNode) => f.type === 'archive'
      const fresh = useAppStore.getState()
      const existing = fresh.files.find(f => f.type === 'file' && f.name === parts[0] && !isArchivedNode(f))
      if (existing) {
        fresh.updateFileContent(existing.id, content)
        return existing.id
      }
      return fresh.addFile({ name: parts[0], type: 'file', content, language })
    }

    // Nested path — build/update tree (exclude archive folders from merge target)
    const isArchivedNode = (f: import('@/store/appStore').FileNode) => f.type === 'archive'
    const setFiles = store.setFiles
    const archiveNodes = store.files.filter(isArchivedNode)
    const currentFiles = store.files.filter(f => !isArchivedNode(f))

    function upsertInTree(nodes: import('@/store/appStore').FileNode[], pathParts: string[], fileContent: string, lang?: string): [import('@/store/appStore').FileNode[], string] {
      const [head, ...rest] = pathParts
      let resultId = ''

      if (rest.length === 0) {
        // Leaf — file node
        const existingIdx = nodes.findIndex(n => n.type === 'file' && n.name === head)
        if (existingIdx >= 0) {
          const updated = [...nodes]
          resultId = updated[existingIdx].id
          updated[existingIdx] = { ...updated[existingIdx], content: fileContent, language: lang }
          return [updated, resultId]
        }
        resultId = crypto.randomUUID()
        return [[...nodes, { id: resultId, name: head, type: 'file' as const, content: fileContent, language: lang }], resultId]
      }

      // Directory node
      const existingFolderIdx = nodes.findIndex(n => n.type === 'folder' && n.name === head)
      if (existingFolderIdx >= 0) {
        const folder = nodes[existingFolderIdx]
        const [updatedChildren, id] = upsertInTree(folder.children ?? [], rest, fileContent, lang)
        const updated = [...nodes]
        updated[existingFolderIdx] = { ...folder, children: updatedChildren }
        return [updated, id]
      }

      // New folder
      const [children, id] = upsertInTree([], rest, fileContent, lang)
      return [[...nodes, { id: crypto.randomUUID(), name: head, type: 'folder' as const, content: '', children }], id]
    }

    const [newTree, leafId] = upsertInTree(currentFiles, parts, content, language)
    setFiles([...archiveNodes, ...newTree])
    return leafId
  }, [])

  const streamChat = useCallback(async (chatId: string, userContent: string) => {
    const chat = useAppStore.getState().chats.find((c) => c.id === chatId)
    if (!chat) return
    const projectName = deriveProjectName(chat?.title || 'New Chat')

    const apiMessages = chat.messages
      .filter((m) => m.type !== "image" && m.type !== "video")
      .map((m) => ({ role: m.role, content: m.content }))

    // ── Inject current workspace context for fix/modify requests ──────────────
    // If there are active files, append them as a system context message so the
    // AI can do proper targeted edits rather than starting from scratch.
    const activeFilesForContext = useAppStore.getState().files.filter(f => f.type !== 'archive')
    if (activeFilesForContext.length > 0) {
      const fileContext = activeFilesForContext
        .filter(f => f.type === 'file' && f.content)
        .map(f => `---FILE: ${f.name}---\n${f.content}\n---END FILE---`)
        .join('\n\n')
      if (fileContext) {
        apiMessages.push({
          role: 'user' as const,
          content: `[CURRENT WORKSPACE — these are the files currently in the IDE. When asked to fix or modify, update these exact files and return them complete with ---FILE:--- markers]\n\n${fileContext}`,
        })
        apiMessages.push({
          role: 'assistant' as const,
          content: `Understood. I have the current workspace loaded. I'll make targeted fixes and return the complete updated file(s).`,
        })
      }
    }
    // ── End workspace context ──────────────────────────────────────────────────

    // ── Archive FIRST — before any state resets that could race with setFiles ──
    // Read files synchronously right now, before any async state changes.
    const currentFiles = useAppStore.getState().files
    const isArchived = (f: import('@/store/appStore').FileNode) => f.type === 'archive'
    const activeFiles = currentFiles.filter(f => !isArchived(f))
    const existingArchives = currentFiles.filter(isArchived)

    if (activeFiles.length > 0) {
      // Name the folder after the most recent substantial user coding task.
      // The NEW userContent (current submit) is NOT yet in the messages store,
      // so look backwards through messages for the last user message with >4 words
      // (skipping short conversational messages like "good job", "thanks", etc.)
      const allUserMsgs = (useAppStore.getState().chats.find(c => c.id === chatId)?.messages ?? []).filter(m => m.role === 'user')
      const prevCodingMsg = allUserMsgs.slice().reverse().find(m => m.content.trim().split(/\s+/).length > 4)
      const nameSource = prevCodingMsg?.content || activeFiles[0]?.name || 'project'
      const folderName = nameSource
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .trim()
        .split(/\s+/)
        .slice(0, 5)
        .join('-')
        .toLowerCase() || 'project'
      const timestamp = new Date()
        .toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
        .replace(':', '')
      const archiveName = `${folderName}-${timestamp}`

      const deepCloneWithNewIds = (node: import('@/store/appStore').FileNode): import('@/store/appStore').FileNode => ({
        ...node,
        id: crypto.randomUUID(),
        children: node.children?.map(deepCloneWithNewIds),
      })

      const archiveFolder: import('@/store/appStore').FileNode = {
        id: crypto.randomUUID(),
        name: archiveName,
        type: 'archive',
        content: '',
        children: activeFiles.map(f => deepCloneWithNewIds(f)),
      }

      // Single atomic setFiles call — archives preserved, active workspace cleared
      useAppStore.getState().setFiles([...existingArchives, archiveFolder])
    } else {
      useAppStore.getState().setFiles([])
    }
    // ── End archive ──────────────────────────────────────────────────────────

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

    // Open IDE to Current Process — will show LiveCodeView since isExecuting=true
    if (!ideOpen) openIDE()
    setIDETab("process")

    try {
      const userProfile = useAppStore.getState().userProfile
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, model: selectedModel, userProfile }),
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
        const partialParse = parseAIResponse(fullContent, projectName)
        for (const file of partialParse.files) {
          if (!createdFileNames.has(file.name)) {
            createdFileNames.add(file.name)

            // Clear old non-archive files on first file creation
            if (filesCreated === 0) {
              const isArchivedNode = (f: import('@/store/appStore').FileNode) => f.type === 'archive'
              const oldFiles = useAppStore.getState().files.filter(f => !isArchivedNode(f))
              oldFiles.forEach(f => useAppStore.getState().deleteFile(f.id))
            }

            const fileId = upsertFile(file.name, file.content, getLanguageFromFilename(file.name))

            if (filesCreated === 0) setActiveFile(fileId)
            filesCreated++

            // Show file badge in LiveCodeView header
            addLiveCodeFile(file.name)
          } else {
            // Update existing file content as it grows
            // Update with complete final content (handles folder-prefixed paths)
            upsertFile(file.name, file.content, getLanguageFromFilename(file.name))
          }
        }
      }

      // Final parse
      const finalParse = parseAIResponse(fullContent, projectName)
      for (const file of finalParse.files) {
        if (!createdFileNames.has(file.name)) {
          createdFileNames.add(file.name)
          if (filesCreated === 0) {
            const isArchivedNode = (f: import('@/store/appStore').FileNode) => f.type === 'archive'
            const oldFiles = useAppStore.getState().files.filter(f => !isArchivedNode(f))
            oldFiles.forEach(f => useAppStore.getState().deleteFile(f.id))
          }
          const fileId = upsertFile(file.name, file.content, getLanguageFromFilename(file.name))
          if (filesCreated === 0) setActiveFile(fileId)
          filesCreated++
          addLiveCodeFile(file.name)
        } else {
          // Update with complete final content (handles folder-prefixed paths)
          upsertFile(file.name, file.content, getLanguageFromFilename(file.name))
        }
      }

      // Update chat with description only
      if (filesCreated > 0) {
        const description = finalParse.text || `✨ Created ${filesCreated} file(s). Check the preview →`
        updateMessage(chatId, assistantMsgId, { content: description, isStreaming: false })
      } else {
        // AI responded with text only (no file blocks) — restore the most recent archive back
        // to the active workspace so the preview doesn't go blank
        const currentState = useAppStore.getState()
        const archives = currentState.files.filter(f => f.type === 'archive')
        if (archives.length > 0) {
          // Pop the most recent archive back out as active files
          const latest = archives[archives.length - 1]
          const olderArchives = archives.slice(0, -1)
          const restored = latest.children ?? []
          useAppStore.getState().setFiles([...olderArchives, ...restored])
        }
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
      // Persist current workspace back to this chat so switching chats restores it
      saveChatFiles(chatId, useAppStore.getState().files)
    }
  }, [selectedModel, addMessage, updateMessage, setStreaming, setExecuting, openIDE, setIDETab, ideOpen, upsertFile, setActiveFile, clearLiveCode, appendLiveCode, addLiveCodeFile, addWorklogEntry, updateWorklogEntry, setContainerStatus, setPreviewUrl, saveChatFiles])

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

  // Detect conversational/non-coding messages that shouldn't trigger the IDE
  // Fast synchronous pre-filter — catches obvious cases without a network call.
  // Returns true (chat), false (build), or null (ambiguous → let LLM decide).
  const quickClassify = useCallback((text: string): boolean | null => {
    const t = text.trim().toLowerCase()
    const words = t.split(/\s+/).filter(Boolean)

    // Explicit mode overrides
    if (/\b(cancel|stop building|just chat|forget it)\b/.test(t)) return true

    // Build/code intent — high-confidence signals
    const BUILD_KEYWORDS = /^(build|create|make|write|generate|implement|deploy|refactor|debug|fix|install)\b/
    const BUILD_PHRASE = /\b(build me|build a|create a|make a|make me|write a|write me|generate a|implement a|fix the|fix my|debug the|debug this|install the|deploy the|refactor the|refactor my|test the app|test it)\b/
    // Edit/modify commands — always build mode (user is modifying an existing project)
    // Catches: "change the X", "can we change", "can you change", "please change", "make it X", etc.
    const EDIT_PHRASE = /\b(edit|update|upgrade|change|switch|swap|replace|rename|remove|delete|adjust|alter|amend|convert|modify|revise|refactor|rewrite|redo|refine|restyle|recolor|resize|transform|overhaul|patch|correct|improve|fix|tweak|tune|undo|revert|rollback)\b|(?:(?:can you|can u|could you|would you|would you mind|how about)\s+(?:please\s+)?(?:edit|update|upgrade|change|switch|swap|replace|rename|remove|delete|adjust|alter|amend|convert|modify|revise|refactor|rewrite|redo|refine|restyle|recolor|resize|transform|overhaul|patch|correct|improve|fix|tweak|tune|undo|revert|rollback))|\b(make it|make the|make sure|set the|set it|turn it|turn the|flip it|flip the|let's make|let's update|let's change|let's switch|instead of|it should be|switch this|switch the|update to|change to|change it)\b|\b(cahnge|chnage|upadte|updaet|swich|swithc|fiix|tweek|edti|chnge|udpate)\b/
    if (BUILD_KEYWORDS.test(t) || BUILD_PHRASE.test(t) || EDIT_PHRASE.test(t)) return false

    // Code-paste + question → explanation request
    if ((text.includes('```') || text.includes('<code>')) && /\?/.test(t)) return true

    // Very short messages (≤3 words)
    if (words.length <= 3) return true

    // Greetings
    if (/^(hello|hi+|hey|yo|sup|howdy|good morning|good afternoon|good evening|what.?s up|how.?s it)/.test(t)) return true

    // Emoji-only or emoji-dominant
    if (/^[\p{Emoji}\s!?.]+$/u.test(t)) return true

    // Thanks, acknowledgements
    if (/^(thanks?|thank you|ty|thx|cheers|appreciate|got it|sounds good|makes sense|understood|noted|ok|okay|sure|perfect|copy that|roger|on it|let.?s go|yes|no|nope|yep|yup|nah|lol|haha|lmao|omg|wow|nice|cool|awesome|dope|sick|sweet)/.test(t)) return true

    // Ambiguous — escalate to LLM classifier
    return null
  }, [])

  // LLM-powered intent classifier — called only for ambiguous messages
  const classifyIntent = useCallback(async (text: string): Promise<'chat' | 'build'> => {
    const quick = quickClassify(text)
    if (quick !== null) return quick ? 'chat' : 'build'

    try {
      const res = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      if (!res.ok) return 'chat'
      const { mode } = await res.json()
      return mode === 'build' ? 'build' : 'chat'
    } catch {
      return 'chat' // Fail safe: default to chat
    }
  }, [quickClassify])

  // Keep isConversational as a thin sync wrapper (used in isContinue check path)
  const isConversational = useCallback((text: string): boolean => {
    const q = quickClassify(text)
    return q !== false
  }, [quickClassify])

  // Lightweight chat-only reply (no IDE, no file generation)
  const streamReply = useCallback(async (chatId: string, userContent: string) => {
    const chat = useAppStore.getState().chats.find((c) => c.id === chatId)
    if (!chat) return
    const apiMessages = chat.messages
      .filter((m) => m.type !== "image" && m.type !== "video")
      .map((m) => ({ role: m.role, content: m.content }))
    const assistantMsgId = addMessage(chatId, { role: "assistant", content: "", model: selectedModel, isStreaming: true })
    setStreaming(true)
    try {
      const userProfile = useAppStore.getState().userProfile
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, model: selectedModel, userProfile }),
      })
      if (!response.ok) {
        updateMessage(chatId, assistantMsgId, { content: "Something went wrong.", isStreaming: false })
        setStreaming(false); return
      }
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) { setStreaming(false); return }
      let buffer = "", fullContent = ""
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
              updateMessage(chatId, assistantMsgId, { content: fullContent })
            }
          } catch { /* skip */ }
        }
      }
      updateMessage(chatId, assistantMsgId, { content: fullContent || "👋", isStreaming: false })
    } catch {
      updateMessage(chatId, assistantMsgId, { content: "Connection error.", isStreaming: false })
    } finally {
      setStreaming(false)
    }
  }, [selectedModel, addMessage, updateMessage, setStreaming])

  // ── streamAgent: Planner → Builder → Reviewer with inline thinking ────────
  const streamAgent = useCallback(async (chatId: string, userContent: string, isEdit = false) => {
    // Detect edit intent — if user is modifying an existing project, skip archive
    const EDIT_INTENT_RE = /\b(edit|update|upgrade|change|switch|swap|replace|rename|remove|delete|adjust|alter|amend|convert|modify|revise|refactor|rewrite|redo|refine|restyle|recolor|resize|transform|overhaul|patch|correct|improve|fix|tweak|tune|undo|revert|rollback)\b|(?:(?:can you|can u|could you|would you|would you mind|how about)\s+(?:please\s+)?(?:edit|update|upgrade|change|switch|swap|replace|rename|remove|delete|adjust|alter|amend|convert|modify|revise|refactor|rewrite|redo|refine|restyle|recolor|resize|transform|overhaul|patch|correct|improve|fix|tweak|tune|undo|revert|rollback))|\b(make it|make the|make sure|set the|set it|turn it|turn the|flip it|flip the|let's make|let's update|let's change|let's switch|instead of|it should be|switch this|switch the|update to|change to|change it)\b|\b(cahnge|chnage|upadte|updaet|swich|swithc|fiix|tweek|edti|chnge|udpate)\b/i
    const currentFilesForCtx = useAppStore.getState().files.filter(f => f.type !== 'archive')
    const isEditRequest = (isEdit || EDIT_INTENT_RE.test(userContent)) && currentFilesForCtx.filter(f => f.type === 'file').length > 0

    if (!isEditRequest) {
      // New build — archive existing workspace
      const currentFiles_archive = useAppStore.getState().files
      const isArchv = (f: import('@/store/appStore').FileNode) => f.type === 'archive'
      const activeFiles_pre = currentFiles_archive.filter(f => !isArchv(f))
      const existingArchives_pre = currentFiles_archive.filter(isArchv)

      if (activeFiles_pre.length > 0) {
        const allUserMsgs = (useAppStore.getState().chats.find(c => c.id === chatId)?.messages ?? []).filter(m => m.role === 'user')
        const prevMsg = allUserMsgs.slice().reverse().find(m => m.content.trim().split(/\s+/).length > 4)
        const nameSource = prevMsg?.content || activeFiles_pre[0]?.name || 'project'
        const folderName = nameSource.replace(/[^a-zA-Z0-9 ]/g, '').trim().split(/\s+/).slice(0, 5).join('-').toLowerCase() || 'project'
        const now = new Date()
        const archiveName = `${folderName}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`
        const deepClone = (node: import('@/store/appStore').FileNode): import('@/store/appStore').FileNode => ({
          ...node, id: crypto.randomUUID(), children: node.children?.map(deepClone),
        })
        useAppStore.getState().setFiles([...existingArchives_pre, {
          id: crypto.randomUUID(), name: archiveName, type: 'archive', content: '',
          children: activeFiles_pre.map(deepClone),
        }])
      } else {
        useAppStore.getState().setFiles([])
      }
    }
    // For edit requests: keep files in place — agent will overwrite with updated versions

    // Build API messages with file context
    const chat = useAppStore.getState().chats.find(c => c.id === chatId)
    const projectName = deriveProjectName(chat?.title || 'New Chat')
    const apiMessages = (chat?.messages ?? [])
      .filter(m => m.type !== 'image' && m.type !== 'video')
      .map(m => ({ role: m.role, content: m.content }))
      .slice(0, -1) // exclude last message — it's the user msg just added; appended manually below

    // File context for fix requests
    const activeForCtx = currentFilesForCtx.filter(f => f.type === 'file' && f.content)
    const fileContext = activeForCtx.map(f => `---FILE: ${f.name}---\n${f.content}\n---END FILE---`).join('\n\n')
    const currentFilesPayload = fileContext || undefined

    // For edit requests: prepend a strong signal so model outputs ---FILE:--- markers
    // Models tend to respond conversationally to follow-up messages without this.
    const apiUserContent = isEditRequest && currentFilesPayload
      ? `[EDIT REQUEST — output the COMPLETE updated file(s) with ---FILE: filename--- markers. Do NOT respond conversationally. Regenerate the full file with changes applied.]\n\n${userContent}`
      : userContent

    // Pre-build acknowledgement — shown immediately so user isn't staring at silence
    const ACK_PHRASES = [
      `On it! Let me build that for you ✨`,
      `Got it! Building that now ⚡`,
      `On it — putting that together for you 🔥`,
      `Sure thing! Spinning that up now ✨`,
    ]
    const ackText = ACK_PHRASES[Math.floor(Math.random() * ACK_PHRASES.length)]

    // Add thinking message (will be updated live)
    const thinkingMsgId = addMessage(chatId, {
      role: 'assistant', content: ackText, model: 'Agent Loop', isStreaming: true, type: 'text'
    })

    // buildMsgId is created lazily on first builder delta (avoids double-bubble during planning)
    let buildMsgId = ''
    const ensureBuildMsg = (): string => {
      if (!buildMsgId) {
        buildMsgId = addMessage(chatId, {
          role: 'assistant', content: '', model: selectedModel, isStreaming: true, type: 'text'
        })
      }
      return buildMsgId
    }

    setStreaming(true)
    setExecuting(true)
    clearLiveCode()
    setContainerStatus('idle')
    setPreviewUrl(null)
    if (!ideOpen) openIDE()
    setIDETab('process')

    try {
      // Cancel any in-flight agent request before starting a new one
      agentAbortRef.current?.abort()
      agentAbortRef.current = new AbortController()
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...apiMessages, { role: 'user', content: apiUserContent }], currentFiles: currentFilesPayload, model: selectedModel, userProfile: useAppStore.getState().userProfile }),
        signal: agentAbortRef.current.signal,
      })

      if (!response.ok) {
        updateMessage(chatId, thinkingMsgId, { content: 'Agent error — try again', isStreaming: false })
        updateMessage(chatId, buildMsgId, { content: '', isStreaming: false })
        return
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) return

      let buffer = ''
      let fullBuild = ''
      let filesCreated = 0
      const createdFileNames = new Set<string>()
      let lastThinkingText = '⚡ Initializing agent...'

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            if (parsed.event === 'thinking') {
              lastThinkingText = parsed.text
              updateMessage(chatId, thinkingMsgId, { content: lastThinkingText, isStreaming: true })
            } else if (parsed.event === 'delta' && parsed.content) {
              fullBuild += parsed.content
              appendLiveCode(parsed.content)
              // Create build message bubble on first delta (lazy — avoids double-bubble during planning)
              ensureBuildMsg()
              // Parse files incrementally
              const partialParse = parseAIResponse(fullBuild, projectName)
              for (const file of partialParse.files) {
                if (!createdFileNames.has(file.name)) {
                  createdFileNames.add(file.name)
                  if (filesCreated === 0 && !isEdit) {
                    const oldActive = useAppStore.getState().files.filter(f => f.type !== 'archive')
                    oldActive.forEach(f => useAppStore.getState().deleteFile(f.id))
                  }
                  const fileId = upsertFile(file.name, file.content, getLanguageFromFilename(file.name))
                  if (filesCreated === 0) setActiveFile(fileId)
                  addLiveCodeFile(file.name)
                  // Track in assets
                  const chatTitle = useAppStore.getState().chats.find(c => c.id === chatId)?.title || 'New Chat'
                  addAsset({ name: file.name, language: getLanguageFromFilename(file.name), content: file.content, chatId, chatTitle, fileId })
                  filesCreated++
                } else {
                  // Update with complete final content (handles folder-prefixed paths)
                  upsertFile(file.name, file.content, getLanguageFromFilename(file.name))
                }
              }
            } else if (parsed.event === 'done') {
              // Final parse pass
              const finalParse = parseAIResponse(fullBuild, projectName)
              for (const file of finalParse.files) {
                if (!createdFileNames.has(file.name)) {
                  createdFileNames.add(file.name)
                  const fileId = upsertFile(file.name, file.content, getLanguageFromFilename(file.name))
                  if (filesCreated === 0) setActiveFile(fileId)
                  addLiveCodeFile(file.name)
                  const chatTitle = useAppStore.getState().chats.find(c => c.id === chatId)?.title || 'New Chat'
                  addAsset({ name: file.name, language: getLanguageFromFilename(file.name), content: file.content, chatId, chatTitle, fileId })
                  filesCreated++
                } else {
                  // Update with complete final content (handles folder-prefixed paths)
                  upsertFile(file.name, file.content, getLanguageFromFilename(file.name))
                }
              }
            } else if (parsed.event === 'error') {
              updateMessage(chatId, thinkingMsgId, { content: `❌ ${parsed.message}`, isStreaming: false })
              if (buildMsgId) updateMessage(chatId, buildMsgId, { content: '', isStreaming: false })
            }
          } catch { /* skip */ }
        }
      }

      // Finalize messages
      updateMessage(chatId, thinkingMsgId, { content: lastThinkingText, isStreaming: false })

      if (filesCreated > 0) {
        // Show clean description — NEVER raw code in the chat bubble
        const fileNames = Array.from(createdFileNames).join(', ')
        const description = `✨ Built ${fileNames} — preview ready →`
        if (buildMsgId) updateMessage(chatId, buildMsgId, { content: description, isStreaming: false })

        // Natural post-build wrap-up message (like competitors do)
        const WRAP_PHRASES = [
          `There you go! Check the preview on the right. Let me know if you want any changes 🙌`,
          `All done! Take a look at the preview — happy to tweak anything you'd like ✨`,
          `Built and ready! Let me know what you think or if you want to adjust anything 🔥`,
          `Done! Preview is live on the right. What should we change or add next?`,
          `There it is! Let me know how it looks and what you'd like to change 🐝`,
        ]
        const wrapText = WRAP_PHRASES[Math.floor(Math.random() * WRAP_PHRASES.length)]
        addMessage(chatId, { role: 'assistant', content: wrapText, model: selectedModel, isStreaming: false, type: 'text' })
      } else {
        // No files — restore archive and show text response
        const currentState = useAppStore.getState()
        const archives = currentState.files.filter(f => f.type === 'archive')
        if (archives.length > 0) {
          const latest = archives[archives.length - 1]
          useAppStore.getState().setFiles([...archives.slice(0, -1), ...( latest.children ?? [])])
        }
        // No files produced — show clean conversational response or helpful fallback
        if (fullBuild) {
          const finalParse = parseAIResponse(fullBuild, projectName)
          const textOnly = finalParse.text || ''
          const hasFileMarkers = fullBuild.includes('---FILE:')
          if (textOnly.length > 0 && !hasFileMarkers) {
            // Model responded conversationally (e.g. clarification, error) — show as chat
            updateMessage(chatId, thinkingMsgId, { content: textOnly.slice(0, 2000), isStreaming: false, model: selectedModel })
          } else if (hasFileMarkers) {
            // Had markers but parser found no files — genuine parse failure
            updateMessage(chatId, thinkingMsgId, { content: lastThinkingText, isStreaming: false })
            if (buildMsgId) updateMessage(chatId, buildMsgId, { content: '⚠️ Build output was malformed — try rephrasing your request or use a more specific description.', isStreaming: false })
            return
          } else {
            updateMessage(chatId, thinkingMsgId, { content: lastThinkingText, isStreaming: false })
          }
        } else {
          updateMessage(chatId, thinkingMsgId, { content: lastThinkingText, isStreaming: false })
        }
        // Hide build bubble entirely if no files
        if (buildMsgId) updateMessage(chatId, buildMsgId, { content: '', isStreaming: false })
      }

    } catch (err: unknown) {
      // Ignore abort errors (user navigated away or sent a new message)
      if (err instanceof Error && err.name === 'AbortError') return
      updateMessage(chatId, thinkingMsgId, { content: '❌ Connection error', isStreaming: false })
      if (buildMsgId) updateMessage(chatId, buildMsgId, { content: 'Try again.', isStreaming: false })
    } finally {
      setStreaming(false)
      setExecuting(false)
      saveChatFiles(chatId, useAppStore.getState().files)
    }
  }, [selectedModel, addMessage, updateMessage, setStreaming, setExecuting, openIDE, setIDETab, ideOpen, upsertFile, setActiveFile, clearLiveCode, appendLiveCode, addLiveCodeFile, addWorklogEntry, updateWorklogEntry, setContainerStatus, setPreviewUrl, saveChatFiles, addAsset])

  // ── Abort cleanup on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      agentAbortRef.current?.abort()
    }
  }, [])

  // ── Voice recording ───────────────────────────────────────────────────────
  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      // Stop recording
      mediaRecorderRef.current?.stop()
      setIsRecording(false)
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'
        const mr = new MediaRecorder(stream, { mimeType })
        audioChunksRef.current = []
        mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
        mr.onstop = async () => {
          stream.getTracks().forEach(t => t.stop())
          setIsTranscribing(true)
          try {
            const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
            const res = await fetch('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': mimeType },
              body: audioBlob,
            })
            if (res.ok) {
              const { transcript } = await res.json()
              if (transcript?.trim()) setInput(prev => prev ? prev + ' ' + transcript : transcript)
            }
          } catch { /* silent fail */ } finally {
            setIsTranscribing(false)
          }
        }
        mr.start()
        mediaRecorderRef.current = mr
        setIsRecording(true)
      } catch {
        alert('Microphone access denied. Please allow microphone access to use voice input.')
      }
    }
  }, [isRecording])

  const handleSubmit = useCallback(async () => {
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
      const t = userContent.toLowerCase().trim()
      const lastMode = useAppStore.getState().lastMode

      // "continue / keep going / next step" — respect what Sparkie was just doing
      const isContinue = /^(continue|keep going|next step|go on|proceed|carry on|keep it up|and then|what's next|next)\b/.test(t)
      if (isContinue && lastMode === 'build') {
        setLastMode('build')
        streamAgent(chatId, userContent)
        return
      }

      // If workspace has active files, check for edit intent first
      // (classifier might miss "change the yellow to green" as a build command)
      const activeFiles = useAppStore.getState().files.filter(f => f.type !== 'archive' && f.type === 'file')
      // Broad intent: catches "can we change X", "could you update", "please make the X", "it didnt update", etc.
      const EDIT_INTENT = /\b(edit|update|upgrade|change|switch|swap|replace|rename|remove|delete|adjust|alter|amend|convert|modify|revise|refactor|rewrite|redo|refine|restyle|recolor|resize|transform|overhaul|patch|correct|improve|fix|tweak|tune|undo|revert|rollback)\b|(?:(?:can you|can u|could you|would you|would you mind|how about)\s+(?:please\s+)?(?:edit|update|upgrade|change|switch|swap|replace|rename|remove|delete|adjust|alter|amend|convert|modify|revise|refactor|rewrite|redo|refine|restyle|recolor|resize|transform|overhaul|patch|correct|improve|fix|tweak|tune|undo|revert|rollback))|\b(make it|make the|make sure|set the|set it|turn it|turn the|flip it|flip the|let's make|let's update|let's change|let's switch|instead of|it should be|switch this|switch the|update to|change to|change it)\b|\b(cahnge|chnage|upadte|updaet|swich|swithc|fiix|tweek|edti|chnge|udpate)\b/i
      if (activeFiles.length > 0 && EDIT_INTENT.test(userContent)) {
        setLastMode('build')
        streamAgent(chatId, userContent, true)
        return
      }

      // Use LLM classifier for ambiguous messages; fast sync path for obvious ones
      const intent = await classifyIntent(userContent)
      if (intent === 'chat') {
        setLastMode('chat')
        streamReply(chatId, userContent)
      } else {
        setLastMode('build')
        streamAgent(chatId, userContent)
      }
    }
  }, [input, isStreaming, currentChatId, createChat, addMessage, genMode, streamAgent, generateMedia, classifyIntent, streamReply])

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

  const messages_count = useAppStore(s => s.messages).length
  const showTemplates = messages_count === 0 && input === "" && genMode === "chat"

  return (
    <div className="relative">
      {showTemplates && (
        <div className="mb-3 flex flex-wrap gap-2">
          {PROMPT_TEMPLATES.map(t => (
            <button
              key={t.label}
              onClick={() => setInput(t.prompt)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hive-700 border border-hive-border text-xs text-text-secondary hover:border-honey-500/50 hover:text-honey-400 transition-all"
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      )}
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
            onClick={toggleRecording}
            disabled={isTranscribing}
            className={`p-1.5 rounded-md transition-colors mr-1 ${
              isRecording
                ? 'bg-red-500/20 text-red-400 animate-pulse'
                : isTranscribing
                ? 'bg-honey-500/10 text-honey-500/50 cursor-wait'
                : 'hover:bg-hive-hover text-text-muted hover:text-text-secondary'
            }`}
            title={isRecording ? 'Stop recording' : isTranscribing ? 'Transcribing...' : 'Voice input'}
          >
            {isRecording ? <MicOff size={15} /> : <Mic size={15} />}
          </button>
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
