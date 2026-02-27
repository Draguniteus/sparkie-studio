import { create } from 'zustand'

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
  type: 'thinking' | 'action' | 'result' | 'error' | 'code'
  content: string
  timestamp: Date
  status?: 'running' | 'done' | 'error'
  duration?: number
}

export type IDETab = 'process' | 'files' | 'terminal' | 'worklog' | 'tasks'

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
  updateAsset: (fileId: string, content: string) => void
  clearAssets: () => void
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

export const useAppStore = create<AppState>((set, get) => ({
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
    set((s) => ({ assets: [...s.assets, { ...asset, assetType: asset.assetType ?? 'other', source: asset.source ?? 'agent', id, createdAt: new Date() }] }))
  },
  updateAsset: (fileId, content) => {
    set((s) => ({
      assets: s.assets.map(a => a.fileId === fileId ? { ...a, content } : a)
    }))
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

  // User memory profile — SSR-safe: always start null/false, hydrate client-side via useEffect
  userProfile: null,
  onboardingDone: false,
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
    // Auto-initialize single persistent chat
    setTimeout(() => { get().getOrCreateSingleChat() }, 0)
  },
}))