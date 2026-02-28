'use client'

import { useAppStore } from '@/store/appStore'
import {
  Search, FolderOpen, Image, MessageSquare,
  Settings, ChevronLeft, Sparkles, Radio, Plug, Zap, Lock, Rss, BookOpen, Brain
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export function Sidebar() {
  const {
    sidebarOpen, toggleSidebar,
    setActiveTab, activeTab, openSettings,
    userAvatarUrl, getOrCreateSingleChat, setCurrentChat,
    worklog,
  } = useAppStore()
  const { user, signOut } = useAuth()

  const displayName = user?.name ?? user?.email?.split('@')[0] ?? 'User'
  const avatarInitial = displayName.charAt(0).toUpperCase()

  const handleOpenChat = () => {
    const id = getOrCreateSingleChat()
    setCurrentChat(id)
    setActiveTab('chat')
  }

  const NAV_ITEMS = [
    { icon: MessageSquare, label: 'Chat',    key: 'chat',       action: handleOpenChat },
    { icon: FolderOpen,    label: 'Assets',  key: 'assets',     action: () => setActiveTab('assets') },
    { icon: Rss,           label: 'Feed',    key: 'feed',       action: () => setActiveTab('feed') },
    { icon: Radio,         label: 'Radio',   key: 'radio',      action: () => setActiveTab('radio') },
    { icon: BookOpen,      label: 'Skills',  key: 'skills',     action: () => setActiveTab('skills') },
    { icon: Plug,          label: 'Apps',    key: 'connectors', action: () => setActiveTab('connectors') },
    { icon: Brain,         label: 'Log',     key: 'worklog',    action: () => setActiveTab('worklog') },
  ]

  // ── Mobile bottom nav ────────────────────────────────────────────────────────
  // Rendered on small screens via the md:hidden wrapper in page.tsx
  const isMobileNav = typeof window !== 'undefined' && window.innerWidth < 768

  // Mobile bottom nav — fixed, full-width, icon bar
  const MobileBottomNav = () => (
    <nav className="fixed bottom-0 left-0 right-0 z-50 h-[60px] bg-hive-700 border-t border-hive-border flex items-center justify-around px-2 md:hidden">
      {NAV_ITEMS.map(({ icon: Icon, label, key, action }) => (
        <button
          key={key}
          onClick={action}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-[44px] min-h-[44px] justify-center ${
            (key === 'chat' && !['assets','images','radio','connectors','corner','journal','feed','skills','worklog'].includes(activeTab)) || activeTab === key
              ? 'text-honey-500'
              : 'text-text-muted'
          }`}
        >
          <Icon size={20} />
          <span className="text-[9px] font-medium">{label}</span>
        </button>
      ))}
      <button
        onClick={openSettings}
        className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors text-text-muted min-w-[44px] min-h-[44px] justify-center"
      >
        {userAvatarUrl ? (
          <img src={userAvatarUrl} alt={displayName} className="w-6 h-6 rounded-full object-cover border border-hive-border" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-honey-500/20 flex items-center justify-center text-honey-500 text-[10px] font-bold">
            {avatarInitial}
          </div>
        )}
        <span className="text-[9px] font-medium">You</span>
      </button>
    </nav>
  )

  // ── Desktop collapsed sidebar ────────────────────────────────────────────────
  if (!sidebarOpen) {
    return (
      <>
        <div className="hidden md:flex w-[52px] h-full bg-hive-700 border-r border-hive-border flex-col items-center py-3 gap-2">
          <button
            onClick={toggleSidebar}
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-hive-hover text-text-secondary hover:text-honey-500 transition-colors"
            title="Expand sidebar"
          >
            <Sparkles size={20} />
          </button>
          <button
            onClick={handleOpenChat}
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-hive-hover text-text-secondary hover:text-honey-500 transition-colors"
            title="Chat with Sparkie"
          >
            <MessageSquare size={18} />
          </button>
        </div>
        <MobileBottomNav />
      </>
    )
  }

  // Last 6 worklog entries reversed (most recent first)
  const recentActivity = [...worklog].reverse().slice(0, 6)

  // ── Desktop expanded sidebar ─────────────────────────────────────────────────
  return (
    <>
      <div className="hidden md:flex w-[260px] h-full bg-hive-700 border-r border-hive-border flex-col shrink-0">
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

        {/* Sparkie Chat — persistent single entry point */}
        <div className="p-3 shrink-0">
          <button
            onClick={handleOpenChat}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all border font-medium text-sm ${
              !['assets','images','radio','connectors','corner','journal','feed','skills','worklog'].includes(activeTab)
                ? 'bg-honey-500/15 border-honey-500/40 text-honey-500 shadow-[0_0_12px_-4px_rgba(245,158,11,0.4)]'
                : 'bg-hive-elevated border-hive-border text-text-secondary hover:bg-hive-hover hover:text-honey-400 hover:border-honey-500/20'
            }`}
          >
            <div className="w-7 h-7 rounded-lg bg-honey-500/20 flex items-center justify-center shrink-0">
              <MessageSquare size={14} className="text-honey-500" />
            </div>
            <div className="flex flex-col items-start gap-0 flex-1 min-w-0">
              <span>Chat with Sparkie</span>
              <span className="text-[10px] font-normal text-text-muted">Always here</span>
            </div>
            <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" title="Active" />
          </button>
        </div>

        {/* Quick Nav */}
        <div className="px-2 flex gap-0.5 shrink-0">
          {[
            { icon: Search,     label: 'Search',  key: 'search'     },
            { icon: FolderOpen, label: 'Assets',  key: 'assets'     },
            { icon: Image,      label: 'Gallery', key: 'images'     },
            { icon: Radio,      label: 'Radio',   key: 'radio'      },
            { icon: Plug,       label: 'Apps',    key: 'connectors' },
            { icon: Rss,        label: 'Feed',    key: 'feed'       },
            { icon: BookOpen,   label: 'Skills',  key: 'skills'     },
            { icon: Brain,     label: 'Log',     key: 'worklog'    },
          ].map(({ icon: Icon, label, key }) => (
            <button
              key={key}
              onClick={() => key !== 'search' && setActiveTab(key as string)}
              className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg transition-colors text-[10px] font-medium ${
                activeTab === key
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

        {/* Sparkie's Space */}
        <div className="px-3 mt-3 shrink-0 flex flex-col gap-1.5">
          <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-0.5 px-1">
            Sparkie's Space
          </div>
          <button
            onClick={() => setActiveTab('corner')}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all group ${activeTab === 'corner' ? 'bg-honey-500/10 border border-honey-500/20' : 'hover:bg-hive-hover border border-transparent'}`}
          >
            <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${activeTab === 'corner' ? 'bg-honey-500/20 border-honey-500/40' : 'bg-hive-elevated border-hive-border group-hover:border-honey-500/30'}`}>
              <Sparkles size={14} className={activeTab === 'corner' ? 'text-honey-500' : 'text-text-muted group-hover:text-honey-500 transition-colors'} />
            </div>
            <span className={`text-sm transition-colors flex-1 text-left ${activeTab === 'corner' ? 'text-honey-500 font-medium' : 'text-text-secondary group-hover:text-text-primary'}`}>Sparkie's Corner</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/30 text-violet-300 leading-tight border border-violet-500/20">✦</span>
          </button>
          <button
            onClick={() => setActiveTab('journal')}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all group ${activeTab === 'journal' ? 'bg-violet-500/10 border border-violet-500/20' : 'hover:bg-hive-hover border border-transparent'}`}
          >
            <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${activeTab === 'journal' ? 'bg-violet-500/20 border-violet-500/40' : 'bg-hive-elevated border-hive-border group-hover:border-violet-500/30'}`}>
              <Zap size={14} className={activeTab === 'journal' ? 'text-violet-400' : 'text-text-muted group-hover:text-violet-400 transition-colors'} />
            </div>
            <span className={`text-sm transition-colors flex-1 text-left ${activeTab === 'journal' ? 'text-violet-300 font-medium' : 'text-text-secondary group-hover:text-text-primary'}`}>Dream Journal</span>
            <Lock size={11} className="text-text-muted shrink-0" />
          </button>
        </div>

        {/* Live Activity */}
        <div className="flex-1 overflow-y-auto mt-3 flex flex-col min-h-0 px-3">
          <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
            <span>Live Activity</span>
            {recentActivity.length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            )}
          </div>
          {recentActivity.length === 0 ? (
            <div className="px-1 py-4 text-center text-text-muted text-xs">
              Sparkie's activity will appear here as she works.
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {recentActivity.map((entry) => (
                <div key={entry.id} className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-hive-elevated/50">
                  <span className={`mt-0.5 text-[9px] shrink-0 ${
                    entry.type === 'error' ? 'text-red-400' :
                    entry.type === 'result' ? 'text-green-400' :
                    entry.type === 'code' ? 'text-honey-500' :
                    entry.type === 'action' ? 'text-blue-400' : 'text-text-muted'
                  }`}>
                    {entry.type === 'thinking' ? '◌' :
                     entry.type === 'action' ? '⚡' :
                     entry.type === 'result' ? '✓' :
                     entry.type === 'error' ? '✕' :
                     entry.type === 'code' ? '{}' : '·'}
                  </span>
                  <span className="text-[11px] text-text-secondary truncate">{entry.content.slice(0, 60)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="p-3 border-t border-hive-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-hive-border">
              {userAvatarUrl ? (
                <img src={userAvatarUrl} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-honey-500/20 flex items-center justify-center text-honey-500 text-xs font-bold">
                  {avatarInitial}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate text-text-primary">{displayName}</div>
              <div className="text-[10px] text-text-muted">Free</div>
            </div>
            <button onClick={openSettings} className="p-1.5 rounded-md hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors" title="Settings">
              <Settings size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Always render mobile bottom nav */}
      <MobileBottomNav />
    </>
  )
}
