'use client'

import { useAppStore } from '@/store/appStore'
import { ChatView } from '@/components/chat/ChatView'
import { WelcomeView } from '@/components/chat/WelcomeView'
import { AssetsTab } from '@/components/ide/AssetsTab'
import { RadioPlayer } from '@/components/ide/RadioPlayer'

export function MainPanel() {
  const { currentChatId, activeTab } = useAppStore()

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-hive-600 relative overflow-hidden">
      {/* Radio — always mounted so audio keeps playing when you switch tabs */}
      <div className={`absolute inset-0 flex flex-col ${activeTab === 'radio' ? '' : 'pointer-events-none invisible'}`}>
        <RadioPlayer />
      </div>

      {/* Assets */}
      {activeTab === 'assets' && (
        <div className="flex-1 flex flex-col min-w-0 h-full">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-hive-border">
            <span className="text-sm font-semibold text-text-primary">Assets</span>
            <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded-full bg-hive-elevated border border-hive-border">Generated files</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <AssetsTab />
          </div>
        </div>
      )}

      {/* Chat / Welcome */}
      {activeTab !== 'assets' && activeTab !== 'radio' && (
        <div className="flex-1 flex flex-col min-w-0 h-full">
          {currentChatId ? <ChatView /> : <WelcomeView />}
        </div>
      )}
    </div>
  )
}
