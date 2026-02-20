import { create } from 'zustand'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  type?: 'text' | 'image' | 'video'
  imageUrl?: string
  imagePrompt?: string
}

export interface Chat {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
}

export interface FileNode {
  id: string
  name: string
  content: string
  type: 'file' | 'folder'
  language?: string
}

export type WorklogEntry = {
  id: string
  type: 'thinking' | 'action' | 'result' | 'error' | 'code'
  content: string
  timestamp: Date
  status?: 'running' | 'done' | 'error'
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
  // ── Chat / multi-chat ────────────────────────────────────────────────────
  messages: Message[]           // active chat messages (backward compat)
  chats: Chat[]
  currentChatId: string | null
  isLoading: boolean
  isStreaming: boolean
  selectedModel: string
  addMessage: (msg: Message) => void
  appendToMessage: (id: string, content: string) => void
  updateMessage: (id: string, patch: Partial<Message>) => void
  clearMessages: () => void
  setSelectedModel: (model: string) => void
  setStreaming: (v: boolean) => void
  createChat: () => string
  setCurrentChat: (id: string) => void
  deleteChat: (id: string) => void

  // ── Sidebar / navigation ──────────────────────────────────────────────────
  sidebarOpen: boolean
  activeTab: string
  toggleSidebar: () => void
  setActiveTab: (tab: string) => void

  // ── IDE ───────────────────────────────────────────────────────────────────
  files: FileNode[]
  activeFileId: string | null
  ideOpen: boolean
  ideTab: IDETab
  isExecuting: boolean
  liveCode: string
  liveCodeFiles: string[]
  addFile: (file: Omit<FileNode, 'id'>) => string
  updateFile: (id: string, content: string) => void
  updateFileContent: (id: string, content: string) => void  // alias for updateFile
  renameFile: (id: string, name: string) => void
  deleteFile: (id: string) => void
  setActiveFile: (id: string | null) => void
  setFiles: (files: FileNode[]) => void
  openIDE: () => void
  toggleIDE: () => void
  setIdeTab: (tab: IDETab) => void
  setIDETab: (tab: IDETab) => void   // alias for setIdeTab
  setExecuting: (v: boolean) => void
  appendLiveCode: (chunk: string) => void
  addLiveCodeFile: (name: string) => void
  clearLiveCode: () => void

  // ── Worklog ───────────────────────────────────────────────────────────────
  worklog: WorklogEntry[]
  addWorklogEntry: (entry: Omit<WorklogEntry, 'id' | 'timestamp'>) => string
  updateWorklogEntry: (id: string, patch: Partial<WorklogEntry>) => void
  clearWorklog: () => void

  // ── WebContainer ──────────────────────────────────────────────────────────
  containerStatus: ContainerStatus
  previewUrl: string | null
  terminalOutput: string
  setContainerStatus: (s: ContainerStatus) => void
  setPreviewUrl: (url: string | null) => void
  appendTerminalOutput: (text: string) => void
  clearTerminalOutput: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // Chat
  messages: [],
  chats: [],
  currentChatId: null,
  isLoading: false,
  isStreaming: false,
  selectedModel: 'minimax-m2.5-free',

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  appendToMessage: (id, content) =>
    set((s) => ({ messages: s.messages.map((m) => m.id === id ? { ...m, content: m.content + content } : m) })),
  updateMessage: (id, patch) =>
    set((s) => ({ messages: s.messages.map((m) => m.id === id ? { ...m, ...patch } : m) })),
  clearMessages: () => set({ messages: [] }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  setStreaming: (v) => set({ isStreaming: v }),

  createChat: () => {
    const id = crypto.randomUUID()
    const chat: Chat = { id, title: 'New Chat', messages: [], createdAt: new Date() }
    set((s) => ({ chats: [...s.chats, chat], currentChatId: id, messages: [] }))
    return id
  },
  setCurrentChat: (id) => {
    const chat = get().chats.find((c) => c.id === id)
    set({ currentChatId: id, messages: chat?.messages ?? [] })
  },
  deleteChat: (id) =>
    set((s) => ({ chats: s.chats.filter((c) => c.id !== id), currentChatId: null, messages: [] })),

  // Sidebar
  sidebarOpen: true,
  activeTab: 'chat',
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setActiveTab: (tab) => set({ activeTab: tab }),

  // IDE
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
  updateFile: (id, content) =>
    set((s) => ({ files: s.files.map((f) => f.id === id ? { ...f, content } : f) })),
  updateFileContent: (id, content) =>
    set((s) => ({ files: s.files.map((f) => f.id === id ? { ...f, content } : f) })),
  renameFile: (id, name) =>
    set((s) => ({ files: s.files.map((f) => f.id === id ? { ...f, name } : f) })),
  deleteFile: (id) => set((s) => ({ files: s.files.filter((f) => f.id !== id) })),
  setActiveFile: (id) => set({ activeFileId: id }),
  setFiles: (files) => set({ files }),
  openIDE: () => set({ ideOpen: true }),
  toggleIDE: () => set((s) => ({ ideOpen: !s.ideOpen })),
  setIdeTab: (tab) => set({ ideTab: tab }),
  setIDETab: (tab) => set({ ideTab: tab }),
  setExecuting: (v) => set({ isExecuting: v }),
  appendLiveCode: (chunk) => set((s) => ({ liveCode: s.liveCode + chunk })),
  addLiveCodeFile: (name) =>
    set((s) => ({ liveCodeFiles: s.liveCodeFiles.includes(name) ? s.liveCodeFiles : [...s.liveCodeFiles, name] })),
  clearLiveCode: () => set({ liveCode: '', liveCodeFiles: [] }),

  // Worklog
  worklog: [],
  addWorklogEntry: (entry) => {
    const id = crypto.randomUUID()
    set((s) => ({ worklog: [...s.worklog, { ...entry, id, timestamp: new Date() }] }))
    return id
  },
  updateWorklogEntry: (id, patch) =>
    set((s) => ({ worklog: s.worklog.map((e) => e.id === id ? { ...e, ...patch } : e) })),
  clearWorklog: () => set({ worklog: [] }),

  // WebContainer
  containerStatus: 'idle',
  previewUrl: null,
  terminalOutput: '',
  setContainerStatus: (s) => set({ containerStatus: s }),
  setPreviewUrl: (url) => set({ previewUrl: url }),
  appendTerminalOutput: (text) => set((s) => ({ terminalOutput: s.terminalOutput + text })),
  clearTerminalOutput: () => set({ terminalOutput: '' }),
}))
