#!/usr/bin/env python3
"""
Perf Pass 2 - self-contained patch script.
Runs from the checked-out repo root. Reads each file, applies targeted
string replacements, writes back. All anchors verified against actual file content.
"""
import re, sys

def patch_file(path, patches):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    original = content
    for i, (old, new, desc) in enumerate(patches):
        if old not in content:
            print(f'  ERROR: anchor {i+1} not found in {path}: {repr(old[:60])}')
            sys.exit(1)
        content = content.replace(old, new, 1)
        print(f'  [{i+1}] {desc}')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    delta = len(content) - len(original)
    print(f'  -> {len(content):,} chars ({delta:+d})')

# ============================================================
# 1. route.ts
# ============================================================
print('Patching route.ts...')

with open('src/app/api/chat/route.ts', 'r', encoding='utf-8') as f:
    rt = f.read()
lines = rt.splitlines()

# Extract exact SQL fallback line and Memory helpers header from file
SQL_LINE = next(l for l in lines if 'SQL fallback' in l and '\u2500' in l)
MEM_HDR  = next(l for l in lines if 'Memory helpers' in l and '\u2500' in l)

rt_patches = [
    # PATCH 1a: replace DDL block with ensureDbInit() call
    (
        SQL_LINE + '\n'
        '  try {\n'
        '    await query(`CREATE TABLE IF NOT EXISTS user_memories (\n'
        "      id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'general',\n"
        '      content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()\n'
        '    )`)\n'
        '    await query(`CREATE INDEX IF NOT EXISTS idx_user_memories_user_id ON user_memories(user_id)`)\n'
        '    await query(`CREATE TABLE IF NOT EXISTS user_sessions (\n'
        '      id SERIAL PRIMARY KEY, user_id TEXT NOT NULL UNIQUE,\n'
        '      last_seen_at TIMESTAMPTZ DEFAULT NOW(), session_count INTEGER DEFAULT 1,\n'
        '      first_seen_at TIMESTAMPTZ DEFAULT NOW()\n'
        '    )`)\n'
        '    const res = await query<{ category: string; content: string }>(',
        SQL_LINE + '\n'
        '  try {\n'
        '    await ensureDbInit()\n'
        '    const res = await query<{ category: string; content: string }>(',
        'DDL -> ensureDbInit()'
    ),
    # PATCH 1b: inject ensureDbInit function
    (
        MEM_HDR,
        '// \u2500\u2500 One-time DDL init guard \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n'
        'let _dbInitialized = false\n'
        'async function ensureDbInit(): Promise<void> {\n'
        '  if (_dbInitialized) return\n'
        '  _dbInitialized = true\n'
        '  try {\n'
        '    await query(`CREATE TABLE IF NOT EXISTS user_memories (\n'
        "      id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'general',\n"
        '      content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()\n'
        '    )`)\n'
        '    await query(`CREATE INDEX IF NOT EXISTS idx_user_memories_user_id ON user_memories(user_id)`)\n'
        '    await query(`CREATE TABLE IF NOT EXISTS user_sessions (\n'
        '      id SERIAL PRIMARY KEY, user_id TEXT NOT NULL UNIQUE,\n'
        '      last_seen_at TIMESTAMPTZ DEFAULT NOW(), session_count INTEGER DEFAULT 1,\n'
        '      first_seen_at TIMESTAMPTZ DEFAULT NOW()\n'
        '    )`)\n'
        '  } catch { /* tables may already exist */ }\n'
        '}\n\n'
        + MEM_HDR,
        'inject ensureDbInit function'
    ),
    # PATCH 2a: _memCache
    (
        'const _ctCache = new Map<string, { tools: any[]; expiresAt: number }>()',
        'const _ctCache = new Map<string, { tools: any[]; expiresAt: number }>()\n'
        'const _memCache = new Map<string, { text: string; expiresAt: number }>()',
        '_memCache declaration'
    ),
    # PATCH 2b: wrap loadMemories in cache
    (
        "        loadMemories(userId, messages.filter((m: { role: string; content: string }) => m.role === 'user').at(-1)?.content?.slice(0, 200)),",
        '        (() => {\n'
        '          const _mce = _memCache.get(userId)\n'
        '          if (_mce && _mce.expiresAt > Date.now()) return Promise.resolve(_mce.text)\n'
        "          return loadMemories(userId, messages.filter((m: { role: string; content: string }) => m.role === 'user').at(-1)?.content?.slice(0, 200)).then(t => {\n"
        '            _memCache.set(userId, { text: t, expiresAt: Date.now() + 30_000 })\n'
        '            return t\n'
        '          })\n'
        '        })(),',
        'loadMemories 30s cache'
    ),
    # PATCH 3: flamePlan 1.5s timeout
    (
        '          const flamePlanRes = await fetch(\n'
        '            `${OPENCODE_BASE}/chat/completions`,\n'
        '            {\n'
        "              method: 'POST',\n"
        "              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },\n"
        '              body: JSON.stringify({\n'
        '                model: MODELS.CAPABLE, // was openai-gpt-4.1 (tier-blocked) \u2014 Flame handles planning\n'
        '                stream: false,\n'
        '                temperature: 0.3,\n'
        '                max_tokens: 600,\n'
        '                messages: planMessages,\n'
        '              }),\n'
        '            }\n'
        '          )',
        '          const _planTimeout = new Promise<Response>((_, rej) =>\n'
        "            setTimeout(() => rej(new Error('plan_timeout')), 1500)\n"
        '          )\n'
        '          const flamePlanRes = await Promise.race([\n'
        '            fetch(\n'
        '              `${OPENCODE_BASE}/chat/completions`,\n'
        '              {\n'
        "                method: 'POST',\n"
        "                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },\n"
        '                body: JSON.stringify({\n'
        '                  model: MODELS.CAPABLE,\n'
        '                  stream: false,\n'
        '                  temperature: 0.3,\n'
        '                  max_tokens: 600,\n'
        '                  messages: planMessages,\n'
        '                }),\n'
        '              }\n'
        '            ),\n'
        '            _planTimeout,\n'
        '          ])',
        'flamePlan 1.5s timeout'
    ),
    # PATCH 4: CONVERSATIONAL fast-path
    (
        '        getAwareness(userId),\n'
        '        loadIdentityFiles(userId),\n'
        '        buildEnvironmentalContext(userId),\n'
        '        readSessionSnapshot(userId),\n'
        '        loadReadyDeferredIntents(userId),\n'
        '        getUserModel(userId),\n'
        '      ])',
        '        getAwareness(userId),\n'
        "        modelSelection.tier === 'conversational' ? Promise.resolve([]) : loadIdentityFiles(userId),\n"
        "        modelSelection.tier === 'conversational' ? Promise.resolve('') : buildEnvironmentalContext(userId),\n"
        "        modelSelection.tier === 'conversational' ? Promise.resolve(null) : readSessionSnapshot(userId),\n"
        "        modelSelection.tier === 'conversational' ? Promise.resolve([]) : loadReadyDeferredIntents(userId),\n"
        "        modelSelection.tier === 'conversational' ? Promise.resolve(null) : getUserModel(userId),\n"
        '      ])',
        'CONVERSATIONAL fast-path'
    ),
    # PATCH 5: Supermemory 4s -> 2s timeout
    (
        'signal: AbortSignal.timeout(4000),',
        'signal: AbortSignal.timeout(2000),',
        'Supermemory timeout 4000->2000ms'
    ),
]

