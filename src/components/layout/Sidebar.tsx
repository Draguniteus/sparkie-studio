'use client'

import { useAppStore } from '@/store/appStore'
import {
  Plus, Search, FolderOpen, Image, MessageSquare,
  Settings, ChevronLeft, Trash2, Sparkles
} from 'lucide-react'

export function Sidebar() {
  const {
    sidebarOpen, toggleSidebar, chats, currentChatId,
    setCurrentChat, createChat, deleteChat, setActiveTab, activeTab
  } = useAppStore()

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
      <div className="p-3 flex items-center justify-between border-b border-hive-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-honey-500/20 flex items-center justify-center">
            <Sparkles size={16} className="text-honey-500" />
          </div>
          <span className="font-semibold text-sm text-honey-500">Sparkie Studio</span>
        </div>
        <button
          onClick={toggleSidebar}
          className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <button
          onClick={() => createChat()}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-honey-500/10 border border-honey-500/20 text-honey-500 hover:bg-honey-500/20 transition-all text-sm font-medium"
        >
          <Plus size={16} />
          New Chat
        </button>
      </div>

      {/* Quick Nav */}
      <div className="px-3 flex gap-1">
        {[
          { icon: Search, label: 'Search', key: 'search' as const },
          { icon: FolderOpen, label: 'Assets', key: 'assets' as const },
          { icon: Image, label: 'Gallery', key: 'images' as const },
        ].map(({ icon: Icon, label, key }) => (
          <button
            key={key}
            onClick={() => key !== 'search' && setActiveTab(key === 'images' ? 'images' : 'assets')}
            className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors text-[10px]"
            title={label}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto mt-2 px-2">
        <div className="px-2 py-1.5 text-[11px] font-medium text-text-muted uppercase tracking-wider">
          Recent
        </div>
        {chats.length === 0 ? (
          <div className="px-3 py-8 text-center text-text-muted text-xs">
            No conversations yet.<br />Start a new task above.
          </div>
        ) : (
          chats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => setCurrentChat(chat.id)}
              className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer mb-0.5 transition-colors ${
                currentChatId === chat.id
                  ? 'bg-honey-500/10 text-honey-500'
                  : 'text-text-secondary hover:bg-hive-hover hover:text-text-primary'
              }`}
            >
              <MessageSquare size={14} className="shrink-0" />
              <span className="text-sm truncate flex-1">{chat.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-hive-elevated transition-all"
              >
                <Trash2 size={12} className="text-text-muted hover:text-accent-error" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* User Profile */}
      <div className="p-3 border-t border-hive-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-honey-500/20 flex items-center justify-center text-honey-500 text-xs font-bold">
            D
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">Draguniteus</div>
            <div className="text-[11px] text-text-muted">Free</div>
          </div>
          <button className="p-1.5 rounded-md hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors">
            <Settings size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
