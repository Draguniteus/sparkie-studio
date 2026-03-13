"use client"

import { useState, memo, useRef, useCallback, useEffect } from "react"
import { useAppStore, StepTrace } from "@/store/appStore"
import { useShallow } from "zustand/react/shallow"

// ── Step trace + worklog card types ──────────────────────────────────────
interface WorklogCard { tool: string; summary: string; ts: string }

// STEP_ICON_MAP moved to ChatView
// WORKLOG_TOOL_LABEL moved to ChatView
import { parseAIResponse, getLanguageFromFilename, deriveProjectName } from "@/lib/fileParser"
import { Paperclip, ArrowUp, Sparkles, ChevronDown, Image as ImageIcon, Video, Music, Mic, MicOff, FileText, Headphones, Phone, Film, X, Square } from "lucide-react"
import { VoiceChat } from "@/components/chat/VoiceChat"

// ── Asset type detection helper (for AssetsTab categories) ─────────────────
function detectAssetTypeFromName(name: string): import('@/store/appStore').AssetType {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['html', 'htm'].includes(ext)) return 'website'
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico', 'bmp'].includes(ext)) return 'image'
  if (['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'].includes(ext)) return 'audio'
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'video'
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'excel'
  if (['pptx', 'ppt'].includes(ext)) return 'ppt'
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return 'document'
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'css', 'json'].includes(ext)) return 'website'
  return 'other'
}


// ─── Slash commands registry ─────────────────────────────────────────────────
const SLASH_COMMANDS = [
  { cmd: '/startradio', desc: 'Start Sparkie Radio' },
  { cmd: '/stopradio',  desc: 'Stop the radio' },
  { cmd: '/weather',    desc: 'Get your local weather forecast' },
  { cmd: '/journal',    desc: 'Search or discuss your Dream Journal entries' },
  { cmd: '/dream',      desc: 'Add a dream or entry to your Dream Journal' },
] as const

// Chat model routing is handled server-side — Sparkie auto-selects the best model.
// Users see "Sparkie" as the model name; the actual tier (fast/capable/deep) is invisible.
const MODELS = [
  { id: "auto", name: "Sparkie", tag: "AI", type: "chat" },
]

const IMAGE_MODELS = [
  { id: "imagen-4", name: "Imagen 4", tag: "Free", desc: "Google Imagen 4 via Pollinations" },
  { id: "grok-imagine", name: "Grok Imagine", tag: "Free", desc: "xAI Grok image model" },
  { id: "flux", name: "Flux Schnell", tag: "Free", desc: "Fast high-quality — 5K imgs/day" },
  { id: "zimage", name: "Z-Image", tag: "Free", desc: "Turbo with 2x upscale" },
  { id: "klein", name: "Klein 4B", tag: "Free", desc: "FLUX.2 Klein 4B" },
  { id: "klein-large", name: "Klein 9B", tag: "Free", desc: "FLUX.2 Klein 9B — high quality" },
  { id: "gptimage", name: "GPT Image", tag: "Free", desc: "GPT Image 1 Mini" },
]

const VIDEO_MODELS = [
  { id: "seedance", name: "Seedance", tag: "Free", desc: "Pollinations video — 2-10s" },
  { id: "grok-video", name: "Grok Video", tag: "Free", desc: "xAI Grok video via Pollinations" },
  { id: "MiniMax-Hailuo-2.3", name: "Hailuo 2.3", tag: "Paid", desc: "$0.28 / 768P 6s — best quality" },
  { id: "MiniMax-Hailuo-02", name: "Hailuo 02", tag: "Paid", desc: "$0.10 / 512P 6s — balanced" },
  { id: "T2V-01-Director", name: "T2V Director", tag: "Paid", desc: "Camera control commands" },
  { id: "T2V-01", name: "T2V-01", tag: "Paid", desc: "Standard text-to-video" },
]

const MUSIC_MODELS = [
  { id: "music-2.5+", name: "Music-2.5+", tag: "Paid", desc: "$0.15 / 5 min — ultra quality" },
  { id: "music-2.5", name: "Music-2.5", tag: "Paid", desc: "$0.15 / 5 min — high quality" },
  { id: "music-2.0", name: "Music-2.0", tag: "Paid", desc: "$0.03 / 5 min — fast" },
  { id: "ace-step-free", name: "ACE-Step 1.5", tag: "Free", desc: "Unlimited free music — no credits" },
]

const LYRICS_MODELS = [
  { id: "music-01", name: "Lyrics-2.5", tag: "Paid", desc: "AI lyrics generation" },
]

// Speech model picker (quality/cost tier)
const SPEECH_MODELS = [
  { id: "speech-02-turbo", name: "Speech Turbo", tag: "Paid", desc: "$60 / M chars — fastest" },
  { id: "speech-02-hd", name: "Speech HD", tag: "Paid", desc: "$100 / M chars — highest quality" },
  { id: "whisper", name: "Whisper Large V3", tag: "Free", desc: "Pollinations audio transcription" },
]

// Voice options for speech generation — all English voices from platform.minimax.io/docs/faq/system-voice-id
const SPEECH_VOICES = [
  // Girls
  { id: "English_radiant_girl",        name: "Radiant Girl",        tag: "Girl",  desc: "Bright, cheerful energy" },
  { id: "English_PlayfulGirl",         name: "Playful Girl",        tag: "Girl",  desc: "Fun, lively" },
  { id: "English_LovelyGirl",          name: "Lovely Girl",         tag: "Girl",  desc: "Sweet, likeable" },
  { id: "English_Kind-heartedGirl",    name: "Kind-Hearted Girl",   tag: "Girl",  desc: "Warm, caring" },
  { id: "English_WhimsicalGirl",       name: "Whimsical Girl",      tag: "Girl",  desc: "Dreamy, imaginative" },
  { id: "English_Soft-spokenGirl",     name: "Soft-Spoken Girl",    tag: "Girl",  desc: "Gentle, quiet" },
  { id: "English_Whispering_girl",     name: "Whispering Girl",     tag: "Girl",  desc: "Soft, intimate" },
  { id: "English_UpsetGirl",           name: "Upset Girl",          tag: "Girl",  desc: "Emotional, expressive" },
  { id: "English_AnimeCharacter",      name: "Anime Girl",          tag: "Girl",  desc: "Animated female narrator" },
  // Women
  { id: "English_CalmWoman",           name: "Calm Woman",          tag: "Woman", desc: "Soothing, measured" },
  { id: "English_Upbeat_Woman",        name: "Upbeat Woman",        tag: "Woman", desc: "Positive, energetic" },
  { id: "English_SereneWoman",         name: "Serene Woman",        tag: "Woman", desc: "Peaceful, composed" },
  { id: "English_ConfidentWoman",      name: "Confident Woman",     tag: "Woman", desc: "Bold, clear" },
  { id: "English_AssertiveQueen",      name: "Assertive Queen",     tag: "Woman", desc: "Powerful, decisive" },
  { id: "English_ImposingManner",      name: "Imposing Queen",      tag: "Woman", desc: "Commanding, regal" },
  { id: "English_WiseladyWise",        name: "Wise Lady",           tag: "Woman", desc: "Thoughtful, assured" },
  { id: "English_Graceful_Lady",       name: "Graceful Lady",       tag: "Woman", desc: "Elegant, poised" },
  { id: "English_compelling_lady1",    name: "Compelling Lady",     tag: "Woman", desc: "Persuasive, strong" },
  { id: "English_captivating_female1", name: "Captivating Female",  tag: "Woman", desc: "Alluring, engaging" },
  { id: "English_MaturePartner",       name: "Mature Partner",      tag: "Woman", desc: "Warm, experienced" },
  { id: "English_MatureBoss",          name: "Bossy Lady",          tag: "Woman", desc: "Authoritative, direct" },
  { id: "English_SentimentalLady",     name: "Sentimental Lady",    tag: "Woman", desc: "Emotional depth" },
  { id: "English_StressedLady",        name: "Stressed Lady",       tag: "Woman", desc: "Tense, urgent tone" },
]


const PROMPT_TEMPLATES = [
  { label: "Landing page", prompt: "Build a stunning landing page with hero section, features grid, and CTA. Dark theme, honey gold accents, plain CSS.", icon: "🌐" },
  { label: "REST API", prompt: "Build a full Express.js REST API with CRUD endpoints, input validation, and proper error handling. Include package.json.", icon: "⚡" },
  { label: "Dashboard", prompt: "Build an analytics dashboard with charts, stat cards, and a sidebar. Dark theme with honey gold data visualizations.", icon: "📊" },
  { label: "Todo app", prompt: "Build a beautiful todo app with add, complete, delete, and filter by status. Dark theme, smooth animations, plain CSS.", icon: "✅" },
  { label: "Auth UI", prompt: "Build a sign in / sign up UI with form validation, password strength meter, and animated transitions. Dark theme.", icon: "🔐" },
  { label: "Chat UI", prompt: "Build a chat interface with message bubbles, timestamps, typing indicator, and smooth animations. Dark theme.", icon: "💬" },
]

type GenMode = "chat" | "image" | "video" | "music" | "lyrics" | "speech"