patch_file('src/app/api/chat/route.ts', rt_patches)

# ============================================================
# 2. appStore.ts
# ============================================================
print('Patching appStore.ts...')

store_patches = [
    (
        '    if (patch !== undefined) {\n'
        '      const msgId = idOrPatch as string\n'
        '      set((s) => ({\n'
        '        messages: s.messages.map((m) => m.id === msgId ? { ...m, ...patch } : m),\n'
        '        chats: s.chats.map((c) =>\n'
        '          c.id === chatIdOrId\n'
        '            ? { ...c, messages: c.messages.map((m) => m.id === msgId ? { ...m, ...patch } : m) }\n'
        '            : c\n'
        '        ),\n'
        '      }))\n'
        '    } else {',
        '    if (patch !== undefined) {\n'
        '      const msgId = idOrPatch as string\n'
        '      // Guard: skip if nothing changed\n'
        '      const s0 = get()\n'
        '      const chat0 = s0.chats.find(c => c.id === chatIdOrId)\n'
        '      const msg0 = chat0?.messages.find(m => m.id === msgId)\n'
        '      if (msg0) {\n'
        '        const keys = Object.keys(patch) as Array<keyof typeof patch>\n'
        '        if (keys.every(k => (msg0 as Record<string, unknown>)[k] === (patch as Record<string, unknown>)[k])) return\n'
        '      }\n'
        '      set((s) => ({\n'
        '        messages: s.messages.map((m) => m.id === msgId ? { ...m, ...patch } : m),\n'
        '        chats: s.chats.map((c) =>\n'
        '          c.id === chatIdOrId\n'
        '            ? { ...c, messages: c.messages.map((m) => m.id === msgId ? { ...m, ...patch } : m) }\n'
        '            : c\n'
        '        ),\n'
        '      }))\n'
        '    } else {',
        'updateMessage equality guard'
    ),
    (
        '  appendToMessage: (id, content) =>\n'
        '    set((s) => ({\n'
        '      messages: s.messages.map((m) => m.id === id ? { ...m, content: m.content + content } : m),\n'
        '      chats: s.chats.map((c) => ({\n'
        '        ...c,\n'
        '        messages: c.messages.map((m) => m.id === id ? { ...m, content: m.content + content } : m),\n'
        '      })),\n'
        '    })),',
        '  appendToMessage: (id, content) => {\n'
        '    const s = get()\n'
        '    const chatIdx = s.chats.findIndex(c => c.messages.some(m => m.id === id))\n'
        '    if (chatIdx < 0) return\n'
        '    set((st) => {\n'
        '      const newChats = [...st.chats]\n'
        '      const chat = newChats[chatIdx]\n'
        '      newChats[chatIdx] = { ...chat, messages: chat.messages.map((m) => m.id === id ? { ...m, content: m.content + content } : m) }\n'
        '      return { chats: newChats, messages: st.messages.map((m) => m.id === id ? { ...m, content: m.content + content } : m) }\n'
        '    })\n'
        '  },',
        'appendToMessage targeted update'
    ),
]
patch_file('src/store/appStore.ts', store_patches)

