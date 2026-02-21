import { create } from 'zustand'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  type?: 'text' | 'image' | 'video'
  imageUrl?: string
  imagePrompt?: string
  model?: string
  isStreaming?: boolean
}

export interface Chat {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
  files: FileNode[]  // per-chat workspace — source of truth
}

export interface FileNode {
  id: string
  name: string
  content: string
  type: 'file' | 'folder' | 'archive'  // archive = versioned snapshot, never shown as editable
  language?: string
  children?: FileNode[]
}

export interface Asset {
  id: string
  name: string
  language: string
  content: string
  chatId: string
  chatTitle: string
  createdAt: Date
  fileId: string  // references FileNode id
}

export type WorklogEntry = {
  id: string
  type: 'thinking' | 'action' | 'result' | 'error' | 'code'
  content: string
  timestamp: Date
  status?: 'running' | 'done' | 'error'
  duration?: number
}

export type IDETab = 'process' | 'files' | 'terminal'

export type ContainerStatus =
  | 'idle'
  | 'booting'
  | 'mounting'
  | 'installing'
  | 'starting'
  | 'ready'
  | 'error'

interface AppState {
  messages: Message[]
  chats: Chat[]
  currentChatId: string | null
  isLoading: boolean
  isStreaming: boolean
  selectedModel: string
  // Two overloads: (chatId, partial) for chat-scoped, or (message) for legacy
  addMessage: (chatIdOrMsg: string | Omit<Message, 'id'>, msg?: Partial<Message>) => string
  appendToMessage: (id: string, content: string) => void
  updateMessage: (chatIdOrId: string, idOrPatch: string | Partial<Message>, patch?: Partial<Message>) => void
  clearMessages: () => void
  setSelectedModel: (model: string) => void
  setStreaming: (v: boolean) => void
  createChat: () => string
  setCurrentChat: (id: string) => void
  deleteChat: (id: string) => void
  sidebarOpen: boolean
  activeTab: string
  toggleSidebar: () => void
  setActiveTab: (tab: string) => void
  files: FileNode[]
  activeFileId: string | null
  ideOpen: boolean
  ideTab: IDETab
  isExecuting: boolean
  liveCode: string
  liveCodeFiles: string[]
  addFile: (file: Omit<FileNode, 'id'>) => string
  updateFile: (id: string, content: string) => void
  updateFileContent: (id: string, content: string) => void
  renameFile: (id: string, name: string) => void
  deleteFile: (id: string) => void
  setActiveFile: (id: string | null) => void
  setFiles: (files: FileNode[]) => void
  saveChatFiles: (chatId: string, files: FileNode[]) => void
  openIDE: () => void
  toggleIDE: () => void
  setIdeTab: (tab: IDETab) => void
  setIDETab: (tab: IDETab) => void
  setExecuting: (v: boolean) => void
  appendLiveCode: (chunk: string) => void
  addLiveCodeFile: (name: string) => void
  clearLiveCode: () => void
  worklog: WorklogEntry[]
  addWorklogEntry: (entry: Omit<WorklogEntry, 'id' | 'timestamp'>) => string
  updateWorklogEntry: (id: string, patch: Partial<WorklogEntry>) => void
  clearWorklog: () => void

  assets: Asset[]
  addAsset: (asset: Omit<Asset, 'id' | 'createdAt'>) => void
  clearAssets: () => void
  containerStatus: ContainerStatus
  previewUrl: string | null
  terminalOutput: string
  setContainerStatus: (s: ContainerStatus) => void
  setPreviewUrl: (url: string | null) => void
  appendTerminalOutput: (text: string) => void
  clearTerminalOutput: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  messages: [],
  chats: [],
  currentChatId: null,
  isLoading: false,
  isStreaming: false,
  selectedModel: 'minimax-m2.5-free',

  addMessage: (chatIdOrMsg, msgPartial) => {
    const id = crypto.randomUUID()
    if (typeof chatIdOrMsg === 'string') {
      // Scoped to a specific chat
      const msg: Message = { id, role: 'user', content: '', ...msgPartial }
      set((s) => ({
        messages: [...s.messages, msg],
        chats: s.chats.map((c) =>
          c.id === chatIdOrMsg ? { ...c, messages: [...c.messages, msg] } : c
        ),
      }))
    } else {
      // chatIdOrMsg is Omit<Message, 'id'> — add id and push
      const msg: Message = { id, ...chatIdOrMsg }
      set((s) => ({ messages: [...s.messages, msg] }))
    }
    return id
  },

  appendToMessage: (id, content) =>
    set((s) => ({
      messages: s.messages.map((m) => m.id === id ? { ...m, content: m.content + content } : m),
      chats: s.chats.map((c) => ({
        ...c,
        messages: c.messages.map((m) => m.id === id ? { ...m, content: m.content + content } : m),
      })),
    })),

