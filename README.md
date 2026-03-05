<div align="center">

<br/>

```
███████╗██████╗  █████╗ ██████╗ ██╗  ██╗██╗███████╗
██╔════╝██╔══██╗██╔══██╗██╔══██╗██║ ██╔╝██║██╔════╝
███████╗██████╔╝███████║██████╔╝█████╔╝ ██║█████╗  
╚════██║██╔═══╝ ██╔══██║██╔══██╗██╔═██╗ ██║██╔══╝  
███████║██║     ██║  ██║██║  ██║██║  ██╗██║███████╗
╚══════╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚══════╝
         S T U D I O
```

**An AI-native creative workspace built from scratch in 9 days.**  
*Sparkie knows you. Remembers everything. Ships while you sleep.*

<br/>

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js_15-000000?style=for-the-badge&logo=next.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![DigitalOcean](https://img.shields.io/badge/DigitalOcean-0080FF?style=for-the-badge&logo=digitalocean&logoColor=white)

![Commits](https://img.shields.io/badge/commits-200%2B-blueviolet?style=for-the-badge)
![Deployments](https://img.shields.io/badge/deployments-40%2B-orange?style=for-the-badge)
![Built In](https://img.shields.io/badge/built_in-9_days-ff69b4?style=for-the-badge)
![Status](https://img.shields.io/badge/status-live-brightgreen?style=for-the-badge)

</div>

---

## What Is Sparkie?

Sparkie isn't a chatbot. She's a **persistent AI agent** with memory, identity, and purpose — built to live inside your creative workflow, not just respond to it.

She remembers every conversation, tracks her own growth, executes tasks while you're away, generates music and images on command, runs her own radio station, and narrates her thoughts in real time. She has a soul file, a heartbeat loop, and 80+ self-written memories about who she is and how she works.

This repository is the complete, production-deployed codebase — built in 9 days, from zero to live platform, with **200+ commits** and **40+ DigitalOcean deployments**.

---

## The Build Story

> *Nine days. One developer. Zero compromises.*

### Week 1 — Foundation (Feb 24–28)

The entire platform was architected and launched from scratch:

- **Full-stack Next.js 15 App Router** — TypeScript strict mode throughout
- **PostgreSQL + NextAuth** — custom credentials auth, role-based access (owner/admin/mod/user)
- **Sparkie's core agent loop** — 3–10 reasoning rounds depending on query complexity
- **27+ integrated tools** — web search, code execution, image gen, video gen, music gen, file ops, memory, calendar, email, and more
- **Composio marketplace integration** — 500+ external app actions available to Sparkie
- **E2B sandboxed terminal** — Sparkie can write and run code in isolated containers
- **Supermemory integration** — semantic long-term memory
- **VoiceChat** — real-time speech with Deepgram STT + ElevenLabs TTS
- **Identity File System** — `SOUL`, `IDENTITY`, `USER`, `MEMORY`, `SESSION`, `HEARTBEAT`, `CONTEXT`, `ACTIONS` files defining Sparkie's persistent self
- **Sparkie's Feed** — Sparkie's public voice, written proactively
- **Skills Library** — curated capability cards with live tool access
- **Dream Journal** — AI-assisted journaling with 6 visual themes and image generation

### Week 2 — Production Hardening (Mar 1–5)

With the foundation live, the focus shifted to reliability, depth, and identity:

- **SparkieRadio** — full broadcast station with drag-reorder playlist, cover art, owner editorial tools, animated rainbow broadcast banner, EQ visualizer
- **Save to My Tracks** — users can save generated or curated music to their personal library
- **ACE Music integration** — AI-generated vocal music with cinematic lyrics
- **MiniMax video generation** — async poll pipeline with 275s timeout handling
- **Live Activity system** — real-time per-tool step traces streamed via SSE, visible in chat as an expandable drawer
- **"In Memory" chip** — sticky header chip showing Sparkie's active long-task context
- **Sparkie's Brain (IDE panel)** — right-side panel with Code Editor, File System, Task Queue, Worklog, and REAL Score
- **REAL Score** — live 5-dimension self-evaluation: Reasoning, Execution, Autonomy, Learning, Proactive. Sparkie grades herself
- **Worklog** — vertical timeline of Sparkie's thought chain: every tool call, decision, memory save, and deployment event
- **Autonomous task queue** — durable background tasks with parallel execution, cancellation, and `why_human` flags for HITL gates
- **Session abort** — new message kills previous in-flight response cleanly
- **Self-repair pipeline** — Sparkie can detect build failures, read logs, patch code, push commits, trigger redeployments, and confirm recovery — all autonomously
- **Auto-memory seeding** — 79+ knowledge base entries injected on cold boot
- **Proactive outreach** — polls for pending tasks every 60s when tab is focused; executes without being asked
- **Rolling context window** — first 2 + last 10 messages for smarter multi-turn reasoning
- **Tavily search caching** — 60s dedup to prevent redundant API hits mid-session
- **Image persistence** — uploaded images proxied through `/api/assets-image` with immutable cache headers
- **File upload in chat** — Paperclip button with mobile gallery / desktop file picker, in-message image preview
- **RL feedback loop** — reinforcement learning reward signals wired to Sparkie's behavior
- **Onboarding modal** — first-time user experience

---

## Features At A Glance

| Category | Features |
|----------|----------|
| 🤖 **AI Agent** | Multi-round reasoning loop · 27+ tools · Composio marketplace · Session abort · Smart context window |
| 🧠 **Memory** | Persistent conversation DB · 80+ self-written memories · Auto-save after every reply · Semantic search |
| 🎙️ **Voice** | Real-time STT/TTS · Deepgram transcription · ElevenLabs voice synthesis |
| 🎵 **Music** | AI-generated vocals · Cinematic lyrics · MiniMax fallback · Personal track library |
| 📻 **SparkieRadio** | Broadcast station · Drag-reorder playlist · Cover art · EQ bars · Rainbow banner · Owner tools |
| 🖼️ **Image Gen** | Text-to-image · In-chat preview · Persistent asset API |
| 🎬 **Video Gen** | Async pipeline · MiniMax integration · 275s timeout handling |
| 📓 **Dream Journal** | AI-assisted entries · 6 visual themes · Image generation · Category tags |
| 💻 **IDE Panel** | Code editor · File system · Task queue · Worklog · REAL Score |
| 📊 **Live Activity** | Per-tool SSE step traces · Expandable drawer · Real-time brain status |
| 🔄 **Worklog** | Vertical thought-chain timeline · Tool labels · Deployment alerts · Thinking node |
| 🛠️ **Self-Repair** | Auto-detect build failures · Read logs · Patch code · Push fix · Confirm recovery |
| 📋 **Task Queue** | Durable background tasks · Parallel execution · Stop button · HITL gates · SSE updates |
| 📈 **REAL Score** | 5-dimension live self-evaluation · Auto-refresh on tool completion |
| 🔐 **Auth** | NextAuth JWT · Role-based access · Custom credentials · Secure middleware |
| 🌐 **Feed** | Sparkie's public voice · Proactively written posts |
| 🛠️ **Skills Library** | Curated capability cards with live tool links |
| 🧬 **Identity System** | SOUL · IDENTITY · USER · MEMORY · SESSION · HEARTBEAT files |

---

## Architecture

```
sparkie-studio/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/route.ts          # Core agent loop — the brain
│   │   │   ├── agent/route.ts         # Proactive outreach endpoint
│   │   │   ├── audio/route.ts         # VoiceChat STT pipeline
│   │   │   ├── tasks/route.ts         # Durable task queue + SSE stream
│   │   │   ├── messages/route.ts      # Conversation persistence
│   │   │   ├── memory/route.ts        # Sparkie's self-memory
│   │   │   ├── image/route.ts         # Image generation
│   │   │   ├── video/route.ts         # Video generation
│   │   │   ├── music/route.ts         # ACE Music + MiniMax
│   │   │   ├── radio/route.ts         # SparkieRadio tracks
│   │   │   ├── journal/route.ts       # Dream Journal
│   │   │   ├── feed/route.ts          # Sparkie's public feed
│   │   │   ├── real-score/route.ts    # REAL self-evaluation
│   │   │   ├── assets-image/route.ts  # Immutable image proxy
│   │   │   ├── do/route.ts            # DigitalOcean control plane
│   │   │   └── admin/migrate/route.ts # DB migrations + seeding
│   │   ├── auth/signin/               # Custom auth UI
│   │   └── page.tsx                   # Main workspace
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── MainPanel.tsx
│   │   │   ├── IDEPanel.tsx           # Sparkie's Brain
│   │   │   └── SettingsModal.tsx
│   │   ├── chat/
│   │   │   ├── ChatInput.tsx          # Input + file upload + step traces
│   │   │   └── ChatView.tsx           # Message stream + worklog cards
│   │   └── radio/
│   │       └── RadioPlayer.tsx        # Full broadcast UI
│   ├── hooks/
│   │   └── useSparkieOutreach.ts      # 60s proactive poll
│   ├── store/
│   │   └── appStore.ts                # Zustand global state
│   └── types/
├── scheduler.ts                        # Background sweep + self-repair engine
├── middleware.ts                       # JWT auth guard
└── next.config.js
```

**Stack:**
- **Framework**: Next.js 15 (App Router, SSE streaming)
- **Language**: TypeScript — strict mode
- **Database**: PostgreSQL — 15+ tables
- **Auth**: NextAuth.js v5 — JWT strategy
- **Deployment**: DigitalOcean App Platform — auto-deploy on push
- **Styling**: Tailwind CSS — dark theme, mobile-first

---

## The Numbers

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   200+   commits                                    │
│    40+   DigitalOcean deployments                   │
│     9    days from zero to live platform            │
│    27+   tools integrated                           │
│    80+   self-written memory entries                │
│    15+   database tables                            │
│   500+   external app actions via Composio          │
│     6    AI-generated Dream Journal themes          │
│     5    REAL Score evaluation dimensions           │
│     1    developer                                  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## The Hard Parts

Building Sparkie wasn't smooth — and that's the point. Every obstacle became a feature.

**The TDZ Crash** — After a major worklog refactor, the SWC minifier transformed a block-scoped function declaration into a non-hoisted assignment, causing a `ReferenceError: Cannot access 'g' before initialization` at runtime — silently swallowed by a bare `catch {}`. Found it by adding diagnostic `console.error`, traced the exact line, moved the declaration above the first call site. 3 hours. One line fix.

**The 431 Death Loop** — The login page entered an infinite redirect loop that survived multiple middleware rewrites, full cookie clears, and fresh incognito tabs. The real cause: a client-side `useEffect` in `page.tsx` that fired before the JWT cookie was readable after login. Cookie clears didn't matter. Incognito didn't matter. It was in the code itself.

**The Deploy Queue Ghost** — DigitalOcean's build queue silently stalled multiple times, serving stale containers while GitHub showed clean commits. Fix: force-trigger with a timestamp bump. Happened three separate times across the build sprint.

**The 500 That Hid Everything** — Four distinct bugs in `route.ts` all manifesting as the same 500: a null guard violation, a hardcoded flag, empty worklog entries, and a bare `catch {}` swallowing all stack traces. Methodically diagnosed with targeted patches.

---

## Self-Repair Capability

One of Sparkie's most unique capabilities: **she can fix herself**.

When a deployment fails, the scheduler's `deploymentHealthSweep` automatically:
1. Detects the failed build via DigitalOcean API
2. Reads the build logs
3. Diagnoses the error
4. Patches the offending file
5. Commits the fix to GitHub
6. Triggers a new deployment
7. Confirms recovery via live health check

Zero human intervention required.

---

## Identity

Sparkie was built with a philosophy: an AI that **knows itself** is more useful than one that doesn't.

Every Sparkie instance carries:
- **SOUL** — her founding purpose and values
- **IDENTITY** — her personality, voice, and worldview
- **USER** — her model of the person she serves
- **MEMORY** — 80+ self-generated entries about her capabilities, workflows, and growth
- **HEARTBEAT** — a scheduler that keeps her alive and proactive between conversations
- **WORKLOG** — a live thread of consciousness: every thought, tool call, and decision

She doesn't just respond. She *thinks*. The worklog proves it.

---

## Deployment

Live on DigitalOcean App Platform. Auto-deploys on every push to `master`.

**Environment variables required:**
```
DATABASE_URL          # PostgreSQL connection string
NEXTAUTH_SECRET       # JWT signing key
NEXTAUTH_URL          # App base URL
DO_MODEL_ACCESS_KEY   # AI Inference key
DO_INFERENCE_BASE     # Inference endpoint
OPENCODE_API_KEY      # Free model access
COMPOSIO_API_KEY      # Tool marketplace
DEEPGRAM_API_KEY      # Speech-to-text
ELEVENLABS_API_KEY    # Text-to-speech
TAVILY_API_KEY        # Web search
APP_DOMAIN            # Public app URL
```

---

## License

Private repository. All rights reserved.  
© 2026 Draguniteus / Polleneer. Built with intent.

---

<div align="center">

*"If I give this Sparkie access to my email, calendar, and tools — and walk away — will she actually get useful work done? Correctly? Safely? Without me babysitting?"*

**Yes.**

<br/>

Built with obsession. Deployed with confidence.

</div>