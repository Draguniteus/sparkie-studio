import { create } from 'zustand'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  type?: 'text' | 'image' | 'video'
  imageUrl?: string
  imagePrompt?: string
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
  | 'idle'         // WebContainer not started
  | 'booting'      // WC.boot() in progress
  | 'mounting'     // Writing files to WC FS
  | 'installing'   // npm install running
  | 'starting'     // npm run dev / node running
  | 'ready'        // Dev server up, previewUrl set
  | 'error'        // Something failed

interface AppState {
  // Chat
  messages: Message[]
  isLoading: boolean
  addMessage: (msg: Message) => void
  appendToMessage: (id: string, content: string) => void
  clearMessages: () => void

  // IDE
  files: FileNode[]
  activeFileId: string | null
  ideOpen: boolean
  ideTab: IDETab
  isExecuting: boolean
  liveCode: string
  liveCodeFiles: string[]
  addFile: (file: Omit<FileNode, 'id'>) => string
  updateFile: (id: string, content: string) => void
  renameFile: (id: string, name: string) => void
  deleteFile: (id: string) => void
  setActiveFile: (id: string | null) => void
  setFiles: (files: FileNode[]) => void
  openIDE: () => void
  setIdeTab: (tab: IDETab) => void
  setExecuting: (v: boolean) => void
  appendLiveCode: (chunk: string) => void
  addLiveCodeFile: (name: string) => void
  clearLiveCode: () => void

  // Worklog
  worklog: WorklogEntry[]
  addWorklogEntry: (entry: Omit<WorklogEntry, 'id' | 'timestamp'>) => string
  updateWorklogEntry: (id: string, patch: Partial<WorklogEntry>) => void
  clearWorklog: () => void

  // WebContainer
  containerStatus: ContainerStatus
  previewUrl: string | null
  terminalOutput: string
  setContainerStatus: (s: ContainerStatus) => void
  setPreviewUrl: (url: string | null) => void
  appendTerminalOutput: (text: string) => void
  clearTerminalOutput: () => void
}

export const useAppStore = create<AppState>((set) => ({
  // Chat
  messages: [],
  isLoading: false,
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  appendToMessage: (id, content) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + content } : m
      ),
    })),
  clearMessages: () => set({ messages: [] }),

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
    set((s) => ({ files: s.files.map((f) => (f.id === id ? { ...f, content } : f)) })),
  renameFile: (id, name) =>
    set((s) => ({ files: s.files.map((f) => (f.id === id ? { ...f, name } : f)) })),
  deleteFile: (id) => set((s) => ({ files: s.files.filter((f) => f.id !== id) })),
  setActiveFile: (id) => set({ activeFileId: id }),
  setFiles: (files) => set({ files }),
  openIDE: () => set({ ideOpen: true }),
  setIdeTab: (tab) => set({ ideTab: tab }),
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
    set((s) => ({ worklog: s.worklog.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
  clearWorklog: () => set({ worklog: [] }),

  // WebContainer
  containerStatus: 'idle',
  previewUrl: null,
  terminalOutput: '',
  setContainerStatus: (s) => set({ containerStatus: s }),
  setPreviewUrl: (url) => set({ previewUrl: url }),
  appendTerminalOutput: (text) =>
    set((s) => ({ terminalOutput: s.terminalOutput + text })),
  clearTerminalOutput: () => set({ terminalOutput: '' }),
}))
