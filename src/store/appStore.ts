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

interface AppState {
  // UI State
  sidebarOpen: boolean
  ideOpen: boolean
  activeTab: 'chat' | 'images' | 'assets'
  ideTab: 'process' | 'files'

  // Chat State
  chats: Chat[]
  currentChatId: string | null
  isStreaming: boolean
  selectedModel: string

  // IDE State
  files: FileNode[]
  activeFileId: string | null
  previewMode: boolean

  // Actions - UI
  toggleSidebar: () => void
  toggleIDE: () => void
  setActiveTab: (tab: 'chat' | 'images' | 'assets') => void
  setIDETab: (tab: 'process' | 'files') => void

  // Actions - Chat
  createChat: () => string
  deleteChat: (id: string) => void
  setCurrentChat: (id: string) => void
  addMessage: (chatId: string, message: Omit<Message, 'id' | 'timestamp'>) => void
  updateMessage: (chatId: string, messageId: string, content: string) => void
  setStreaming: (streaming: boolean) => void
  setSelectedModel: (model: string) => void

  // Actions - IDE
  setActiveFile: (id: string | null) => void
  togglePreview: () => void
  addFile: (file: FileNode) => void
  updateFileContent: (id: string, content: string) => void
  deleteFile: (id: string) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial UI State
  sidebarOpen: true,
  ideOpen: false,
  activeTab: 'chat',
  ideTab: 'process',

  // Initial Chat State
  chats: [],
  currentChatId: null,
  isStreaming: false,
  selectedModel: 'deepseek/deepseek-chat-v3-0324:free',

  // Initial IDE State
  files: [],
  activeFileId: null,
  previewMode: false,

  // UI Actions
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleIDE: () => set((s) => ({ ideOpen: !s.ideOpen })),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setIDETab: (tab) => set({ ideTab: tab }),

  // Chat Actions
  createChat: () => {
    const id = uuidv4()
    const chat: Chat = {
      id,
      title: 'New Chat',
      messages: [],
      model: get().selectedModel,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set((s) => ({
      chats: [chat, ...s.chats],
      currentChatId: id,
    }))
    return id
  },

  deleteChat: (id) => set((s) => {
    const chats = s.chats.filter((c) => c.id !== id)
    return {
      chats,
      currentChatId: s.currentChatId === id ? (chats[0]?.id ?? null) : s.currentChatId,
    }
  }),

  setCurrentChat: (id) => set({ currentChatId: id }),

  addMessage: (chatId, message) => set((s) => ({
    chats: s.chats.map((chat) =>
      chat.id === chatId
        ? {
            ...chat,
            messages: [...chat.messages, { ...message, id: uuidv4(), timestamp: Date.now() }],
            updatedAt: Date.now(),
            title: chat.messages.length === 0 && message.role === 'user'
              ? message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '')
              : chat.title,
          }
        : chat
    ),
  })),

  updateMessage: (chatId, messageId, content) => set((s) => ({
    chats: s.chats.map((chat) =>
      chat.id === chatId
        ? {
            ...chat,
            messages: chat.messages.map((msg) =>
              msg.id === messageId ? { ...msg, content } : msg
            ),
          }
        : chat
    ),
  })),

  setStreaming: (streaming) => set({ isStreaming: streaming }),
  setSelectedModel: (model) => set({ selectedModel: model }),

  // IDE Actions
  setActiveFile: (id) => set({ activeFileId: id }),
  togglePreview: () => set((s) => ({ previewMode: !s.previewMode })),

  addFile: (file) => set((s) => ({ files: [...s.files, file] })),

  updateFileContent: (id, content) => set((s) => ({
    files: s.files.map((f) => (f.id === id ? { ...f, content } : f)),
  })),

  deleteFile: (id) => set((s) => ({
    files: s.files.filter((f) => f.id !== id),
    activeFileId: s.activeFileId === id ? null : s.activeFileId,
  })),
}))
