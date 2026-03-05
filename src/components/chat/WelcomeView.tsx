'use client'

import { ChatInput } from './ChatInput'

export function WelcomeView() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-3 md:px-4">
      <div className="max-w-2xl w-full flex flex-col items-center">

        {/* Logo & Title */}
        <div className="mb-8 md:mb-10 text-center flex flex-col items-center">
          {/* Avatar with animated glow ring */}
          <div className="relative mb-4 group">
            <div className="absolute inset-0 rounded-full bg-honey-500/20 blur-xl scale-110 animate-pulse" />
            <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden ring-2 ring-honey-500/40 ring-offset-2 ring-offset-hive-900 shadow-[0_0_32px_rgba(234,179,8,0.25)] transition-all duration-300 group-hover:shadow-[0_0_48px_rgba(234,179,8,0.4)] group-hover:ring-honey-500/70">
              <img
                src="/sparkie-avatar.jpg"
                alt="Sparkie"
                className="w-full h-full object-cover"
              />
            </div>
            {/* Online indicator */}
            <span className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full bg-green-400 border-2 border-hive-900 shadow-[0_0_8px_rgba(74,222,128,0.6)]" />
          </div>

          <h1 className="text-2xl md:text-3xl font-bold mb-1.5 tracking-tight">
            <span className="bg-gradient-to-r from-honey-400 via-honey-500 to-amber-400 bg-clip-text text-transparent">
              Sparkie Studio
            </span>
          </h1>
          <p className="text-text-secondary text-sm md:text-base">
            Your AI workspace. Chat, code, create.
          </p>
        </div>

        {/* Chat Input */}
        <div className="w-full">
          <ChatInput />
        </div>

      </div>
    </div>
  )
}
