import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// Debounced localStorage: batches writes so streaming tokens don't hammer storage
function createDebouncedStorageBackend(delay = 1000) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingKey: string | null = null
  let pendingValue: string | null = null

  return {
    getItem: (name: string) => {
      if (typeof window === 'undefined') return null
      return localStorage.getItem(name)
    },
    setItem: (name: string, value: string) => {
      if (typeof window === 'undefined') return
      pendingKey = name
      pendingValue = value
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        if (pendingKey !== null && pendingValue !== null) {
          try { localStorage.setItem(pendingKey, pendingValue) } catch {}
          pendingKey = null
          pendingValue = null
        }
        timer = null
      }, delay)
    },
    removeItem: (name: string) => {
      if (typeof window === 'undefined') return
      if (timer) clearTimeout(timer)
      try { localStorage.removeItem(name) } catch {}
    },
  }
}

export interface BuildCardData {
  title: string           // derived project name (e.g. "ai-tools-directory")
  files: string[]         // list of created file names
  fileCount: number       // total files created
  languages: string[]     // unique languages (e.g. ['html', 'css', 'javascript'])
  isEdit: boolean         // was this an edit or a fresh build
}

export interface PendingTask {
  id: string
  action: string
  label: string
  payload: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected'
  emailDraft?: { subject?: string; to?: string; body?: string }
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  type?: 'text' | 'image' | 'video' | 'build_card' | 'music' | 'speech'
  imageUrl?: string
  imagePrompt?: string
  model?: string
  isStreaming?: boolean
  buildCard?: BuildCardData  // only present when type === 'build_card'
  pendingTask?: PendingTask  // only present for HITL approval messages
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

/** Recursively find a FileNode by id anywhere in the tree */
export function findNodeById(nodes: FileNode[], id: string): FileNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children?.length) {
      const found = findNodeById(node.children, id)
      if (found) return found
    }
  }
  return undefined
}

/** Flatten a FileNode tree into leaf file nodes only (excludes folders/archives) */
export function flattenFileTree(nodes: FileNode[]): FileNode[] {
  return nodes.flatMap(n =>
    n.type === 'folder' || n.type === 'archive'
      ? flattenFileTree(n.children ?? [])
      : [n]
  )
}
export interface UserProfile {
  name: string            // what to call the user
  role: string            // e.g. "indie developer", "designer", "student"
  goals: string           // what they're building / main use case
  style: string           // coding style preference: "commented", "minimal", "production"
  experience: string      // "beginner" | "intermediate" | "expert"
  completedAt: string     // ISO timestamp of when onboarding was completed
}



export type AssetType = 'website' | 'document' | 'image' | 'audio' | 'video' | 'excel' | 'ppt' | 'other'
export type AssetSource = 'agent' | 'user'

export interface Asset {
  id: string
  name: string
  language: string
  content: string
  chatId: string
  chatTitle: string
  createdAt: Date
  fileId: string  // references FileNode id
  assetType: AssetType   // for category filter
  source: AssetSource    // 'agent' | 'user'
}

export type WorklogEntry = {
  id: string
  type: string
  content: string
  timestamp: Date
  created_at?: string
  metadata?: Record<string, unknown>
  status?: 'running' | 'done' | 'blocked' | 'anomaly' | 'skipped' | 'error'
  decision_type?: 'action' | 'skip' | 'hold' | 'escalate' | 'proactive'
  reasoning?: string
  estimated_duration_ms?: number
  actual_duration_ms?: number
  signal_priority?: 'P0' | 'P1' | 'P2' | 'P3'
  duration?: number
  confidence?: number
}

