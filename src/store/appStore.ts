import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  model?: string
  attachments?: Attachment[]
  isStreaming?: boolean
  type?: 'text' | 'image' | 'video'
  imageUrl?: string
  imagePrompt?: string
}

export interface Attachment {
  id: string
  name: string
  type: 'image' | 'document' | 'code' | 'video' | 'audio'
  url?: string
  size?: number
}

export interface Chat {
  id: string
  title: string
  messages: Message[]
  model: string
  createdAt: number
  updatedAt: number
}

export interface FileNode {
  id: string
  name: string
  type: 'file' | 'folder'
  content?: string
  language?: string
  children?: FileNode[]
  parentId?: string
}

export interface WorklogEntry {
  id: string
  type: 'thinking' | 'action' | 'result' | 'error' | 'code'
  content: string
  timestamp: number
  duration?: number
  status?: 'running' | 'done' | 'error'
}

interface AppState {
  sidebarOpen: boolean
  ideOpen: boolean
  activeTab: 'chat' | 'images' | 'assets'
  ideTab: 'process' | 'files'
  chats: Chat[]
  currentChatId: string | null
  isStreaming: boolean
  selectedModel: string
  files: FileNode[]
  activeFileId: string | null
  previewMode: boolean
  worklog: WorklogEntry[]
  isExecuting: boolean
  liveCode: string
  liveCodeFiles: string[]

  toggleSidebar: () => void
  toggleIDE: () => void
  openIDE: () => void
  setActiveTab: (tab: 'chat' | 'images' | 'assets') => void
  setIDETab: (tab: 'process' | 'files') => void
  createChat: () => string
  deleteChat: (id: string) => void
  setCurrentChat: (id: string) => void
  addMessage: (chatId: string, message: Omit<Message, 'id' | 'timestamp'>) => string
  updateMessage: (chatId: string, messageId: string, updates: Partial<Message>) => void
  appendToMessage: (chatId: string, messageId: string, chunk: string) => void
  setStreaming: (streaming: boolean) => void
  setSelectedModel: (model: string) => void
  setActiveFile: (id: string | null) => void
  togglePreview: () => void
  addFile: (file: Omit<FileNode, 'id'> & { id?: string }) => string
  updateFileContent: (id: string, content: string) => void
  deleteFile: (id: string) => void
  renameFile: (id: string, name: string) => void
  addWorklogEntry: (entry: Omit<WorklogEntry, 'id' | 'timestamp'>) => string
  updateWorklogEntry: (id: string, updates: Partial<WorklogEntry>) => void
  clearWorklog: () => void
  setExecuting: (executing: boolean) => void
  setLiveCode: (code: string) => void
  appendLiveCode: (chunk: string) => void
  addLiveCodeFile: (name: string) => void
  clearLiveCode: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  sidebarOpen: true,
  ideOpen: false,
  activeTab: 'chat',
  ideTab: 'process',
  chats: [],
  currentChatId: null,
  isStreaming: false,
  selectedModel: 'minimax-m2.5-free',
  files: [],
  activeFileId: null,
  previewMode: false,
  worklog: [],
  isExecuting: false,
  liveCode: '',
  liveCodeFiles: [],

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleIDE: () => set((s) => ({ ideOpen: !s.ideOpen })),
  openIDE: () => set({ ideOpen: true }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setIDETab: (tab) => set({ ideTab: tab }),

  createChat: () => {
    const id = uuidv4()
    const chat: Chat = {
      id, title: 'New Chat', messages: [], model: get().selectedModel,
      createdAt: Date.now(), updatedAt: Date.now(),
    }
    set((s) => ({ chats: [chat, ...s.chats], currentChatId: id }))
    return id
  },

  deleteChat: (id) => set((s) => {
    const chats = s.chats.filter((c) => c.id !== id)
    return { chats, currentChatId: s.currentChatId === id ? (chats[0]?.id ?? null) : s.currentChatId }
  }),

  setCurrentChat: (id) => set({ currentChatId: id }),

  addMessage: (chatId, message) => {
    const msgId = uuidv4()
    set((s) => ({
      chats: s.chats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: [...chat.messages, { ...message, id: msgId, timestamp: Date.now() }],
              updatedAt: Date.now(),
              title: chat.messages.length === 0 && message.role === 'user'
                ? message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '')
                : chat.title,
            }
          : chat
      ),
    }))
    return msgId
  },

  updateMessage: (chatId, messageId, updates) => set((s) => ({
    chats: s.chats.map((chat) =>
      chat.id === chatId
        ? { ...chat, messages: chat.messages.map((msg) => msg.id === messageId ? { ...msg, ...updates } : msg) }
        : chat
    ),
  })),

  appendToMessage: (chatId, messageId, chunk) => set((s) => ({
    chats: s.chats.map((chat) =>
      chat.id === chatId
        ? { ...chat, messages: chat.messages.map((msg) => msg.id === messageId ? { ...msg, content: msg.content + chunk } : msg) }
        : chat
    ),
  })),

  setStreaming: (streaming) => set({ isStreaming: streaming }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  setActiveFile: (id) => set({ activeFileId: id }),
  togglePreview: () => set((s) => ({ previewMode: !s.previewMode })),

  addFile: (file) => {
    const id = file.id || uuidv4()
    set((s) => ({ files: [...s.files, { ...file, id }] }))
    return id
  },

  updateFileContent: (id, content) => set((s) => ({
    files: s.files.map((f) => (f.id === id ? { ...f, content } : f))
  })),

  deleteFile: (id) => set((s) => ({
    files: s.files.filter((f) => f.id !== id),
    activeFileId: s.activeFileId === id ? null : s.activeFileId,
  })),

  renameFile: (id, name) => set((s) => ({
    files: s.files.map((f) => (f.id === id ? { ...f, name } : f))
  })),

  addWorklogEntry: (entry) => {
    const id = uuidv4()
    set((s) => ({ worklog: [...s.worklog, { ...entry, id, timestamp: Date.now() }] }))
    return id
  },

  updateWorklogEntry: (id, updates) => set((s) => ({
    worklog: s.worklog.map((e) => (e.id === id ? { ...e, ...updates } : e))
  })),

  clearWorklog: () => set({ worklog: [] }),
  setExecuting: (executing) => set({ isExecuting: executing }),

  // Live code streaming state
  setLiveCode: (code) => set({ liveCode: code }),
  appendLiveCode: (chunk) => set((s) => ({ liveCode: s.liveCode + chunk })),
  addLiveCodeFile: (name) => set((s) => ({
    liveCodeFiles: s.liveCodeFiles.includes(name) ? s.liveCodeFiles : [...s.liveCodeFiles, name]
  })),
  clearLiveCode: () => set({ liveCode: '', liveCodeFiles: [] }),
}))
