'use client'

import { useState, useRef, useCallback } from 'react'
import { useAppStore } from '@/store/appStore'
import { Paperclip, ArrowUp, Sparkles, ChevronDown } from 'lucide-react'

const MODELS = [
  { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3', tag: 'Free' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', tag: 'Free' },
  { id: 'qwen/qwen-2.5-72b-instruct:free', name: 'Qwen 2.5 72B', tag: 'Free' },
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash', tag: 'Free' },
  { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small', tag: 'Free' },
]

export function ChatInput() {
  const [input, setInput] = useState('')
  const [showModels, setShowModels] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { selectedModel, setSelectedModel, createChat, addMessage, currentChatId, isStreaming } = useAppStore()

  const currentModel = MODELS.find(m => m.id === selectedModel) || MODELS[0]

  const handleSubmit = useCallback(() => {
    if (!input.trim() || isStreaming) return

    let chatId = currentChatId
    if (!chatId) {
      chatId = createChat()
    }

    addMessage(chatId, { role: 'user', content: input.trim() })
    setInput('')

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    // TODO: Phase 2 — send to OpenRouter API and stream response
    // For now, add a placeholder response
    setTimeout(() => {
      addMessage(chatId!, {
        role: 'assistant',
        content: 'Hello! I\'m Sparkie, your AI workspace assistant. 🐝\n\nI\'m being built right now — Phase 1 is the foundation shell you\'re looking at. Soon I\'ll be able to:\n\n• **Chat** with multiple AI models\n• **Write & run code** in a live IDE\n• **Generate images** and creative content\n• **Research** topics on the web\n• **Build full apps** with real-time preview\n\nStay tuned — Phase 2 (streaming chat with real AI models) is coming next!',
        model: selectedModel,
      })
    }, 500)
  }, [input, isStreaming, currentChatId, createChat, addMessage, selectedModel])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    // Auto-resize
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  return (
    <div className="relative">
      <div className="rounded-2xl bg-hive-surface border border-hive-border focus-within:border-honey-500/40 transition-colors">
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Enter your task and submit it to Sparkie..."
          rows={1}
          className="w-full px-4 pt-3 pb-2 bg-transparent text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none min-h-[44px] max-h-[200px]"
        />

        {/* Bottom Bar */}
        <div className="flex items-center justify-between px-3 pb-2">
          <div className="flex items-center gap-1">
            {/* Attach */}
            <button className="p-1.5 rounded-md hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors" title="Attach file">
              <Paperclip size={15} />
            </button>

            {/* Model Selector */}
            <div className="relative">
              <button
                onClick={() => setShowModels(!showModels)}
                className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-hive-hover text-text-muted hover:text-text-secondary transition-colors text-xs"
              >
                <Sparkles size={12} className="text-honey-500" />
                {currentModel.name}
                <ChevronDown size={12} />
              </button>
              {showModels && (
                <div className="absolute bottom-full left-0 mb-1 w-64 bg-hive-elevated border border-hive-border rounded-lg shadow-xl py-1 z-50">
                  {MODELS.map(model => (
                    <button
                      key={model.id}
                      onClick={() => { setSelectedModel(model.id); setShowModels(false) }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-hive-hover transition-colors flex items-center justify-between ${
                        selectedModel === model.id ? 'text-honey-500' : 'text-text-secondary'
                      }`}
                    >
                      <span>{model.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        model.tag === 'Free' 
                          ? 'bg-green-500/15 text-green-400'
                          : 'bg-honey-500/15 text-honey-500'
                      }`}>{model.tag}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Send */}
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isStreaming}
            className={`p-2 rounded-lg transition-all ${
              input.trim()
                ? 'bg-honey-500 text-hive-900 hover:bg-honey-400 shadow-lg shadow-honey-500/20'
                : 'bg-hive-hover text-text-muted cursor-not-allowed'
            }`}
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