export type IDETab = 'process' | 'files' | 'terminal' | 'worklog' | 'tasks' | 'memory' | 'real'

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
  getOrCreateSingleChat: () => string
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
  longTaskLabel: string | null   // 'In memory:...' chip text; null = hidden
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
  setLongTaskLabel: (label: string | null) => void
  appendLiveCode: (chunk: string) => void
  addLiveCodeFile: (name: string) => void
  clearLiveCode: () => void
  worklog: WorklogEntry[]
  addWorklogEntry: (entry: Omit<WorklogEntry, 'id' | 'timestamp'>) => string
  updateWorklogEntry: (id: string, patch: Partial<WorklogEntry>) => void
  clearWorklog: () => void

  assets: Asset[]
  addAsset: (asset: Omit<Asset, 'id' | 'createdAt'>) => void
  updateAsset: (fileId: string, content: string) => void
  clearAssets: () => void
  removeAsset: (id: string) => void
  containerStatus: ContainerStatus
  previewUrl: string | null
  terminalOutput: string
  setContainerStatus: (s: ContainerStatus) => void
  setPreviewUrl: (url: string | null) => void
  appendTerminalOutput: (text: string) => void
  clearTerminalOutput: () => void

  // User memory profile
  userProfile: UserProfile | null
  onboardingDone: boolean
  setUserProfile: (profile: UserProfile) => void
  updateUserProfile: (patch: Partial<UserProfile>) => void
  dismissOnboarding: () => void
  settingsOpen: boolean
  openSettings: () => void
  closeSettings: () => void
  lastMode: 'chat' | 'build'
  setLastMode: (mode: 'chat' | 'build') => void
  hydrateFromStorage: () => void
  // Avatar
  userAvatarUrl: string | null
  setUserAvatarUrl: (url: string | null) => void
}

