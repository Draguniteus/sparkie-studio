'use client'

import { useAppStore } from '@/store/appStore'
import { ChatView } from '@/components/chat/ChatView'
import { WelcomeView } from '@/components/chat/WelcomeView'

export function MainPanel() {
  const { currentChatId } = useAppStore()

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-hive-600">
      {currentChatId ? <ChatView /> : <WelcomeView />}
    </div>
  )
}
