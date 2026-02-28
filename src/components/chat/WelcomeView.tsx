'use client'

import { useAppStore } from '@/store/appStore'
import { ChatInput } from './ChatInput'
import { Code, FileText, Search, Image, Sparkles, Zap } from 'lucide-react'

const quickActions = [
  { icon: Code, label: 'Build a Website', color: 'text-green-400' },
  { icon: Search, label: 'Research', color: 'text-blue-400' },
  { icon: Image, label: 'Generate Image', color: 'text-purple-400' },
  { icon: FileText, label: 'Write Content', color: 'text-orange-400' },
]

export function WelcomeView() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-3 md:px-4">
      <div className="max-w-2xl w-full flex flex-col items-center">
        {/* Logo & Title */}
        <div className="mb-6 md:mb-8 text-center">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-honey-500/15 flex items-center justify-center mx-auto mb-3 md:mb-4 glow-honey">
            <Sparkles size={26} className="text-honey-500" />
          </div>
          <h1 className="text-xl md:text-2xl font-semibold mb-2">
            <span className="text-honey-500 font-bold">Sparkie Studio</span>
          </h1>
          <p className="text-text-secondary text-sm">Your AI workspace. Chat, code, create.</p>
        </div>

        {/* Chat Input */}
        <div className="w-full mb-4 md:mb-6">
          <ChatInput />
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2 flex-wrap justify-center">
          {quickActions.map(({ icon: Icon, label, color }) => (
            <button
              key={label}
              className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-full bg-hive-surface border border-hive-border hover:border-honey-500/30 hover:bg-hive-elevated transition-all text-xs md:text-sm text-text-secondary hover:text-text-primary"
            >
              <Icon size={14} className={color} />
              {label}
            </button>
          ))}
        </div>

        {/* Expert Cards */}
        <div className="mt-6 md:mt-10 grid grid-cols-3 gap-2 md:gap-3 w-full max-w-lg">
          {[
            { title: 'Coding', icon: '💻', desc: 'Build apps & scripts' },
            { title: 'Research', icon: '🔍', desc: 'Deep web analysis' },
            { title: 'Creative', icon: '🎨', desc: 'Images & content' },
          ].map(({ title, icon, desc }) => (
            <div key={title} className="p-3 md:p-4 rounded-xl bg-hive-surface border border-hive-border hover:border-honey-500/20 cursor-pointer transition-all group">
              <div className="text-xl md:text-2xl mb-1 md:mb-2">{icon}</div>
              <div className="text-xs md:text-sm font-medium text-text-primary group-hover:text-honey-500 transition-colors">{title}</div>
              <div className="text-[10px] md:text-[11px] text-text-muted mt-0.5 hidden sm:block">{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