export const useAppStore = create<AppState>()(persist((set, get) => ({
  messages: [],
  chats: [],
  currentChatId: null,
  isLoading: false,
  isStreaming: false,
  selectedModel: 'minimax-m2.5-free',
  lastMode: 'chat' as const,

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

  appendToMessage: (id, content) => {
    const s = get()
    const chatIdx = s.chats.findIndex(c => c.messages.some(m => m.id === id))
    if (chatIdx < 0) return
    set((st) => {
      const newChats = [...st.chats]
      const chat = newChats[chatIdx]
      newChats[chatIdx] = { ...chat, messages: chat.messages.map((m) => m.id === id ? { ...m, content: m.content + content } : m) }
      return { chats: newChats, messages: st.messages.map((m) => m.id === id ? { ...m, content: m.content + content } : m) }
    })
  },

  updateMessage: (chatIdOrId, idOrPatch, patch) => {
    if (patch !== undefined) {
      const msgId = idOrPatch as string
      // Guard: skip if nothing changed
      const s0 = get()
      const chat0 = s0.chats.find(c => c.id === chatIdOrId)
      const msg0 = chat0?.messages.find(m => m.id === msgId)
      if (msg0) {
        const keys = Object.keys(patch) as Array<keyof typeof patch>
        if (keys.every(k => (msg0 as unknown as Record<string, unknown>)[k] === (patch as unknown as Record<string, unknown>)[k])) return
      }
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
  setLastMode: (mode) => set({ lastMode: mode }),

  createChat: () => {
    // In single-chat mode: always return the one persistent chat
    return get().getOrCreateSingleChat()
  },

  getOrCreateSingleChat: () => {
    const existing = get().chats[0]
    if (existing) {
      // Make sure it's the current chat
      if (get().currentChatId !== existing.id) {
        set({ currentChatId: existing.id, messages: existing.messages, files: existing.files ?? [] })
      }
      return existing.id
    }
    // First ever session — create the one and only chat
    const id = crypto.randomUUID()
    try { localStorage.setItem('sparkie_single_chat_id', id) } catch {}
    set((s) => ({
      chats: [{ id, title: 'Sparkie', messages: [], createdAt: new Date(), files: [] }],
      currentChatId: id,
      messages: [],
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
  longTaskLabel: null,
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
  setLongTaskLabel: (label) => set({ longTaskLabel: label }),
  appendLiveCode: (chunk) => set((s) => ({ liveCode: s.liveCode + chunk })),
  addLiveCodeFile: (name) =>
    set((s) => ({ liveCodeFiles: s.liveCodeFiles.includes(name) ? s.liveCodeFiles : [...s.liveCodeFiles, name] })),
  clearLiveCode: () => set({ liveCode: '', liveCodeFiles: [] }),

  assets: [],
  addAsset: (asset) => {
    const id = crypto.randomUUID()
    const full = { ...asset, assetType: asset.assetType ?? 'other', source: asset.source ?? 'agent', id, createdAt: new Date() }
    set((s) => ({ assets: [full, ...s.assets] }))
    // Fire-and-forget persist to DB (no-op if not logged in)
    fetch('/api/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: full.name,
        content: full.content,
        assetType: full.assetType,
        source: full.source,
        chatId: full.chatId,
        chatTitle: full.chatTitle,
        fileId: full.fileId,
        language: full.language ?? '',
      }),
    }).catch(() => {})
  },
  updateAsset: (fileId, content) => {
    set((s) => ({
      assets: s.assets.map(a => a.fileId === fileId ? { ...a, content } : a)
    }))
  },
  clearAssets: () => {
    set({ assets: [] })
    // Clear from DB too
    fetch('/api/assets', { method: 'DELETE' }).catch(() => {})
  },
  removeAsset: (id) => {
    set((s) => ({ assets: s.assets.filter(a => a.id !== id) }))
    fetch('/api/assets?id=' + encodeURIComponent(id), { method: 'DELETE' }).catch(() => {})
  },

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

  // User memory profile — read localStorage at store creation for instant hydration (no flash)
  userProfile: ((): UserProfile | null => {
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem('sparkie_user_profile')
      return raw ? JSON.parse(raw) as UserProfile : null
    } catch { return null }
  })(),
  onboardingDone: typeof window !== 'undefined' && localStorage.getItem('sparkie_onboarding_done') === 'true',
  setUserProfile: (profile) => {
    try { localStorage.setItem('sparkie_user_profile', JSON.stringify(profile)) } catch {}
    try { localStorage.setItem('sparkie_onboarding_done', 'true') } catch {}
    set({ userProfile: profile, onboardingDone: true })
  },
  updateUserProfile: (patch) => set((s) => {
    const updated = s.userProfile ? { ...s.userProfile, ...patch } : null
    try { if (updated) localStorage.setItem('sparkie_user_profile', JSON.stringify(updated)) } catch {}
    return { userProfile: updated }
  }),
  // Avatar URL (loaded from DB on settings open)
  userAvatarUrl: null,
  setUserAvatarUrl: (url) => set({ userAvatarUrl: url }),
  settingsOpen: false,
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  dismissOnboarding: () => {
    try { localStorage.setItem('sparkie_onboarding_done', 'true') } catch {}
    set({ onboardingDone: true })
  },
  hydrateFromStorage: () => {
    // Call this from useEffect (client-side only) to load persisted state after mount
    try {
      const profileRaw = localStorage.getItem('sparkie_user_profile')
      const done = localStorage.getItem('sparkie_onboarding_done') === 'true'
      const profile = profileRaw ? JSON.parse(profileRaw) as UserProfile : null
      if (profile || done) set({ userProfile: profile, onboardingDone: done })
    } catch {}
    // Initialize the single persistent chat, then load history from DB
    setTimeout(async () => {
      const chatId = get().getOrCreateSingleChat()
      try {
        const res = await fetch('/api/messages')
        if (res.ok) {
          const { messages } = await res.json() as { messages: Message[] }
          if (messages && messages.length > 0) {
            set((s) => ({
              chats: s.chats.map((c) =>
                c.id === chatId ? { ...c, messages } : c
              ),
              messages,
            }))
          }
        }
      } catch { /* history load failed — start fresh */ }
      // Load persisted assets from DB
      try {
        const ar = await fetch('/api/assets')
        if (ar.ok) {
          const { assets } = await ar.json() as { assets: Asset[] }
          if (assets && assets.length > 0) {
            set({ assets: assets.map(a => ({ ...a, createdAt: new Date(a.createdAt) })) })
          }
        }
      } catch { /* assets load failed — start fresh */ }
    }, 0)
  },
}),
  {
    name: 'sparkie-chat-v1',
    storage: createJSONStorage(() => createDebouncedStorageBackend(800)), // Debounced: max 1 write/800ms — prevents per-token localStorage blocking
    // Only persist the chat history — not UI state, IDE state, worklog, etc.
    partialize: (s) => ({
      chats: s.chats.map(c => ({
        ...c,
        // Ensure Date survives JSON serialization
        createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
        messages: c.messages.filter(m => !m.isStreaming),
      })),
      currentChatId: s.currentChatId,
    }),
    // Revive Date objects on hydration
    merge: (persisted: unknown, current) => {
      const p = persisted as Partial<typeof current> | null
      if (!p) return current
      return {
        ...current,
        ...p,
        chats: (p.chats ?? []).map((c: Chat) => ({
          ...c,
          createdAt: c.createdAt ? new Date(c.createdAt as unknown as string) : new Date(),
        })),
      }
    },
  }
))