# ============================================================
# 3. ChatView.tsx
# ============================================================
print('Patching ChatView.tsx...')

cv_patches = [
    (
        "import { useAppStore } from '@/store/appStore'",
        "import { useAppStore } from '@/store/appStore'\nimport { shallow } from 'zustand/shallow'",
        'add shallow import'
    ),
    (
        'const { chats, currentChatId, ideOpen, toggleIDE, userAvatarUrl, longTaskLabel } = useAppStore()',
        'const { chats, currentChatId, ideOpen, toggleIDE, userAvatarUrl, longTaskLabel } = useAppStore(\n    (s) => ({\n      chats: s.chats,\n      currentChatId: s.currentChatId,\n      ideOpen: s.ideOpen,\n      toggleIDE: s.toggleIDE,\n      userAvatarUrl: s.userAvatarUrl,\n      longTaskLabel: s.longTaskLabel,\n    }),\n    shallow\n  )',
        'shallow selector'
    ),
]
patch_file('src/components/chat/ChatView.tsx', cv_patches)

# ============================================================
# 4. ChatInput.tsx
# ============================================================
print('Patching ChatInput.tsx...')

ci_patches = [
    (
        '  const [isRecording, setIsRecording] = useState(false)',
        '  const [isRecording, setIsRecording] = useState(false)\n  const streamFlushRef = useRef<number>(0)',
        'add streamFlushRef'
    ),
    (
        '            if (delta?.content) {\n'
        '              if (!fullContent) {\n'
        "                // First token \u2014 Sparkie is now composing her response\n"
        "                addWorklogEntry({ type: 'result', content: 'Analyzed', status: 'done' })\n"
        '              }\n'
        '              fullContent += delta.content\n'
        '              updateMessage(chatId, assistantMsgId, { content: fullContent })\n'
        '            }',
        '            if (delta?.content) {\n'
        '              if (!fullContent) {\n'
        "                // First token \u2014 Sparkie is now composing her response\n"
        "                addWorklogEntry({ type: 'result', content: 'Analyzed', status: 'done' })\n"
        '              }\n'
        '              fullContent += delta.content\n'
        '              clearTimeout(streamFlushRef.current)\n'
        '              streamFlushRef.current = setTimeout(() => {\n'
        '                updateMessage(chatId, assistantMsgId, { content: fullContent })\n'
        '              }, 16) as unknown as number\n'
        '            }',
        'stream updateMessage 16ms throttle'
    ),
]
patch_file('src/components/chat/ChatInput.tsx', ci_patches)

print('\nAll patches applied successfully.')