  updateMessage: (chatIdOrId, idOrPatch, patch) => {
    if (patch !== undefined) {
      const msgId = idOrPatch as string
      set((s) => ({
        messages: s.messages.map((m) => m.id === msgId ? { ...m, ...patch } : m),
        chats: s.chats.map((c) =>
          c.id === chatIdOrId
            ? { ...c, messages: c.messages.map((m) => m.id === msgId ? { ...m, ...patch } : m) }
            : c
        ),
      }))
    } else {
      const p = idOrPatch as Partial<Message>
      set((s) => ({
        messages: s.messages.map((m) => m.id === chatIdOrId ? { ...m, ...p } : m),
        chats: s.chats.map((c) => ({
          ...c,
          messages: c.messages.map((m) => m.id === chatIdOrId ? { ...m, ...p } : m),
        })),
      }))
    }
  },

  clearMessages: () => set({ messages: [] }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  setStreaming: (v) => set({ isStreaming: v }),

  createChat: () => {
    const id = crypto.randomUUID()
    set((s) => ({
      chats: [...s.chats, { id, title: 'New Chat', messages: [], createdAt: new Date(), files: [] }],
      currentChatId: id,
      messages: [],
      // Reset IDE completely for a fresh session
      files: [],
      activeFileId: null,
      liveCode: '',
      liveCodeFiles: [],
      isExecuting: false,
      isStreaming: false,
      ideTab: 'process',
      containerStatus: 'idle',
      previewUrl: null,
    }))
    return id
  },
  setCurrentChat: (id) => {
    const chat = get().chats.find((c) => c.id === id)
    // Restore this chat's full workspace — files, messages, and reset IDE runtime state
    set({
      currentChatId: id,
      messages: chat?.messages ?? [],
      files: chat?.files ?? [],
      activeFileId: null,
      liveCode: '',
      liveCodeFiles: [],
      isExecuting: false,
      isStreaming: false,
      ideTab: 'process',
      containerStatus: 'idle',
      previewUrl: null,
    })
  },
  deleteChat: (id) => set((s) => ({ chats: s.chats.filter((c) => c.id !== id), currentChatId: null, messages: [] })),

  sidebarOpen: true,
  activeTab: 'chat',
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setActiveTab: (tab) => set({ activeTab: tab }),

  files: [],
  activeFileId: null,
  ideOpen: false,
  ideTab: 'process',
  isExecuting: false,
  liveCode: '',
  liveCodeFiles: [],

  addFile: (file) => {
    const id = crypto.randomUUID()
    set((s) => ({ files: [...s.files, { ...file, id }] }))
    return id
  },
  updateFile: (id, content) => set((s) => ({ files: s.files.map((f) => f.id === id ? { ...f, content } : f) })),
  updateFileContent: (id, content) => set((s) => ({ files: s.files.map((f) => f.id === id ? { ...f, content } : f) })),
  renameFile: (id, name) => set((s) => ({ files: s.files.map((f) => f.id === id ? { ...f, name } : f) })),
  deleteFile: (id) => set((s) => ({ files: s.files.filter((f) => f.id !== id) })),
  setActiveFile: (id) => set({ activeFileId: id }),
  setFiles: (files) => set({ files }),
  saveChatFiles: (chatId, files) => set((s) => ({
    chats: s.chats.map((c) => c.id === chatId ? { ...c, files } : c),
  })),
  openIDE: () => set({ ideOpen: true }),
  toggleIDE: () => set((s) => ({ ideOpen: !s.ideOpen })),
  setIdeTab: (tab) => set({ ideTab: tab }),
  setIDETab: (tab) => set({ ideTab: tab }),
  setExecuting: (v) => set({ isExecuting: v }),
  appendLiveCode: (chunk) => set((s) => ({ liveCode: s.liveCode + chunk })),
  addLiveCodeFile: (name) =>
    set((s) => ({ liveCodeFiles: s.liveCodeFiles.includes(name) ? s.liveCodeFiles : [...s.liveCodeFiles, name] })),
  clearLiveCode: () => set({ liveCode: '', liveCodeFiles: [] }),

  assets: [],
  addAsset: (asset) => {
    const id = crypto.randomUUID()
    set((s) => ({ assets: [...s.assets, { ...asset, id, createdAt: new Date() }] }))
  },
  clearAssets: () => set({ assets: [] }),

  worklog: [],
  addWorklogEntry: (entry) => {
    const id = crypto.randomUUID()
    set((s) => ({ worklog: [...s.worklog, { ...entry, id, timestamp: new Date() }] }))
    return id
  },
  updateWorklogEntry: (id, patch) =>
    set((s) => ({ worklog: s.worklog.map((e) => e.id === id ? { ...e, ...patch } : e) })),
  clearWorklog: () => set({ worklog: [] }),

  containerStatus: 'idle',
  previewUrl: null,
  terminalOutput: '',
  setContainerStatus: (s) => set({ containerStatus: s }),
  setPreviewUrl: (url) => set({ previewUrl: url }),
  appendTerminalOutput: (text) => set((s) => {
    const combined = s.terminalOutput + text
    // Cap at 100KB — prevents unbounded memory growth in long sessions
    const trimmed = combined.length > 100_000 ? combined.slice(-100_000) : combined
    return { terminalOutput: trimmed }
  }),
  clearTerminalOutput: () => set({ terminalOutput: '' }),
}))
