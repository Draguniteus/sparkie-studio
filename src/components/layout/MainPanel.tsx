'use client'

import { useAppStore } from '@/store/appStore'
import { ChatView } from '@/components/chat/ChatView'
import { WelcomeView } from '@/components/chat/WelcomeView'
import { AssetsTab } from '@/components/ide/AssetsTab'
import { RadioPlayer } from '@/components/ide/RadioPlayer'

export function MainPanel() {
  const { currentChatId, activeTab } = useAppStore()

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-hive-600 relative">
      {/* RadioPlayer — always mounted so audio survives tab switches */}
      <div className={`absolute inset-0 flex flex-col ${activeTab === 'radio' ? 'z-10' : 'invisible pointer-events-none'}`}>
        <RadioPlayer />
      </div>

      {/* AssetsTab — always mounted so state (filters, scroll) survives tab switches */}
      <div className={`absolute inset-0 flex flex-col ${activeTab === 'assets' ? 'z-10' : 'invisible pointer-events-none'}`}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-hive-border shrink-0">
          <span className="text-sm font-semibold text-text-primary">Assets</span>
          <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded-full bg-hive-elevated border border-hive-border">Generated files</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <AssetsTab />
        </div>
      </div>

      {/* Chat / Welcome — shown when neither assets nor radio is active */}
      <div className={`absolute inset-0 flex flex-col ${activeTab !== 'radio' && activeTab !== 'assets' ? 'z-10' : 'invisible pointer-events-none'}`}>
        {currentChatId ? <ChatView /> : <WelcomeView />}
      </div>
    </div>
  )
}
