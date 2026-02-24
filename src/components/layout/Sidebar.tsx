'use client'

import { useState } from 'react'
import { useAppStore } from '@/store/appStore'
import {
  Plus, Search, FolderOpen, Image, MessageSquare,
  Settings, ChevronLeft, ChevronDown, Trash2, Sparkles, Bot, Zap
} from 'lucide-react'

export function Sidebar() {
  const {
    sidebarOpen, toggleSidebar, chats, currentChatId,
    setCurrentChat, createChat, deleteChat, setActiveTab, activeTab, openSettings} = useAppStore()
  const [historyCollapsed, setHistoryCollapsed] = useState(false)

  if (!sidebarOpen) {
    return (
      <div className="w-[52px] h-full bg-hive-700 border-r border-hive-border flex flex-col items-center py-3 gap-2">
        <button
          onClick={toggleSidebar}
          className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-hive-hover text-text-secondary hover:text-honey-500 transition-colors"
          title="Expand sidebar"
        >
          <Sparkles size={20} />
        </button>
        <button
          onClick={() => createChat()}
          className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-hive-hover text-text-secondary hover:text-honey-500 transition-colors"
          title="New chat"
        >
          <Plus size={18} />
        </button>
      </div>
    )
  }

  return (
    <div className="w-[260px] h-full bg-hive-700 border-r border-hive-border flex flex-col shrink-0">
      {/* Header */}
      <div className="h-11 flex items-center justify-between px-3 border-b border-hive-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-honey-500/20 flex items-center justify-center">
            <Sparkles size={14} className="text-honey-500" />
          </div>
          <span className="font-semibold text-sm text-honey-500 tracking-tight">Sparkie Studio</span>
        </div>
        <button
          onClick={toggleSidebar}
          className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
      </div>

      {/* New Task Button */}
      <div className="p-3 shrink-0">
        <button
          onClick={() => { createChat(); setActiveTab('chat') }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-honey-500/10 border border-honey-500/30 text-honey-500 hover:bg-honey-500/20 transition-all text-sm font-medium"
        >
          <Plus size={15} />
          New Task
        </button>
      </div>

      {/* Quick Nav */}
      <div className="px-2 flex gap-0.5 shrink-0">
        {[
          { icon: Search, label: 'Search', key: 'search' as const },
          { icon: FolderOpen, label: 'Assets', key: 'assets' as const },
          { icon: Image, label: 'Gallery', key: 'images' as const },
        ].map(({ icon: Icon, label, key }) => (
          <button
            key={key}
            onClick={() => key !== 'search' && setActiveTab(key === 'images' ? 'images' : 'assets')}
            className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg transition-colors text-[10px] font-medium ${
              activeTab === key || (key === 'assets' && activeTab === 'assets')
                ? 'bg-honey-500/10 text-honey-500'
                : 'hover:bg-hive-hover text-text-muted hover:text-text-secondary'
            }`}
            title={label}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Experts Section */}
      <div className="px-3 mt-3 shrink-0">
        <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5 px-1">
          Experts
        </div>
        <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-hive-hover transition-colors group">
          <div className="w-7 h-7 rounded-lg bg-hive-elevated border border-hive-border flex items-center justify-center shrink-0 group-hover:border-honey-500/30 transition-colors">
            <Bot size={14} className="text-text-muted group-hover:text-honey-500 transition-colors" />
          </div>
          <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors flex-1 text-left">Explore Experts</span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-honey-500 text-black leading-tight">New</span>
        </button>
      </div>

      {/* Task History */}
      <div className="flex-1 overflow-y-auto mt-3 flex flex-col min-h-0">
        <button
          onClick={() => setHistoryCollapsed(!historyCollapsed)}
          className="flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider hover:text-text-secondary transition-colors w-full text-left shrink-0"
        >
          Task History
          <ChevronDown size={11} className={`ml-auto transition-transform duration-200 ${historyCollapsed ? '-rotate-90' : ''}`} />
        </button>

        {!historyCollapsed && (
          <div className="flex-1 overflow-y-auto px-2">
            {chats.length === 0 ? (
              <div className="px-3 py-8 text-center text-text-muted text-xs">
                No tasks yet.<br />Start a new task above.
              </div>
            ) : (
              chats.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => { setCurrentChat(chat.id); setActiveTab('chat') }}
                  className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer mb-0.5 transition-colors ${
                    currentChatId === chat.id
                      ? 'bg-honey-500/10 text-honey-500'
                      : 'text-text-secondary hover:bg-hive-hover hover:text-text-primary'
                  }`}
                >
                  <MessageSquare size={13} className="shrink-0" />
                  <span className="text-[13px] truncate flex-1">{chat.title}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteChat(chat.id) }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-hive-elevated transition-all"
                  >
                    <Trash2 size={11} className="text-text-muted hover:text-accent-error" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* User Profile */}
      <div className="p-3 border-t border-hive-border shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-honey-500/20 flex items-center justify-center text-honey-500 text-xs font-bold shrink-0">
            D
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate text-text-primary">Draguniteus</div>
            <div className="text-[10px] text-text-muted">Free</div>
          </div>
          <button onClick={openSettings} className="p-1.5 rounded-md hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors" title="Settings">
            <Settings size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