export function ChatInput() {
  // ── Persist a message to DB (fire-and-forget, never blocks UI) ──────────
  const saveMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    if (!content?.trim()) return
    fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, content }),
    }).catch(() => { /* silent — history is best-effort */ })
  }, [])  // stable — no deps, fetch is global
  // ─────────────────────────────────────────────────────────────────────────

  const [input, setInput] = useState("")
  const [showModels, setShowModels] = useState(false)
  const [hiveStatus, setHiveStatus] = useState<string | null>(null)
  const [_stepTraces, _setStepTraces] = useState<StepTrace[]>([])
  const _stepTracesRef = useRef<StepTrace[]>([])  // Ref mirror — avoids stale closure in async callback
  const [_inlineFeedCards, _setInlineFeedCards] = useState<WorklogCard[]>([])
  const [genMode, setGenMode] = useState<GenMode>("chat")
  const [slashSuggestions, setSlashSuggestions] = useState<Array<{ cmd: string; desc: string }>>([])
  const [selectedImageModel, setSelectedImageModel] = useState("flux")
  const [selectedVideoModel, setSelectedVideoModel] = useState("MiniMax-Hailuo-2.3")
  const [videoFrameImage, setVideoFrameImage] = useState<string | null>(null)  // I2V: base64 data URL
  const [selectedMusicModel, setSelectedMusicModel] = useState("music-2.5")
  const [selectedLyricsModel, setSelectedLyricsModel] = useState("music-2.5")
  const [selectedSpeechModel, setSelectedSpeechModel] = useState("speech-02-turbo")
  const [selectedVoiceId, setSelectedVoiceId] = useState("English_CalmWoman")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const videoFileRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachedFile, setAttachedFile] = useState<{ name: string; dataUrl: string; mimeType: string } | null>(null)
  const agentAbortRef = useRef<AbortController | null>(null)
  const chatAbortRef = useRef<AbortController | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const streamFlushRef = useRef<number>(0)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isVoiceChatOpen, setIsVoiceChatOpen] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const {
    selectedModel, setSelectedModel, createChat, getOrCreateSingleChat, addMessage,
    updateMessage, currentChatId, isStreaming, setStreaming,
    openIDE, setExecuting, setActiveFile, setIDETab, ideOpen,
    clearLiveCode, appendLiveCode, addLiveCodeFile,
    addWorklogEntry, updateWorklogEntry, clearWorklog,
    setContainerStatus, setPreviewUrl, setPendingRunCommand, saveChatFiles, addAsset, updateAsset,
    setLastMode,
  } = useAppStore(
    useShallow((s) => ({
      selectedModel: s.selectedModel,
      setSelectedModel: s.setSelectedModel,
      createChat: s.createChat,
      getOrCreateSingleChat: s.getOrCreateSingleChat,
      addMessage: s.addMessage,
      updateMessage: s.updateMessage,
      currentChatId: s.currentChatId,
      isStreaming: s.isStreaming,
      setStreaming: s.setStreaming,
      openIDE: s.openIDE,
      setExecuting: s.setExecuting,
      setActiveFile: s.setActiveFile,
      setIDETab: s.setIDETab,
      ideOpen: s.ideOpen,
      clearLiveCode: s.clearLiveCode,
      appendLiveCode: s.appendLiveCode,
      addLiveCodeFile: s.addLiveCodeFile,
      addWorklogEntry: s.addWorklogEntry,
      updateWorklogEntry: s.updateWorklogEntry,
      clearWorklog: s.clearWorklog,
      setContainerStatus: s.setContainerStatus,
      setPreviewUrl: s.setPreviewUrl,
      setPendingRunCommand: s.setPendingRunCommand,
      saveChatFiles: s.saveChatFiles,
      addAsset: s.addAsset,
      updateAsset: s.updateAsset,
      setLastMode: s.setLastMode,
    }))
  )

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
      // Option A: inject live connectedApps list on first/early messages
      let connectedApps: string[] | undefined
      const allMsgs = useAppStore.getState().chats.find((c) => c.id === chatId)?.messages ?? []
      if (allMsgs.length <= 4) {
        try {
          const connRes = await fetch('/api/connectors?action=status')
          if (connRes.ok) {
            const connData = await connRes.json() as { connections?: Array<{ appName: string }> }
            connectedApps = [...new Set((connData.connections ?? []).map((c) => c.appName).filter(Boolean))]
          }
        } catch { /* non-fatal */ }
      }

      chatAbortRef.current?.abort()
      chatAbortRef.current = new AbortController()
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, model: selectedModel, userProfile, ...(connectedApps ? { connectedApps } : {}) }),
        signal: chatAbortRef.current.signal,
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
            // Broadcast to Process tab so it shows each file as it's written
            window.dispatchEvent(new CustomEvent('sparkie_step_trace', { detail: { icon: 'file', label: file.name, status: 'done' } }))
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
          // Broadcast to Process tab so it shows each file as it's written
          window.dispatchEvent(new CustomEvent('sparkie_step_trace', { detail: { icon: 'file', label: file.name, status: 'done' } }))
        } else {
          // Update with complete final content (handles folder-prefixed paths)
          upsertFile(file.name, file.content, getLanguageFromFilename(file.name))
        }
      }

      // Update chat with description only
      if (filesCreated > 0) {
        const description = finalParse.text || `✨ Created ${filesCreated} file(s). Check the preview →`
        updateMessage(chatId, assistantMsgId, { content: description, isStreaming: false })
        saveMessage('assistant', description)
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
        const finalText = fullContent || "The model used all tokens for reasoning. Try a simpler prompt."
        updateMessage(chatId, assistantMsgId, {
          content: finalText,
          isStreaming: false,
        })
        saveMessage('assistant', finalText)
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

  const generateMedia = useCallback(async (chatId: string, prompt: string, mediaType: "image" | "video" | "music" | "lyrics" | "speech") => {
    const model = mediaType === "video" ? selectedVideoModel : mediaType === "music" ? selectedMusicModel : mediaType === "lyrics" ? selectedLyricsModel : mediaType === "speech" ? selectedSpeechModel : selectedImageModel
    const emoji = mediaType === "video" ? "\ud83c\udfac" : mediaType === "music" ? "\ud83c\udfb5" : mediaType === "lyrics" ? "\u270d\ufe0f" : mediaType === "speech" ? "\ud83c\udfa4" : "\ud83c\udfa8"

    const assistantMsgId = addMessage(chatId, {
      role: "assistant", content: `${emoji} Generating ${mediaType}...`, isStreaming: true, type: (mediaType === "lyrics" ? "text" : mediaType) as "text" | "image" | "video" | "music" | "speech",
    })

    setStreaming(true)
    if (!ideOpen) openIDE()
    setIDETab("process")

    const logId = addWorklogEntry({ type: "action", content: `Generating ${mediaType} with ${model}: "${prompt.slice(0, 60)}..."`, status: "running" })
    const startTime = Date.now()

    try {
      // Detect explicit Style + Lyrics blocks in prompt (user-provided, bypass MiniMax generation)
      // Matches: "Style-\nSTYLE_TEXT\n\nLyrics\nLYRICS_TEXT" or "Styles:\n..." or "Style:\n..."
      let userStyle: string | undefined
      let userLyrics: string | undefined
      if (mediaType === "music" && model === "ace-step-free") {
        const styleMatch = prompt.match(/^styles?[:\-]?\s*\n([\s\S]+?)\n\s*\n(?:lyrics[:\-]?\s*\n)([\s\S]+)/i)
        if (styleMatch) {
          userStyle = styleMatch[1].trim()
          userLyrics = styleMatch[2].trim()
        } else {
          // Also handle "Lyrics\nTEXT" alone at start, with Style coming after
          const lyricsFirst = prompt.match(/^lyrics[:\-]?\s*\n([\s\S]+?)\n\s*\nstyles?[:\-]?\s*\n([\s\S]+)/i)
          if (lyricsFirst) {
            userLyrics = lyricsFirst[1].trim()
            userStyle = lyricsFirst[2].trim()
          }
        }
      }
      const body: Record<string, unknown> = mediaType === "speech" ? { text: prompt, model, voice_id: selectedVoiceId } : { prompt, model }
      if (userStyle) body.userStyle = userStyle
      if (userLyrics) body.userLyrics = userLyrics
      if (mediaType === "video") {
        body.duration = 6
        if (videoFrameImage) body.first_frame_image = videoFrameImage
      }

      const endpoint = mediaType === "music" ? "/api/music" : mediaType === "lyrics" ? "/api/lyrics" : mediaType === "speech" ? "/api/speech" : mediaType === "video" ? "/api/video" : "/api/image"
      const response = await fetch(endpoint, {
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

      // SSE stream (MiniMax models): read event stream, show progress dots while waiting
      if (response.headers.get("content-type")?.includes("text/event-stream")) {
        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        const dots = [".", "..", "..."]
        let dotIdx = 0

        const tickInterval = setInterval(() => {
          dotIdx = (dotIdx + 1) % 3
          const elapsed = Math.round((Date.now() - startTime) / 1000)
          updateMessage(chatId, assistantMsgId, {
            content: `🎵 Generating music${dots[dotIdx]} (${elapsed}s)`,
            isStreaming: true,
          })
        }, 1500)

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split("\n")
            buffer = lines.pop() ?? ""
            for (const line of lines) {
              if (!line.startsWith("data:")) continue
              const json = line.slice(5).trim()
              if (!json) continue
              try {
                const sseData = JSON.parse(json)
                clearInterval(tickInterval)
                if (sseData.error) {
                  updateMessage(chatId, assistantMsgId, {
                    content: `music generation failed: ${sseData.error}`,
                    isStreaming: false, type: "text",
                  })
                  updateWorklogEntry(logId, { status: "error", duration: Date.now() - startTime })
                  setStreaming(false)
                  return
                }
                // ACE Music: rich card with title, v1/v2, style, lyrics
                if (sseData.type === "ace_music" && sseData.url) {
                  updateMessage(chatId, assistantMsgId, {
                    content: prompt,
                    imageUrl: sseData.url as string,
                    imagePrompt: prompt,
                    isStreaming: false,
                    type: "ace_music",
                    model: "ace-step-free",
                    aceMetadata: {
                      title: (sseData.title as string) || "Sparkie Mix",
                      style: (sseData.style as string) || prompt.slice(0, 120),
                      lyrics: (sseData.lyrics as string) || "",
                      url2: (sseData.url2 as string) || undefined,
                    },
                  })
                  const mediaChatTitle = useAppStore.getState().chats.find(c => c.id === chatId)?.title || "New Chat"
                  const safePrompt = prompt.slice(0, 40).replace(/[^a-z0-9 ]/gi, "").trim().replace(/\s+/g, "-") || "music"
                  addAsset({
                    name: `${safePrompt}-ace.mp3`,
                    language: "",
                    content: sseData.url as string,
                    chatId,
                    chatTitle: mediaChatTitle,
                    fileId: assistantMsgId,
                    assetType: "audio" as import("@/store/appStore").AssetType,
                    source: "agent" as const,
                  })
                  updateWorklogEntry(logId, { status: "done", duration: Date.now() - startTime })
                  setStreaming(false)
                  return
                }
                if (sseData.url) {
                  updateMessage(chatId, assistantMsgId, {
                    content: prompt,
                    imageUrl: sseData.url as string,
                    imagePrompt: prompt,
                    isStreaming: false,
                    type: "ace_music",
                    model: model,
                    aceMetadata: {
                      title: (sseData.title as string) || prompt.slice(0, 60).replace(/\b\w/g, c => c.toUpperCase()).trim() || "Sparkie Mix",
                      style: (sseData.style as string) || prompt.slice(0, 200),
                      lyrics: (sseData.lyrics as string) || "",
                      url2: undefined,
                    },
                  })
                  const mediaChatTitle = useAppStore.getState().chats.find(c => c.id === chatId)?.title || "New Chat"
                  const safePrompt = prompt.slice(0, 40).replace(/[^a-z0-9 ]/gi, "").trim().replace(/\s+/g, "-") || "music"
                  addAsset({
                    name: `${safePrompt}.mp3`,
                    language: "",
                    content: sseData.url,
                    chatId,
                    chatTitle: mediaChatTitle,
                    fileId: assistantMsgId,
                    assetType: "audio" as import("@/store/appStore").AssetType,
                    source: "agent" as const,
                  })
                  updateWorklogEntry(logId, { status: "done", duration: Date.now() - startTime })
                  setStreaming(false)
                  return
                }
              } catch { /* malformed SSE line, skip */ }
            }
          }
        } finally {
          clearInterval(tickInterval)
          reader.cancel().catch(() => {})
        }
        setStreaming(false)
        return
      }

      const data = await response.json()

      // Async task path: server returns taskId (music ACE-Step or video MiniMax)
      if (data.taskId && (data.status === "queued" || data.status === "processing")) {
        const taskId = data.taskId
        const isVideoTask = mediaType === "video"
        const taskEmoji = isVideoTask ? "🎬" : "🎵"
        const taskLabel = isVideoTask ? "video" : "music"
        const pollEndpoint = isVideoTask ? `/api/video?taskId=${taskId}` : `/api/music?taskId=${taskId}`
        const dots = [".", "..", "..."]
        let dotIdx = 0
        let pollCount = 0
        const MAX_POLLS = 120 // 10 minutes max (120 × 5s)

        updateMessage(chatId, assistantMsgId, {
          content: `${taskEmoji} Generating ${taskLabel}… this takes 2-5 minutes`,
          isStreaming: true,
        })

        const pollInterval = setInterval(async () => {
          pollCount++
          dotIdx = (dotIdx + 1) % 3

          if (pollCount > MAX_POLLS) {
            clearInterval(pollInterval)
            updateMessage(chatId, assistantMsgId, {
              content: `${taskLabel.charAt(0).toUpperCase() + taskLabel.slice(1)} generation timed out after 10 minutes. Please try again.`,
              isStreaming: false, type: "text",
            })
            updateWorklogEntry(logId, { status: "error", duration: Date.now() - startTime })
            setStreaming(false)
            return
          }

          try {
            const statusRes = await fetch(pollEndpoint)
            if (!statusRes.ok) return // network blip, keep polling

            const statusData = await statusRes.json()

            if (statusData.status === "done" && statusData.url) {
              clearInterval(pollInterval)
              updateMessage(chatId, assistantMsgId, {
                content: prompt,
                imageUrl: statusData.url,
                imagePrompt: prompt,
                isStreaming: false,
                type: isVideoTask ? "video" : "music",
                model: model,
              })
              const mediaChatTitle = useAppStore.getState().chats.find(c => c.id === chatId)?.title || "New Chat"
              const safePrompt = prompt.slice(0, 40).replace(/[^a-z0-9 ]/gi, "").trim().replace(/\s+/g, "-") || taskLabel
              const fileExt = isVideoTask ? "mp4" : "mp3"
              const assetType = isVideoTask ? "video" : "audio"
              addAsset({
                name: `${safePrompt}.${fileExt}`,
                language: "",
                content: statusData.url,
                chatId,
                chatTitle: mediaChatTitle,
                fileId: assistantMsgId,
                assetType: assetType as import("@/store/appStore").AssetType,
                source: "agent" as const,
              })
              updateWorklogEntry(logId, { status: "done", duration: Date.now() - startTime })
              setStreaming(false)
            } else if (statusData.status === "error") {
              clearInterval(pollInterval)
              updateMessage(chatId, assistantMsgId, {
                content: `${taskLabel.charAt(0).toUpperCase() + taskLabel.slice(1)} generation failed: ${statusData.error || "Unknown error"}`,
                isStreaming: false, type: "text",
              })
              updateWorklogEntry(logId, { status: "error", duration: Date.now() - startTime })
              setStreaming(false)
            } else {
              // Still pending — update dots animation
              const elapsed = Math.round((Date.now() - startTime) / 1000)
              updateMessage(chatId, assistantMsgId, {
                content: `${taskEmoji} Generating ${taskLabel}${dots[dotIdx]} (${elapsed}s)`,
                isStreaming: true,
              })
            }
          } catch {
            // Poll failed — keep trying
          }
        }, 5000)

        return // don't call setStreaming(false) yet — interval handles it
      }

      // Synchronous result (MiniMax models)
      const isTextResult = mediaType === "lyrics"
      updateMessage(chatId, assistantMsgId, {
        content: isTextResult ? (data.title ? `**${data.title}**\n\n${data.lyrics}` : data.lyrics) : prompt,
        imageUrl: isTextResult ? undefined : data.url,
        imagePrompt: isTextResult ? undefined : prompt,
        isStreaming: false,
        type: isTextResult ? "text" : mediaType,
        model: model,
      })
      const mediaChatTitle = useAppStore.getState().chats.find(c => c.id === chatId)?.title || "New Chat"
      const mediaExt = mediaType === "video" ? "mp4" : mediaType === "music" ? "mp3" : "png"
      const mediaAssetType = (mediaType === "music" || mediaType === "speech") ? "audio" : mediaType === "lyrics" ? "other" : mediaType
      const safePrompt = prompt.slice(0, 40).replace(/[^a-z0-9 ]/gi, "").trim().replace(/\s+/g, "-") || mediaType
      if (data.url) {
        addAsset({
          name: `${safePrompt}.${mediaExt}`,
          language: "",
          content: data.url,
          chatId,
          chatTitle: mediaChatTitle,
          fileId: assistantMsgId,
          assetType: mediaAssetType as import("@/store/appStore").AssetType,
          source: "agent" as const,
        })
      }
      updateWorklogEntry(logId, { status: "done", duration: Date.now() - startTime })
    } catch (error) {
      console.error(`${mediaType} gen error:`, error)
      updateMessage(chatId, assistantMsgId, { content: `${mediaType} generation failed`, isStreaming: false, type: "text" })
      updateWorklogEntry(logId, { status: "error", duration: Date.now() - startTime })
    } finally {
      setStreaming(false)
    }
  }, [selectedImageModel, selectedVideoModel, selectedMusicModel, selectedLyricsModel, selectedSpeechModel, selectedVoiceId, addMessage, updateMessage, setStreaming, addWorklogEntry, updateWorklogEntry, openIDE, setIDETab, ideOpen])

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
    // Build/edit intent — but only if there's no overriding emotional/relational context
  // Emotional override: "i had broken you trying to update you", "you've been updated" etc.
  // — these contain EDIT_PHRASE words but are clearly personal conversation, not build intent.
  const EMOTIONAL_OVERRIDE = /\b(i('m| am| was| feel)|you('re| are| were)|we('re| are)|she('s| is)|he('s| is)|broken you|proud of|upset|sorry|happy|excited|love|miss|wow|amazing|incredible|beautiful|great job|well done|thank|glad|grateful)\b/i
  const hasBuildSignal = BUILD_KEYWORDS.test(t) || BUILD_PHRASE.test(t) || EDIT_PHRASE.test(t)
  if (hasBuildSignal) {
    // Comms override — email/social tasks win even if "write/create/make" prefix present
    // e.g. "write an email", "create a tweet", "make me a message" → always chat
    // NOTE: inline both regexes here to avoid TDZ — AGENTIC_TASK const is declared later in this scope
    if (
      /\b(send|compose|draft|reply to|respond to|forward|email|tweet|post|message|text|dm|notify|remind|schedule|remind me|set a reminder|search my|look up|find me|fetch|check my|read my|read me|read the|show my|show me|list my|list me|summarize my|investigate|analyze|analyse|diagnose|audit)\b/i.test(t) &&
      /\b(email|tweet|post to|message|dm|text|reply to|forward|discord|slack|instagram|twitter|facebook|reddit|tiktok)\b/i.test(t)
    ) return true  // → streamReply → /api/chat
    // If message has emotional/relational override AND no explicit code target, escalate to LLM
    const hasCodeTarget = /\b(app|page|button|color|navbar|footer|header|component|style|css|html|code|script|file|function|api|endpoint|route|database|model|feature|modal|form|input|layout|theme|icon|image|logo|animation|widget|card|sidebar|menu|dropdown|table|chart|graph|dashboard)\b/i.test(t)
    if (EMOTIONAL_OVERRIDE.test(t) && !hasCodeTarget) return null // → LLM classifier
    return false
  }

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

    // Agentic task requests — ALWAYS chat path (Sparkie's /api/chat handles these, NOT the IDE builder)
    // Email, social, search, memory, scheduling, comms — anything that triggers Sparkie's tool loop
    const AGENTIC_TASK = /\b(send|compose|draft|reply to|respond to|forward|email|tweet|post|message|text|dm|notify|remind|schedule|remind me|set a reminder|search my|look up|find me|fetch|check my|read my|read me|read the|show my|show me|list my|list me|summarize my|check (the|my|for)|what.{0,20}(email|inbox|calendar|reminder|tweet|post|message|schedule)|remember (that|this|my|to)|save (this|that|my|to)|add to|remove from|delete from|tell me what (you|i)|what can you|what do you|investigate|analyze|analyse|diagnose|audit|review my|read (my|me|the|latest|recent|new|unread)|open my|play my|start my|stop my)\b/i
    if (AGENTIC_TASK.test(t)) return true  // → streamReply → /api/chat

    // Non-code "create" — create a reminder/event/meeting/note/goal/plan are agentic, not builds
    // Excludes "task"/"list" — too ambiguous ("task manager app", "todo list app" should be builds)
    // BUILD_PHRASE "create a" will still correctly catch code builds downstream
    if (/\bcreate\b.{0,40}\b(reminder|event|meeting|note|goal|plan|alert|notification|record|appointment)\b/i.test(t)) return true

    // Media generation — "make me a song / generate an image / make a video" → ALWAYS chat
    // These hit BUILD_PHRASE ("make a", "generate a") but must go to streamReply → Sparkie's media tools
    // Must run BEFORE BUILD_PHRASE check below
    // Pattern A: "generate/make/create [article/adjective] [media type]"
    const MEDIA_GENERATE_A = /\b(make me |make |generate |write me |write |create )(?:(?:a |an |some |some )\b)?(?:[a-z]+ )?(?:[a-z]+ )?(image|photo|picture|drawing|illustration|artwork|render|portrait|wallpaper|thumbnail|visual|video|clip|animation|reel|short|movie|film|footage|song|music|track|beat|melody|audio|sound|jingle|composition|playlist)/i
    // Pattern B: explicit standalone media intent keywords
    const MEDIA_GENERATE_B = /\b(generate|make me|write me|compose|create).{0,30}\b(music|song|track|beat|melody|audio|image|photo|video)/i
    if (MEDIA_GENERATE_A.test(t) || MEDIA_GENERATE_B.test(t)) return true  // → streamReply → generate_image / generate_video / generate_ace_music

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
      .map((m) => {
        // Vision: if this message has an imageUrl, send as multipart content for model to see
        if (m.imageUrl && m.role === 'user') {
          return {
            role: m.role,
            content: [
              { type: 'image_url', image_url: { url: m.imageUrl } },
              { type: 'text', text: m.content || ' ' },
            ],
          }
        }
        return { role: m.role, content: m.content }
      })
    const assistantMsgId = addMessage(chatId, { role: "assistant", content: "", model: selectedModel, isStreaming: true })
    setStreaming(true)
    // ── Worklog framing: open IDE + log session start ──
    clearWorklog()
    if (!ideOpen) openIDE()
    setIDETab('worklog')
    addWorklogEntry({ type: 'action', content: 'Query received — routing...', status: 'running' })
    try {
      const userProfile = useAppStore.getState().userProfile
      chatAbortRef.current?.abort()
      chatAbortRef.current = new AbortController()
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, model: selectedModel, userProfile }),
        signal: chatAbortRef.current.signal,
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        const msg = response.status === 429 ? "Rate limited — wait a moment and try again." : response.status === 401 ? "Authentication error — please refresh the page." : `Error: ${err.error || response.status}`
        updateMessage(chatId, assistantMsgId, { content: msg, isStreaming: false })
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
            // Step-trace card
            if (parsed.step_trace) {
              const trace = parsed.step_trace as StepTrace
              // Auto-open IDE panel so user sees live activity — same as streamAgent
              if (!ideOpen) openIDE()
              _setStepTraces(prev => {
                const existing = prev.findIndex(t => t.label === trace.label && t.status === 'running')
                let next: StepTrace[]
                if (existing >= 0 && (trace.status === 'done' || trace.status === 'error')) {
                  next = prev.map((t, i) => i === existing ? trace : t)
                } else if (trace.status === 'running') {
                  next = [...prev, trace]
                } else {
                  next = [...prev, trace]
                }
                _stepTracesRef.current = next  // keep ref in sync
                return next
              })
              // Log real step to worklog so Live Activity shows what Sparkie is actually doing
              if (trace.status === 'running') {
                addWorklogEntry({ type: 'action', content: trace.label, status: 'running' })
              } else if (trace.status === 'done') {
                addWorklogEntry({ type: 'result', content: trace.label + (trace.duration ? ` (${trace.duration < 1000 ? trace.duration + 'ms' : (trace.duration / 1000).toFixed(1) + 's'})` : ''), status: 'done' })
              } else if (trace.status === 'error') {
                addWorklogEntry({ type: 'error', content: trace.label, status: 'error' })
              }
              // Broadcast to ChatView so the in-stream chip can show it
              window.dispatchEvent(new CustomEvent('sparkie_step_trace', { detail: trace }))
              continue
            }
            // Worklog card inline
            if (parsed.worklog_card) {
              _setInlineFeedCards(prev => [...prev, parsed.worklog_card as WorklogCard])
              continue
            }
            // IDE build trigger — chat route detected a build request, hand off to streamAgent
            if (parsed.ide_build) {
              const buildPrompt = (parsed.ide_build as { prompt: string }).prompt
              // Let the current chat message finish, then trigger the build pipeline
              setTimeout(() => streamAgent(chatId, buildPrompt), 100)
              continue
            }
            // Phase 5: task_chip — show "In memory:..." chip while tools run
            if (parsed.task_chip) {
              useAppStore.getState().setLongTaskLabel(parsed.task_chip as string)
              continue
            }
            // Phase 5: task_chip_clear — hide chip when response arrives
            if (parsed.task_chip_clear) {
              // Stamp the chip label + step traces onto the completed message
              const chipLabelNow = useAppStore.getState().longTaskLabel
              if (chipLabelNow && assistantMsgId) {
                useAppStore.getState().updateMessage(chatId, assistantMsgId, {
                  chipLabel: chipLabelNow,
                  toolTraces: _stepTracesRef.current.length > 0 ? [..._stepTracesRef.current] : undefined,
                })
              }
              _setStepTraces([])
              _stepTracesRef.current = []
              useAppStore.getState().setLongTaskLabel(null)
              continue
            }
            // Hive status update — animated pill only (not written to worklog; step_trace handles real entries)
            if (parsed.hive_status) {
              setHiveStatus(parsed.hive_status)
              continue
            }
            // Timer fired notification — show as a special message chip
            if (parsed.timer_fired) {
              const timerLabel = (parsed.label as string) ?? 'Scheduled task fired'
              const timerType = (parsed.trigger_type as string) ?? 'delay'
              addMessage(chatId, {
                role: 'assistant',
                content: timerLabel,
                type: 'timer_fired' as 'text',  // cast to satisfy TS until type is added
                model: timerType === 'cron' ? 'Recurring' : 'One-time',
                isStreaming: false,
              })
              continue
            }
            // HITL task approval event
            if (parsed.sparkie_task) {
              const task = parsed.sparkie_task
              // Stamp tool traces before early return so InMemoryPill renders above the HITL card
              const chipLabelAtHITL = useAppStore.getState().longTaskLabel
              if (chipLabelAtHITL && assistantMsgId) {
                useAppStore.getState().updateMessage(chatId, assistantMsgId, {
                  chipLabel: chipLabelAtHITL,
                  toolTraces: _stepTracesRef.current.length > 0 ? [..._stepTracesRef.current] : undefined,
                })
              }
              _setStepTraces([])
              _stepTracesRef.current = []
              useAppStore.getState().setLongTaskLabel(null)
              updateMessage(chatId, assistantMsgId, {
                content: fullContent || parsed.text || "I've queued that for your approval — check the card below.",
                isStreaming: false,
                pendingTask: { ...task, status: "pending" },
              })
              setStreaming(false)
              return
            }
            const delta = parsed.choices?.[0]?.delta
            if (delta?.content) {
              if (!fullContent) {
                // First token — Sparkie is now composing her response
                addWorklogEntry({ type: 'result', content: 'Analyzed', status: 'done' })
              }
              fullContent += delta.content
              clearTimeout(streamFlushRef.current)
              streamFlushRef.current = setTimeout(() => {
                updateMessage(chatId, assistantMsgId, { content: fullContent })
              }, 16) as unknown as number
            }
          } catch { /* skip */ }
        }
      }
      // BUILD_REDIRECT: Only re-route if the model gave JUST a "I'll do it" with nothing else
      // AND the original message had strong task intent (not emotional/greeting)
      const BUILD_REDIRECT_RE = /^\s*(i'll build|let me build|i'll create|let me create|building that|creating that)[\.!]?\s*$/i
      const hasStrongTaskIntent = /\b(build|create|make me|generate|write me|code)\b/i.test(userContent) && userContent.length > 20
      if (fullContent && BUILD_REDIRECT_RE.test(fullContent.trim()) && hasStrongTaskIntent) {
        updateMessage(chatId, assistantMsgId, { content: '', isStreaming: false })
        streamAgent(chatId, userContent)
        return
      }
      const finalContent = fullContent || "👋"
      updateMessage(chatId, assistantMsgId, { content: finalContent, isStreaming: false })
      saveMessage('assistant', finalContent)
      // ── Worklog framing: log response sent ──
      addWorklogEntry({ type: 'ai_response', content: `You just sent me a message:\n${userContent.slice(0, 120)}${userContent.length > 120 ? '\u2026' : ''}`, status: 'done' })
    } catch {
      updateMessage(chatId, assistantMsgId, { content: "Connection error.", isStreaming: false })
      addWorklogEntry({ type: 'error', content: 'Connection error', status: 'error' })
    } finally {
      setHiveStatus(null)
      setStreaming(false)
      useAppStore.getState().setLongTaskLabel(null)  // always clear chip on completion/error
    }
  }, [selectedModel, addMessage, updateMessage, setStreaming, setHiveStatus, saveMessage, clearWorklog, openIDE, ideOpen, setIDETab, addWorklogEntry])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- streamAgent is stable at runtime (defined after, useCallback ref)

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

    // BUG-06/07/08: Auto-clear IDE process pane + preview before every new build
    clearWorklog()
    setPreviewUrl('')

    // Pre-build acknowledgement — shown immediately so user isn't staring at silence
    const ACK_PHRASES = [
      `On it! Let me build that for you ✨`,
      `Got it! Building that now ⚡`,
      `On it — putting that together for you 🔥`,
      `Sure thing! Spinning that up now ✨`,
    ]
    const ackText = ACK_PHRASES[Math.floor(Math.random() * ACK_PHRASES.length)]

    // ACK message — permanent friendly message, becomes wrap-up at the end
    const ackMsgId = addMessage(chatId, {
      role: 'assistant', content: ackText, model: 'Agent Loop', isStreaming: false, type: 'text'
    })
    // Thinking message — shows live planning/building steps; hidden at finalize
    const thinkingMsgId = addMessage(chatId, {
      role: 'assistant', content: '', model: 'Agent Loop', isStreaming: true, type: 'text'
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
    clearWorklog()
    setContainerStatus('idle')
    setPreviewUrl(null)
    if (!ideOpen) openIDE()
    setIDETab('process')
    addWorklogEntry({ type: 'action', content: 'Build started — analyzing request', status: 'running' })
    useAppStore.getState().setLongTaskLabel('Building…')

    try {
      // Cancel any in-flight agent request before starting a new one
      agentAbortRef.current?.abort()
      agentAbortRef.current = new AbortController()
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...apiMessages, { role: 'user', content: apiUserContent }], currentFiles: currentFilesPayload, model: selectedModel, userProfile: useAppStore.getState().userProfile, mode: 'build' }),
        signal: agentAbortRef.current.signal,
      })

      if (!response.ok) {
        updateMessage(chatId, ackMsgId, { content: 'Agent error — try again', isStreaming: false })
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
              addWorklogEntry({ type: 'thinking', content: parsed.text, status: 'running' })
            } else if (parsed.event === 'delta' && parsed.content) {
              fullBuild += parsed.content
              appendLiveCode(parsed.content)
              // Create build message bubble on first delta (lazy — avoids double-bubble during planning)
              ensureBuildMsg()
              // Parse files incrementally (folders + files)
              const partialParse = parseAIResponse(fullBuild, projectName)
              // Create explicit folder nodes from ---FOLDER:--- markers
              for (const folder of (partialParse.folders ?? [])) {
                upsertFile(`${folder}/.gitkeep`, '', 'plaintext')
              }
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
                  // Broadcast to Process tab so it shows each file as it's written
                  window.dispatchEvent(new CustomEvent('sparkie_step_trace', { detail: { icon: 'file', label: file.name, status: 'done' } }))
                  addWorklogEntry({ type: 'code', content: `Writing ${file.name}`, status: 'running' })
                  // Track in assets
                  const chatTitle = useAppStore.getState().chats.find(c => c.id === chatId)?.title || 'New Chat'
                  addAsset({ name: file.name, language: getLanguageFromFilename(file.name), content: file.content, chatId, chatTitle, fileId, assetType: detectAssetTypeFromName(file.name), source: 'agent' as const })
                  filesCreated++
                } else {
                  // Update with complete final content (handles folder-prefixed paths)
                  upsertFile(file.name, file.content, getLanguageFromFilename(file.name))
                }
              }
            } else if (parsed.event === 'done') {
              // Final parse pass (folders + files)
              const finalParse = parseAIResponse(fullBuild, projectName)
              for (const folder of (finalParse.folders ?? [])) {
                upsertFile(`${folder}/.gitkeep`, '', 'plaintext')
              }
              for (const file of finalParse.files) {
                if (!createdFileNames.has(file.name)) {
                  createdFileNames.add(file.name)
                  const fileId = upsertFile(file.name, file.content, getLanguageFromFilename(file.name))
                  if (filesCreated === 0) setActiveFile(fileId)
                  addLiveCodeFile(file.name)
                  // Broadcast to Process tab so it shows each file as it's written
                  window.dispatchEvent(new CustomEvent('sparkie_step_trace', { detail: { icon: 'file', label: file.name, status: 'done' } }))
                  const chatTitle = useAppStore.getState().chats.find(c => c.id === chatId)?.title || 'New Chat'
                  addAsset({ name: file.name, language: getLanguageFromFilename(file.name), content: file.content, chatId, chatTitle, fileId, assetType: detectAssetTypeFromName(file.name), source: 'agent' as const })
                  filesCreated++
                } else {
                  // Update with complete final content (handles folder-prefixed paths)
                  const updatedFileId = upsertFile(file.name, file.content, getLanguageFromFilename(file.name))
                  // Sync asset store so preview/Open button get the final HTML
                  updateAsset(updatedFileId, file.content)
                }
              }
            } else if (parsed.event === 'error') {
              // Sanitize: never show raw JSON error blobs to the user
              const rawErrMsg: string = parsed.message || 'Something went wrong'
              const isRawJson = rawErrMsg.trimStart().startsWith('{') || rawErrMsg.includes('FreeUsageLimitError') || rawErrMsg.includes('"type":"error"')
              const displayErr = isRawJson ? "I hit a snag — give me a moment and try again." : rawErrMsg
              updateMessage(chatId, ackMsgId, { content: '❌ ' + displayErr, isStreaming: false })
              if (buildMsgId) updateMessage(chatId, buildMsgId, { content: '', isStreaming: false })
              addWorklogEntry({ type: 'error', content: rawErrMsg, status: 'error' })
            }
          } catch { /* skip */ }
        }
      }

      // Finalize messages — hide the planning/thinking status bubble
      updateMessage(chatId, thinkingMsgId, { content: '', isStreaming: false })

      if (filesCreated > 0) {
        // Show clean description — NEVER raw code in the chat bubble
        const fileNames = Array.from(createdFileNames).join(', ')
        const description = `✨ Built ${fileNames} — preview ready →`
        if (buildMsgId) updateMessage(chatId, buildMsgId, { content: description, isStreaming: false })
        addWorklogEntry({ type: 'result', content: `Built ${filesCreated} file${filesCreated > 1 ? 's' : ''}: ${fileNames}`, status: 'done' })

        // Natural post-build wrap-up message (like competitors do)
        const WRAP_PHRASES = [
          `There you go! Check the preview on the right. Let me know if you want any changes 🙌`,
          `All done! Take a look at the preview — happy to tweak anything you'd like ✨`,
          `Built and ready! Let me know what you think or if you want to adjust anything 🔥`,
          `Done! Preview is live on the right. What should we change or add next?`,
          `There it is! Let me know how it looks and what you'd like to change 🐝`,
        ]
        const wrapText = WRAP_PHRASES[Math.floor(Math.random() * WRAP_PHRASES.length)]
        updateMessage(chatId, ackMsgId, { content: wrapText, isStreaming: false })
        saveMessage('assistant', wrapText)

        // Build completion card — shows files created, languages, quick actions
        const createdFilesList = Array.from(createdFileNames)
        const uniqueLangs = [...new Set(createdFilesList.map(f => getLanguageFromFilename(f)).filter(l => l !== 'plaintext'))]
        addMessage(chatId, {
          role: 'assistant',
          content: '',
          type: 'build_card',
          model: selectedModel,
          isStreaming: false,
          buildCard: {
            title: projectName || 'project',
            files: createdFilesList,
            fileCount: filesCreated,
            languages: uniqueLangs,
            isEdit,
          },
        })

        // ── BRAIN.md — Sparkie's session memory ─────────────────────────────
        // Auto-creates/updates a context block so Sparkie resumes without re-explanation
        const brainTs = new Date().toISOString().slice(0, 16).replace('T', ' ')
        const brainLines = [
          '# SPARKIE BRAIN — Session Memory',
          '<!-- Auto-generated. Do not delete — Sparkie uses this for context continuity. -->',
          '',
          '## Project',
          `- **Name**: ${projectName || 'project'}`,
          `- **Last built**: ${brainTs} UTC`,
          `- **Action**: ${isEdit ? 'Edit/Update' : 'Fresh build'}`,
          '',
          '## Files',
          ...createdFilesList.map(f => `- \`${f}\``),
          '',
          '## Stack',
          ...(uniqueLangs.length > 0 ? uniqueLangs.map(l => `- ${l}`) : ['- (unknown)']),
          '',
          '## Context',
          'This is the active project in this session. When the user asks to change, fix,',
          'or extend something, assume they mean the files above unless specified otherwise.',
        ]
        upsertFile('BRAIN.md', brainLines.join('\n'), 'markdown')

        // ── Auto-run detection ─────────────────────────────────────────────
        // If build included a package.json with a dev script (Vite, CRA, Next, etc.)
        // automatically fire the dev server in the terminal. Sparkie never declares
        // "preview ready" for Node projects without actually starting the server.
        const allBuiltFiles = Array.from(createdFileNames)
        const hasPackageJson = allBuiltFiles.some(f => f === 'package.json' || f.endsWith('/package.json'))
        if (hasPackageJson) {
          // Recursively search the file tree — handles nested paths like sparkie/package.json
          // upsertFile builds a folder tree, so flat .find() misses children
          type FNode = import('@/store/appStore').FileNode
          function findFileInTree(nodes: FNode[], name: string): FNode | undefined {
            for (const n of nodes) {
              if (n.type === 'file' && n.name === name) return n
              if (n.children) { const found = findFileInTree(n.children as FNode[], name); if (found) return found }
            }
          }
          const pkgFile = findFileInTree(useAppStore.getState().files, 'package.json')
          let hasDevScript = false
          // Derive project root folder from built file paths (e.g. 'sparkie/package.json' → 'sparkie')
          // Files are auto-wrapped in a project folder by fileParser.ts; we need to cd into it.
          const projectRoot = allBuiltFiles.find(f => f.includes('/'))?.split('/')[0] ?? ''
          const cdPrefix = projectRoot ? `cd ${projectRoot} && ` : ''
          let startCmd = `${cdPrefix}npm install && npm run dev`
          try {
            if (pkgFile?.content) {
              const pkg = JSON.parse(pkgFile.content) as { scripts?: Record<string, string> }
              hasDevScript = !!(pkg.scripts?.dev || pkg.scripts?.start)
              // Prefer start.sh if it was built (already has npm install && npm run dev)
              const hasStartSh = allBuiltFiles.some(f => f === 'start.sh' || f.endsWith('/start.sh'))
              if (hasStartSh) startCmd = `${cdPrefix}sh start.sh`
              else if (pkg.scripts?.dev) startCmd = `${cdPrefix}npm install && npm run dev`
              else if (pkg.scripts?.start) startCmd = `${cdPrefix}npm install && npm start`
            } else {
              // package.json in allBuiltFiles but not yet in store tree (race) — default to dev
              hasDevScript = true
            }
          } catch { hasDevScript = true /* assume dev project if package.json parse fails */ }

          if (hasDevScript) {
            // ── Qwen model: direct E2B create + polling — NO WebSocket ────────
            // The WebSocket (Terminal) had a persistent 1006 race on DO nginx.
            // Instead: POST /api/terminal with action='create' + cmd,
            // then poll /api/logs every second until previewUrl appears.
            // Preview.tsx already shows the live iframe when containerStatus='ready'.
            if (buildMsgId) updateMessage(chatId, buildMsgId, {
              content: `✨ Built ${fileNames} — starting dev server...`,
              isStreaming: false,
            })
            setIDETab('preview')
            setContainerStatus('installing')
            const nodeWrapPhrases = [
              `Installing dependencies and building... preview will load automatically ✨`,
              `Running your build in the cloud — preview loads when it's ready 🚀`,
              `Building in E2B sandbox — hang tight, iframe preview coming up 🔥`,
            ]
            updateMessage(chatId, ackMsgId, {
              content: nodeWrapPhrases[Math.floor(Math.random() * nodeWrapPhrases.length)],
              isStreaming: false,
            })
            // Determine build command — always use static build + npx serve
            const buildCmd = projectRoot
              ? `cd ${projectRoot} && npm install && npm run build 2>&1 && npx serve -s dist -l 8080 --no-clipboard 2>&1`
              : 'npm install && npm run build 2>&1 && npx serve -s dist -l 8080 --no-clipboard 2>&1'
            // Flatten files for E2B upload
            type FNode2 = import('@/store/appStore').FileNode
            function flattenWithPaths2(nodes: FNode2[], prefix = ''): { path: string; content: string }[] {
              return nodes.flatMap(n => {
                const p = prefix ? `${prefix}/${n.name}` : n.name
                if (n.type === 'folder' || n.type === 'archive') return flattenWithPaths2(n.children ?? [], p)
                return n.content ? [{ path: p, content: n.content }] : []
              })
            }
            const currentChatState = useAppStore.getState()
            const currentChatFiles = currentChatState.chats.find(c => c.id === currentChatState.currentChatId)
            const projectFiles = currentChatFiles ? flattenWithPaths2(currentChatFiles.files) : []
            // Fire and forget — poll for result
            ;(async () => {
              try {
                const createRes = await fetch('/api/terminal', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'create', files: projectFiles, cmd: buildCmd }),
                })
                if (!createRes.ok) {
                  setContainerStatus('error')
                  return
                }
                const { sessionId } = await createRes.json() as { sessionId: string }
                // Poll /api/logs every 2s until previewUrl appears (max 3 min)
                let attempts = 0
                const poll = async () => {
                  try {
                    const logRes = await fetch(`/api/logs?sessionId=${sessionId}`)
                    if (logRes.ok) {
                      const logData = await logRes.json() as { previewUrl?: string | null; buildDone?: boolean }
                      if (logData.previewUrl) {
                        setPreviewUrl(logData.previewUrl)
                        setContainerStatus('ready')
                        setIDETab('preview')
                        return
                      }
                    }
                  } catch { /* ignore */ }
                  attempts++
                  if (attempts < 90) setTimeout(poll, 2000)
                  else setContainerStatus('error')
                }
                setTimeout(poll, 3000)
              } catch {
                setContainerStatus('error')
              }
            })()
          }
        } else {
          // ── Static build (no package.json) — preview is instant via srcdoc ──
          // Switch to preview tab and post the preview URL in chat
          setIDETab('preview')
          setContainerStatus('ready')
          // Post preview link in chat — user can open in new tab
          addMessage(chatId, {
            role: 'assistant',
            content: `✨ Preview is live → [Open in new tab](about:blank)

> **Static build** — ${fileNames} rendered directly in the preview panel. Hit the ↗ icon to open full screen.`,
            model: selectedModel,
            isStreaming: false,
          })
        }
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
            updateMessage(chatId, ackMsgId, { content: textOnly.slice(0, 2000), isStreaming: false, model: selectedModel })
            saveMessage('assistant', textOnly.slice(0, 2000))
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
      updateMessage(chatId, ackMsgId, { content: '❌ Connection error', isStreaming: false })
      if (buildMsgId) updateMessage(chatId, buildMsgId, { content: 'Try again.', isStreaming: false })
    } finally {
      setStreaming(false)
      setExecuting(false)
      useAppStore.getState().setLongTaskLabel(null)
      saveChatFiles(chatId, useAppStore.getState().files)
    }
  }, [selectedModel, addMessage, updateMessage, setStreaming, setExecuting, openIDE, setIDETab, ideOpen, upsertFile, setActiveFile, clearLiveCode, appendLiveCode, addLiveCodeFile, addWorklogEntry, updateWorklogEntry, setContainerStatus, setPreviewUrl, saveChatFiles, addAsset, updateAsset])

  // ── Abort cleanup on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      agentAbortRef.current?.abort()
    }
  }, [])

  // ── sparkie_stop_stream — dispatched by live InMemoryPill stop button ─────
  useEffect(() => {
    const handler = () => {
      chatAbortRef.current?.abort()
      agentAbortRef.current?.abort()
    }
    window.addEventListener('sparkie_stop_stream', handler)
    return () => window.removeEventListener('sparkie_stop_stream', handler)
  }, [])

  // ── sparkie_preview_ready — fired by Terminal when E2B dev server is live ──
  // Posts the preview URL as a clickable link in chat (MiniMax-style)
  useEffect(() => {
    const handler = (e: Event) => {
      const { url } = (e as CustomEvent<{ url: string }>).detail
      if (!url) return
      const cid = useAppStore.getState().currentChatId
      if (!cid) return
      useAppStore.getState().addMessage(cid, {
        role: 'assistant',
        content: `🚀 Dev server is live → [${url}](${url})`,
        isStreaming: false,
      })
    }
    window.addEventListener('sparkie_preview_ready', handler)
    return () => window.removeEventListener('sparkie_preview_ready', handler)
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

  // ── Voice chat: STT → AI → TTS loop ─────────────────────────────────────────
  const sendMessageFromVoice = useCallback(async (userText: string): Promise<string> => {
    let chatId = getOrCreateSingleChat()

    addMessage(chatId, { role: "user", content: userText })
    saveMessage('user', userText)

    // Call chat/AI directly and collect the full text reply
    return new Promise<string>((resolve) => {
      (async () => {
        try {
          // Pass full chat history so Sparkie has context (not just the current utterance)
          const chatHistory = useAppStore.getState().chats.find(c => c.id === chatId)?.messages ?? []
          const apiMessages = chatHistory
            .filter(m => m.type !== 'image' && m.type !== 'video')
            .map(m => ({ role: m.role, content: m.content }))
          // Append current user message (already added to store above)
          const messagesWithUser = [...apiMessages.filter(m => m.content !== userText || m.role !== 'user'), { role: 'user', content: userText }]
          const res = await (async () => {
            chatAbortRef.current?.abort()
            chatAbortRef.current = new AbortController()
            return fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: messagesWithUser,
                model: selectedModel,
                voiceMode: true,
              }),
              signal: chatAbortRef.current.signal,
            })
          })()

          if (!res.ok || !res.body) {
            resolve("Sorry, I couldn't generate a response right now.")
            return
          }

          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let fullText = ''
          const msgId = addMessage(chatId!, { role: 'assistant', content: '', isStreaming: true })

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const chunk = decoder.decode(value)
            // Parse SSE data lines
            const lines = chunk.split('\n')
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim()
                if (data === '[DONE]') continue
                try {
                  const parsed = JSON.parse(data)
                  const delta = parsed?.choices?.[0]?.delta?.content || parsed?.delta?.text || ''
                  if (delta) {
                    fullText += delta
                    updateMessage(chatId!, msgId, { content: fullText })
                  }
                } catch {}
              }
            }
          }

          updateMessage(chatId!, msgId, { content: fullText, isStreaming: false })
          resolve(fullText || "Done!")
        } catch {
          resolve("Sorry, something went wrong.")
        }
      })()
    })
  }, [currentChatId, createChat, addMessage, updateMessage, selectedModel])

  const inputRef = useRef(input)
  useEffect(() => { inputRef.current = input }, [input])

  const handleSubmit = useCallback(async () => {
    if ((!inputRef.current.trim() && !attachedFile) || isStreaming) return

    // ─── Slash commands ────────────────────────────────────────────────────
    const trimmed = inputRef.current.trim()
    const slashCmd = trimmed.toLowerCase().split(/\s+/)[0]
    if (slashCmd.startsWith('/')) {
      let chatId = currentChatId
      if (!chatId) chatId = createChat()
      addMessage(chatId, { role: 'user', content: trimmed })
      setInput('')
      requestAnimationFrame(() => {
        if (textareaRef.current) textareaRef.current.style.height = 'auto'
      })

      if (slashCmd === '/startradio') {
        window.dispatchEvent(new CustomEvent('sparkie:startradio'))
        addMessage(chatId, {
          role: 'assistant',
          content: "🎵 Sparkie Radio is now live! Tuning in to the station for you...",
        })
        return
      }

      if (slashCmd === '/stopradio') {
        window.dispatchEvent(new CustomEvent('sparkie:stopradio'))
        addMessage(chatId, {
          role: 'assistant',
          content: "📻 Radio stopped. Come back anytime — the station's always on.",
        })
        return
      }

      if (slashCmd === '/weather') {
        const loadingMsgId = addMessage(chatId, {
          role: 'assistant',
          content: '⛅ One moment, pulling up your local forecast...',
          isStreaming: true,
        })
        try {
          // Try browser geolocation first for accurate user location
          const getCoords = (): Promise<{ lat: number; lon: number } | null> =>
            new Promise((resolve) => {
              if (!navigator.geolocation) { resolve(null); return }
              navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
                () => resolve(null),
                { timeout: 5000 }
              )
            })
          const coords = await getCoords()
          const url = coords
            ? `/api/weather?lat=${coords.lat}&lon=${coords.lon}`
            : '/api/weather'
          const res = await fetch(url)
          const data = await res.json()
          updateMessage(chatId, loadingMsgId, { content: data.report, isStreaming: false })
        } catch {
          updateMessage(chatId, loadingMsgId, {
            content: "Couldn't reach the weather service right now. Try again in a moment.",
            isStreaming: false,
          })
        }
        return
      }

      // Unknown slash command — let Sparkie explain what's available
      addMessage(chatId, {
        role: 'assistant',
        content: `I don't know that command yet! Here's what I've got:\n\n**\`/startradio\`** — Start Sparkie Radio\n**\`/stopradio\`** — Stop the radio\n**\`/weather\`** — Get your local weather forecast`,
      })
      return
    }
    // ─── End slash commands ────────────────────────────────────────────────

    let chatId = getOrCreateSingleChat()

    const userContent = inputRef.current.trim()
    // ── Include attached file in message ────────────────────────────────────
    let messageContent = userContent
    let messageImageUrl: string | undefined
    if (attachedFile) {
      if (attachedFile.mimeType.startsWith('image/')) {
        messageContent = userContent ? userContent + '\n[Image: ' + attachedFile.name + ']' : '[Image: ' + attachedFile.name + ']'
        messageImageUrl = attachedFile.dataUrl
      } else {
        messageContent = userContent ? userContent + '\n[Attached: ' + attachedFile.name + ']' : '[Attached: ' + attachedFile.name + ']'
      }
      setAttachedFile(null)
    }
    addMessage(chatId, { role: "user", content: messageContent, ...(messageImageUrl ? { imageUrl: messageImageUrl } : {}) })
    saveMessage('user', messageContent)
    setInput("")

    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = "auto"
    })

    // Natural language media detection — catches "generate me a song", "make me a beat", etc.
    // even when the user hasn't tapped the mode button
    const nlLower = userContent.toLowerCase()
    const NL_MUSIC = /\b(generat|creat|mak|compos|writ|produc|record|pleas.*song|pleas.*music|pleas.*beat|pleas.*track|pleas.*tune)\w*\s+(me\s+)?(a\s+)?(song|music|beat|track|tune|melody|instrumental|banger|jam|freestyle|rap|hip.?hop|lo.?fi|remix|cover|jingle|anthem)/i
    const NL_LYRICS = /\b(generat|creat|writ)\w*\s+(me\s+)?(some\s+|a\s+)?(lyrics|verses|chorus|hook|rap\s+lyrics)/i
    const NL_IMAGE = /\b(draw|paint|sketch|generat|creat|render|design|visuali|illustrat)\w*\s+(me\s+)?(a\s+|an\s+|some\s+)?(image|picture|photo|illustration|artwork|painting|drawing|poster|thumbnail|logo|icon|wallpaper|banner)/i
    const NL_VIDEO = /\b(generat|creat|mak|produc|render)\w*\s+(me\s+)?(a\s+|an\s+|some\s+)?(video|clip|animation|short|reel|motion)/i

    if (genMode === "image" || (genMode === "chat" && NL_IMAGE.test(nlLower))) {
      generateMedia(chatId, userContent, "image")
    } else if (genMode === "video" || (genMode === "chat" && NL_VIDEO.test(nlLower))) {
      generateMedia(chatId, userContent, "video")
    } else if (genMode === "music" || (genMode === "chat" && NL_MUSIC.test(nlLower))) {
      generateMedia(chatId, userContent, "music")
    } else if (genMode === "lyrics" || (genMode === "chat" && NL_LYRICS.test(nlLower))) {
      generateMedia(chatId, userContent, "lyrics")
    } else if (genMode === "speech") {
      generateMedia(chatId, userContent, "speech")
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
  }, [isStreaming, currentChatId, createChat, addMessage, genMode, streamAgent, generateMedia, classifyIntent, streamReply])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (slashSuggestions.length > 0) {
      if (e.key === "Tab" || e.key === "ArrowRight") {
        e.preventDefault()
        setInput(slashSuggestions[0].cmd + " ")
        setSlashSuggestions([])
        return
      }
      if (e.key === "Escape") {
        setSlashSuggestions([])
        return
      }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInput(val)
    const el = e.target
    requestAnimationFrame(() => {
      el.style.height = "auto"
          el.style.height = Math.min(el.scrollHeight, 200) + "px"
    })
    // Slash command autocomplete
    const word = val.split(/\s+/)[0]
    if (word.startsWith('/') && val === word) {
      setSlashSuggestions(
        SLASH_COMMANDS.filter(s => s.cmd.startsWith(word.toLowerCase()))
      )
    } else {
      setSlashSuggestions([])
    }
  }

  const activeModels = genMode === "image" ? IMAGE_MODELS : genMode === "video" ? VIDEO_MODELS : genMode === "music" ? MUSIC_MODELS : genMode === "lyrics" ? LYRICS_MODELS : genMode === "speech" ? SPEECH_VOICES : MODELS
  const activeModelId = genMode === "image" ? selectedImageModel : genMode === "video" ? selectedVideoModel : genMode === "music" ? selectedMusicModel : genMode === "lyrics" ? selectedLyricsModel : genMode === "speech" ? selectedVoiceId : selectedModel
  const activeModelName = activeModels.find(m => m.id === activeModelId)?.name || activeModels[0].name

  const placeholders: Record<GenMode, string> = {
    chat: "Enter your task and submit to Sparkie...",
    image: "Describe the image you want to generate...",
    video: "Describe the video you want to generate... (add a start frame for I2V)",
    music: "Describe the music you want to generate...",
    lyrics: "Describe the song — genre, mood, theme, story...",
    speech: "Enter the text you want to convert to speech...",
  }

  const messages_count = useAppStore(useShallow((s) => s.messages.length))
  const showTemplates = messages_count === 0 && input === "" && genMode === "chat"

  return (
    <>
    <div className="relative">

      {/* Slash command autocomplete */}
      {slashSuggestions.length > 0 && (
        <div className="mb-1 rounded-xl border border-honey-500/30 bg-hive-elevated overflow-hidden shadow-lg">
          {slashSuggestions.map((s) => (
            <button
              key={s.cmd}
              onMouseDown={(e) => { e.preventDefault(); setInput(s.cmd + " "); setSlashSuggestions([]) }}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-hive-hover text-left transition-colors"
            >
              <span className="text-honey-500 font-mono text-sm font-semibold">{s.cmd}</span>
              <span className="text-xs text-text-muted">{s.desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* Sparkie's Hive status — animated status pill during agent execution */}
      {hiveStatus && (
        <div className="mb-2 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-honey-500/10 border border-honey-500/25 text-xs text-honey-400 animate-pulse w-fit max-w-full overflow-hidden">
          <span className="shrink-0">⚡</span>
          <span className="truncate font-medium">{hiveStatus}</span>
        </div>
      )}
      {/* ── Attached file chip ──────────────────────────────────────── */}
      {attachedFile && (
        <div className="flex items-center gap-2 px-3 pt-2 pb-0">
          <div className="flex items-center gap-1.5 bg-hive-hover text-text-secondary text-xs px-2.5 py-1 rounded-full max-w-[240px]">
            <Paperclip size={11} className="shrink-0 text-honey-500" />
            <span className="truncate">{attachedFile.name}</span>
            <button onClick={() => setAttachedFile(null)} className="ml-0.5 hover:text-text-primary shrink-0">
              <X size={11} />
            </button>
          </div>
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
            {/* ── General file attach ─────────────────────────────────── */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,audio/*,.pdf,.txt,.doc,.docx,.csv,.json,.md"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = (ev) => {
                  setAttachedFile({ name: file.name, dataUrl: ev.target?.result as string, mimeType: file.type })
                }
                reader.readAsDataURL(file)
                e.target.value = ""
              }}
            />
            <button
              className={`p-1.5 rounded-md transition-colors ${attachedFile ? 'bg-honey-500/20 text-honey-500' : 'hover:bg-hive-hover text-text-muted hover:text-text-secondary'}`}
              title="Attach file"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={15} />
            </button>
            {/* I2V: Image upload for video mode */}
            {genMode === "video" && (
              <>
                <input
                  ref={videoFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = (ev) => setVideoFrameImage(ev.target?.result as string)
                    reader.readAsDataURL(file)
                    e.target.value = ""
                  }}
                />
                <button
                  onClick={() => videoFileRef.current?.click()}
                  className={`p-1.5 rounded-md transition-colors ${videoFrameImage ? "bg-honey-500/20 text-honey-500" : "hover:bg-hive-hover text-text-muted hover:text-text-secondary"}`}
                  title={videoFrameImage ? "Change start frame (Image-to-Video)" : "Add start frame (Image-to-Video)"}
                >
                  <Film size={15} />
                </button>
                {videoFrameImage && (
                  <div className="relative flex items-center">
                    <img src={videoFrameImage} alt="Start frame" className="h-6 w-6 rounded object-cover border border-honey-500/40" />
                    <button
                      onClick={() => setVideoFrameImage(null)}
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-hive-elevated border border-hive-border flex items-center justify-center text-text-muted hover:text-red-400 transition-colors"
                      title="Remove start frame"
                    >
                      <X size={8} />
                    </button>
                  </div>
                )}
              </>
            )}
            <button
              onClick={() => setGenMode(genMode === "image" ? "chat" : "image")}
              className={`p-1.5 rounded-md transition-colors ${genMode === "image" ? "bg-honey-500/15 text-honey-500" : "hover:bg-hive-hover text-text-muted hover:text-text-secondary"}`}
              title={genMode === "image" ? "Switch to chat" : "Image generation"}
            >
              <ImageIcon size={15} />
            </button>
            <button
              onClick={() => { const next = genMode === "video" ? "chat" : "video"; if (next !== "video") setVideoFrameImage(null); setGenMode(next) }}
              className={`p-1.5 rounded-md transition-colors ${genMode === "video" ? "bg-honey-500/15 text-honey-500" : "hover:bg-hive-hover text-text-muted hover:text-text-secondary"}`}
              title={genMode === "video" ? "Switch to chat" : "Video generation"}
            >
              <Video size={15} />
            </button>
            <button
              onClick={() => setGenMode(genMode === "music" ? "chat" : "music")}
              className={`p-1.5 rounded-md transition-colors ${genMode === "music" ? "bg-honey-500/15 text-honey-500" : "hover:bg-hive-hover text-text-muted hover:text-text-secondary"}`}
              title={genMode === "music" ? "Switch to chat" : "Music generation"}
            >
              <Music size={15} />
            </button>

            <button
              onClick={() => setGenMode(genMode === "lyrics" ? "chat" : "lyrics")}
              className={`p-1.5 rounded-md transition-colors ${genMode === "lyrics" ? "bg-honey-500/15 text-honey-500" : "hover:bg-hive-hover text-text-muted hover:text-text-secondary"}`}
              title={genMode === "lyrics" ? "Switch to chat" : "Lyrics generation"}
            >
              <FileText size={15} />
            </button>

            <button
              onClick={() => setGenMode(genMode === "speech" ? "chat" : "speech")}
              className={`p-1.5 rounded-md transition-colors ${genMode === "speech" ? "bg-honey-500/15 text-honey-500" : "hover:bg-hive-hover text-text-muted hover:text-text-secondary"}`}
              title={genMode === "speech" ? "Switch to chat" : "Text to speech"}
            >
              <Headphones size={15} />
            </button>

            {/* Model selector — hidden for chat mode (server auto-routes) */}
            {genMode !== 'chat' && (
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
                <div className="absolute bottom-full left-0 mb-1 w-72 bg-hive-elevated border border-hive-border rounded-lg shadow-xl py-1 z-[200] max-h-72 overflow-y-auto" style={{ background: "var(--hive-elevated)", backdropFilter: "none" }}>
                  {activeModels.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => {
                        if (genMode === "image") setSelectedImageModel(model.id)
                        else if (genMode === "video") setSelectedVideoModel(model.id)
                        else if (genMode === "music") setSelectedMusicModel(model.id)
                        else if (genMode === "lyrics") setSelectedLyricsModel(model.id)
                        else if (genMode === "speech") setSelectedVoiceId(model.id)
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
                      <div className="flex items-center gap-1.5 shrink-0">
                        {genMode === "speech" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              const audio = new Audio()
                              fetch("/api/speech-stream", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ text: "Hi, I'm Sparkie. How can I help you today?", model: "speech-02-turbo", voice_id: model.id }),
                              }).then(r => r.arrayBuffer()).then(buf => {
                                audio.src = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }))
                                audio.play().catch(() => {})
                              }).catch(() => {})
                            }}
                            className="p-1 rounded text-text-muted hover:text-honey-500 hover:bg-honey-500/10 transition-colors"
                            title="Preview voice"
                          >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><polygon points="1,1 9,5 1,9"/></svg>
                          </button>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          model.tag === "Free" ? "bg-honey-500/20 text-honey-500" : "bg-honey-500/15 text-honey-500"
                        }`}>{model.tag}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            )}{/* end genMode !== 'chat' */}
          </div>

          {/* ── Right action trio: Voice Chat · Voice Input · Send ──────── */}
          <div className="flex items-center gap-1">
            {/* Voice Chat button */}
            <button
              onClick={() => setIsVoiceChatOpen(true)}
              className="group relative p-2 rounded-xl transition-all duration-200 hover:bg-honey-500/10 text-text-muted hover:text-honey-400 hover:scale-105 active:scale-95"
              title="Voice chat"
            >
              <Phone size={15} />
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md bg-hive-elevated border border-hive-border text-[10px] text-text-secondary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
                Voice chat
              </span>
            </button>

            {/* Voice Input button */}
            <button
              onClick={toggleRecording}
              disabled={isTranscribing}
              className={`group relative p-2 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 ${
                isRecording
                  ? 'bg-red-500/15 text-red-400 animate-pulse ring-1 ring-red-500/30'
                  : isTranscribing
                  ? 'bg-honey-500/10 text-honey-500/50 cursor-wait'
                  : 'hover:bg-honey-500/10 text-text-muted hover:text-honey-400'
              }`}
              title={isRecording ? 'Stop recording' : isTranscribing ? 'Transcribing...' : 'Voice input'}
            >
              {isRecording ? <MicOff size={15} /> : <Mic size={15} />}
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md bg-hive-elevated border border-hive-border text-[10px] text-text-secondary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
                {isRecording ? 'Stop' : 'Voice input'}
              </span>
            </button>

            {/* Send button — Stop is in the InMemoryPill above chat only */}
            <button
              onClick={handleSubmit} disabled={!input.trim() && !attachedFile}
              className={`p-2 rounded-xl transition-all duration-200 active:scale-95 ${
                input.trim() || attachedFile
                  ? "bg-honey-500 text-hive-900 hover:bg-honey-400 shadow-lg shadow-honey-500/25 hover:shadow-honey-500/40 hover:scale-105"
                  : "bg-hive-hover text-text-muted cursor-not-allowed opacity-50"
              }`}
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* Voice Chat overlay */}
    {isVoiceChatOpen && (
      <VoiceChat
        isActive={isVoiceChatOpen}
        onClose={() => setIsVoiceChatOpen(false)}
        onSendMessage={sendMessageFromVoice}
      />
    )}
    </>
  )
}
