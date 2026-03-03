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

export interface Message 