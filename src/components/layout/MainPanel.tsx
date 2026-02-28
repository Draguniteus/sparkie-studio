"use client"

import { useAppStore } from "@/store/appStore"
import { ChatView } from "@/components/chat/ChatView"
import { WelcomeView } from "@/components/chat/WelcomeView"
import { AssetsTab } from "@/components/ide/AssetsTab"
import { RadioPlayer } from "@/components/ide/RadioPlayer"
import { ConnectorsView } from "@/components/connectors/ConnectorsView"
import { SparkiesCorner } from "@/components/SparkiesCorner"
import { DreamJournal } from "@/components/DreamJournal"
import { SparkiesFeed } from "@/components/SparkiesFeed"
import { SkillsLibrary } from "@/components/SkillsLibrary"
import { WorklogPage } from "@/components/WorklogPage"

const ALL_NON_CHAT_TABS = ["radio","assets","connectors","corner","journal","feed","skills","worklog"]

export function MainPanel() {
  const { currentChatId, activeTab } = useAppStore()

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-hive-600 relative">
      {/* RadioPlayer — always mounted so audio survives tab switches */}
      <div className={`absolute inset-0 flex flex-col ${activeTab === "radio" ? "z-10" : "invisible pointer-events-none"}`}>
        <RadioPlayer />
      </div>

      {/* AssetsTab — always mounted so state survives tab switches */}
      <div className={`absolute inset-0 flex flex-col ${activeTab === "assets" ? "z-10" : "invisible pointer-events-none"}`}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-hive-border shrink-0">
          <span className="text-sm font-semibold text-text-primary">Assets</span>
          <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded-full bg-hive-elevated border border-hive-border">Generated files</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <AssetsTab />
        </div>
      </div>

      {/* Connectors Marketplace */}
      <div className={`absolute inset-0 flex flex-col ${activeTab === "connectors" ? "z-10" : "invisible pointer-events-none"}`}>
        <ConnectorsView />
      </div>

      {/* Sparkie's Corner */}
      <div className={`absolute inset-0 flex flex-col ${activeTab === "corner" ? "z-10" : "invisible pointer-events-none"}`}>
        <SparkiesCorner />
      </div>

      {/* Dream Journal */}
      <div className={`absolute inset-0 flex flex-col ${activeTab === "journal" ? "z-10" : "invisible pointer-events-none"}`}>
        <DreamJournal />
      </div>

      {/* Sparkie's Feed */}
      <div className={`absolute inset-0 flex flex-col ${activeTab === "feed" ? "z-10" : "invisible pointer-events-none"}`}>
        <SparkiesFeed />
      </div>

      {/* Skills Library */}
      <div className={`absolute inset-0 flex flex-col ${activeTab === "skills" ? "z-10" : "invisible pointer-events-none"}`}>
        <SkillsLibrary />
      </div>

      {/* AI Work Log */}
      <div className={`absolute inset-0 flex flex-col ${activeTab === "worklog" ? "z-10" : "invisible pointer-events-none"}`}>
        <WorklogPage />
      </div>

      {/* Chat / Welcome */}
      <div className={`absolute inset-0 flex flex-col ${!ALL_NON_CHAT_TABS.includes(activeTab) ? "z-10" : "invisible pointer-events-none"}`}>
        {currentChatId ? <ChatView /> : <WelcomeView />}
      </div>
    </div>
  )
}
