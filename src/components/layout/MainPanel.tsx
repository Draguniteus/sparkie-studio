"use client"

import { useAppStore } from "@/store/appStore"
import { useShallow } from "zustand/react/shallow"
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
  const { currentChatId, activeTab } = useAppStore(
    useShallow((s) => ({ currentChatId: s.currentChatId, activeTab: s.activeTab }))
  )

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-hive-600 relative">
      {/* RadioPlayer — always mounted so audio survives tab switches */}
      <div className={`absolute inset-0 flex flex-col ${activeTab === "radio" ? "z-10" : "invisible pointer-events-none"}`}>
        <RadioPlayer />
      </div>

      {/* AssetsTab — lazy-mounted: only when active (unmounts when hidden → no background state/subscriptions) */}
      {activeTab === "assets" && (
        <div className="absolute inset-0 z-10 flex flex-col">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-hive-border shrink-0">
            <span className="text-sm font-semibold text-text-primary">Assets</span>
            <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded-full bg-hive-elevated border border-hive-border">Generated files</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <AssetsTab />
          </div>
        </div>
      )}

      {/* Connectors Marketplace — lazy-mounted */}
      {activeTab === "connectors" && (
        <div className="absolute inset-0 z-10 flex flex-col">
          <ConnectorsView />
        </div>
      )}

      {/* Sparkie's Corner — lazy-mounted */}
      {activeTab === "corner" && (
        <div className="absolute inset-0 z-10 flex flex-col">
          <SparkiesCorner />
        </div>
      )}

      {/* Dream Journal — lazy-mounted */}
      {activeTab === "journal" && (
        <div className="absolute inset-0 z-10 flex flex-col">
          <DreamJournal />
        </div>
      )}

      {/* Sparkie's Feed — lazy-mounted */}
      {activeTab === "feed" && (
        <div className="absolute inset-0 z-10 flex flex-col">
          <SparkiesFeed />
        </div>
      )}

      {/* Skills Library — lazy-mounted */}
      {activeTab === "skills" && (
        <div className="absolute inset-0 z-10 flex flex-col">
          <SkillsLibrary />
        </div>
      )}

      {/* AI Work Log — lazy-mounted */}
      {activeTab === "worklog" && (
        <div className="absolute inset-0 z-10 flex flex-col">
          <WorklogPage />
        </div>
      )}

      {/* Chat / Welcome — lazy-mounted: only when chat tab active */}
      {!ALL_NON_CHAT_TABS.includes(activeTab) && (
        <div className="absolute inset-0 z-10 flex flex-col">
          {currentChatId ? <ChatView /> : <WelcomeView />}
        </div>
      )}
    </div>
  )
}
