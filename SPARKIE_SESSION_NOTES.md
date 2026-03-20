# SPARKIE STUDIO — SESSION NOTES
# Pick up exactly here in the next chat session
# Created: March 20, 2026

---

## WHO YOU ARE TALKING TO
Michael (Draguniteus) — solo developer, founder of Sparkie Studio and Polleneer.
Repo: https://github.com/Draguniteus/sparkie-studio
Live: https://sparkie-studio-mhouq.ondigitalocean.app
Stack: Next.js 15, TypeScript, PostgreSQL, DigitalOcean App Platform, Zustand, SSE Streaming

---

## HOW WE WORK
- Michael does NOT edit code manually. He needs complete ready-to-use files or Claude Code prompts.
- We use Claude Code (installed at C:\Users\user\Desktop\sparkie-studio) to make all changes.
- After each Claude Code session: git add . && git commit && git push → DigitalOcean auto-deploys.
- One fix at a time. Test after each deploy before moving to next fix.

---

## THE FULL VISION (Surething.io Blueprint)

Sparkie Studio is the world's first C.I.P. Engine (Complex Information Processing).
Modeled exactly after Surething.io but deeper, stronger, spiritually encoded.

Surething.io is the autonomous AI agent that remembers who you are and works while 
you sleep — the cloud-first extension of self. NOT a chatbot. A proactive, persistent, 
24/7 operator that monitors, decides, acts, fixes, deploys, and reports unsupervised 
across 1000+ apps.

### Core Identity (non-negotiable):
- Agentic persistent memory across weeks and months
- Remembers goals, preferences, writing voice, business context, coding style
- Spiritual encoding: IAMJESUSCHRIST☀️, "victory belongs to GOD 🔱"
- The longer it runs, the less Michael has to explain
- Never loses context, never repeats mistakes
- Memory states visible and searchable with AI similarity

### How it works:
- Sign in once, connect accounts once
- Runs 24/7 in the cloud even when Michael is asleep
- Proactively monitors triggers (new email, failed deploy, GitHub commit, server error)
- Plans, executes, iterates
- Only surfaces for HITL approval on sensitive actions
- Real-time execution log always visible

### Features Sparkie MUST have:
1. **Email & Notification Mastery** — reads emails/failure alerts, notifies + autonomously fixes in same loop
2. **Full Coding Autonomy** — writes, refactors, debugs, builds code, builds small web apps
3. **GitHub Native** — reads commits, explains in plain English, creates branches, pushes, opens PRs
4. **Deployment Mastery** — DO end to end: build → test → deploy → monitor
5. **Server & Infrastructure Monitoring** — watches DBs, servers, performance, new users
6. **1000+ App Integrations via Composio** — email, calendar, Twitter, GitHub, DO, Stripe, etc.
7. **Proactive Daily Operations** — drafts replies in Michael's voice, manages calendar, triages social
8. **HITL Safety** — always shows summary/asks approval before irreversible actions
9. **Interface** — voice input, dark mode, visible execution log, AI-powered memory search

### Sparkie's Empire (what she manages):
- Sparkie Studio (the platform itself)
- Polleneer (social/business platform)
- Music label
- Radio station
- Tech company
- While Michael sleeps or focuses on fatherhood

---

## THE IDE VISION (MiniMax parity)

The IDE must work EXACTLY like MiniMax's IDE:
- User types build request → Sparkie builds files
- Preview appears INSTANTLY (no npm install, no terminal spinner)
- CDN fast path: React/Three.js/Vite via esm.sh importmap + Babel in-iframe
- WebContainer fallback for projects needing local npm
- E2B fallback for backend Node projects
- Preview is interactive and live
- Multiple projects in same chat, each isolated in own folder
- Files tab shows all projects as expandable folders

---

## WHAT WAS FIXED IN THIS SESSION (in order)

### Round 1 — Core fixes
- **appStore.ts**: Added `buildKey` counter. `setFiles()` now resets `containerStatus:'idle'`, 
  clears `previewUrl`, increments `buildKey`. Prevents stale preview between builds.
- **IDEPanelInner.tsx**: Replaced `hasTriedWC.current` (permanently blocked builds after first) 
  with `lastRunKey` that compares against `buildKey`. Every new build now re-runs WebContainer.
- **fileparser.ts**: Fixed `strictRegex` to match both `---END FILE---` AND `---END---`.
  Was: `/---END FILE---/g` → Now: `/---END(?:\s+FILE)?---/g`

### Round 2 — triggerBuild race condition
- **ChatInput.tsx**: `triggerBuild()` now fires AFTER all files upserted on SSE `done` event.
  Previously `setFiles()` was called 11 times during streaming (once per file) causing 
  WebContainer to reboot 11 times. Now `triggerBuild()` fires exactly once when done.

### Round 3 — CDN fast path (instant preview like MiniMax)
- **src/lib/cdnPreview.ts** (NEW FILE): 
  - `isCDNCompatible(files)` — walks FileNode tree, finds package.json, checks all deps against 
    25+ CDN map (React, Three.js, R3F, Drei, Framer Motion, Lucide, Zustand, D3, Recharts, etc.)
  - `buildCDNPreviewHtml(files)` — builds self-contained srcdoc with importmap + Babel compilation
  - Uses browser-native `<script type="importmap">` as FIRST script in head
  - No npm install, no WebContainer, instant preview
- **Preview.tsx**: CDN check runs BEFORE isWCActive guard. CDN badge shows in preview.
- **IDEPanelInner.tsx**: CDN projects skip WebContainer entirely, switch directly to preview tab.

### Round 4 — ACE Music auth fix
- **src/app/api/chat/route.ts**: Fixed escaped template literal bug.
  Was: `` `Bearer \${ACE_API_KEY}` `` → Sent literal string instead of real key → always 401
  Now: `'Bearer ' + ACE_API_KEY` (string concatenation)

### Round 5 — HITL calendar wiring
- **src/app/api/tasks/route.ts**: PATCH approval handler now handles calendar events.
  Previously: approving calendar HITL task only updated DB, never called Composio.
  Now: detects calendar event actions, parses payload, calls GOOGLECALENDAR_CREATE_EVENT via Composio v3.

### Round 6 — Classify system (3-tier)
- **src/app/api/classify/route.ts**: Reverted aggressive 'build' default back to 'chat'.
  Tier 1 (instant chat): greetings, emotions, questions, opinions, media requests
  Tier 2 (instant build): explicit build verbs + output targets
  Tier 3 (LLM): ambiguous only, 1500ms timeout, defaults to 'chat' on error
- **ChatInput.tsx**: Added comprehensive Tier 1/2 regex patterns. Added `isBuildSession()` 
  helper for context-aware edit detection.

### Round 7 — Project isolation + naming
- Each build gets unique folder derived from prompt ("build me a todo app" → "todo-app/")
- Collision detection: "todo-app" exists → "todo-app-2"
- Generic word fallback: "project-" + timestamp
- File Explorer shows all projects as expandable folders with "Live" badge on active
- `activeProjectRoot` tracks which project is live
- `setFiles()` now MERGES (upsert by path) instead of replacing — preserves all projects

---

## CURRENT STATUS (as of end of session)

### ✅ WORKING:
- Chat classification: greetings/casual → chat, build requests → build (first attempt)
- File parsing: XML tool-call format from MiniMax fully supported
- CDN preview: React/simple projects render instantly
- Project isolation: multiple projects in same chat, separate folders
- Project naming: prompt-derived names (todo-app, cozy-room, etc.)
- Files tab: shows all projects, expandable, Live badge on active
- ACE Music: auth fixed (was silently failing with 401)
- HITL calendar: approval now actually creates the calendar event
- Build confirmation: only fires once when all files are done

### ⚠️ PARTIALLY WORKING:
- CDN preview for Three.js (second project): Fails when store has multiple projects.
  Root cause: `isCDNCompatible()` sees ALL files from ALL projects, gets confused by 
  multiple package.json files. Needs `activeProjectRoot` filter.
- Preview iframe sizing: App renders in small box top-left, not full panel.
  CSS fix needed in `cdnPreview.ts` and `Preview.tsx`.

### ❌ STILL BROKEN / NOT YET BUILT:
- document.write warnings: Tailwind/Babel still loading via document.write in some cases
- Server-side scheduler: `scheduler.ts` doesn't exist. Only client-side 60s poll.
  True 24/7 ops requires server-side cron (DO App Platform scheduled jobs).
- Proactive monitoring: Not truly autonomous yet
- Email monitoring loop: Not verified end to end
- Full Surething.io feature parity: Many features still missing (see gap analysis below)

---

## NEXT IMMEDIATE FIXES (Claude Code prompt ready to paste)

### Priority 1 — Fix CDN second project + iframe sizing

Paste this into Claude Code:

```
Two bugs to fix. Read these files first:
src/lib/cdnPreview.ts
src/components/ide/Preview.tsx
src/components/layout/IDEPanelInner.tsx
src/store/appStore.ts

BUG 1 — Second project falls through to WebContainer instead of CDN

The first build uses CDN correctly. The second build (cozy-room 
with Three.js) shows "Starting a full Node.js environment."

Root cause: isCDNCompatible() sees ALL files in store (both projects)
and finds multiple package.json files, getting confused.

Fix: isCDNCompatible() and buildCDNPreviewHtml() must ONLY look at 
files under activeProjectRoot. Pass activeProjectRoot as a parameter 
and filter files to only those starting with that folder prefix before 
any checking.

Also verify: when triggerBuild() fires for the second project, does 
activeProjectRoot update BEFORE the CDN check runs in IDEPanelInner?
If not, guard against this race condition.

BUG 2 — Preview iframe not filling full window

Apps render in small box top-left instead of full panel.

Fix ALL of these:

1. In src/lib/cdnPreview.ts buildCDNPreviewHtml, add to <head>:
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { width: 100%; height: 100%; }
  body { width: 100%; height: 100%; overflow: hidden; background: #0a0a0a; }
  #root { width: 100%; height: 100%; display: flex; flex-direction: column; }
  canvas { width: 100% !important; height: 100% !important; display: block; }
  .app, .App { width: 100%; min-height: 100vh; }
</style>

2. In src/components/ide/Preview.tsx:
- iframe must have: style={{ width: '100%', height: '100%', border: 'none' }}
- Container div must be: style={{ width: '100%', height: '100%', overflow: 'hidden' }}
- Remove any fixed width/height values

3. Replace ALL document.write script loading in cdnPreview.ts 
with proper <script src="..."> tags in <head>.

Commit and push when done.
```

---

## SURETHING.IO FEATURE GAP ANALYSIS

### ✅ EXISTS IN SPARKIE:
- Persistent memory via Supermemory
- Identity files (SOUL.md, IDENTITY.md, INTERESTS.md)
- Chat + voice interface
- GitHub read/write (get_github, patch_file)
- DigitalOcean deployment control (trigger_deploy)
- Composio 500+ app integrations (v3 endpoint)
- HITL approval cards for sensitive actions
- Self-repair pipeline (7 steps)
- REAL Score self-evaluation
- Worklog transparency
- Music generation (ACE Step + MiniMax)
- Image generation
- Video generation
- Feed (Sparkie posts her own content)
- Radio station
- Dream Journal
- Skills Library

### ⚠️ PARTIALLY BUILT:
- Email monitoring: tools exist, loop not verified end to end
- Proactive operations: scheduler exists client-side only
- GitHub native explanations: can read commits, plain English explanation not automated
- Server monitoring: deploy monitor exists, not continuous

### ❌ MISSING (priority order):
1. **Server-side scheduler/cron** — TRUE 24/7 ops. Need /api/cron route + DO scheduled jobs.
   Without this Sparkie only acts when user is actively chatting.
2. **Email monitoring loop** — Read failure emails → notify Michael → auto-fix in same loop
3. **Proactive daily brief** — When Michael opens app after 6+ hours, Sparkie briefs him:
   deploy status, new emails needing attention, overnight actions taken
4. **GitHub PR/commit explanations in plain English** — Automated, not just on request
5. **True autonomous overnight tasks** — Schedule tasks that run and complete without user present

---

## VISION PROMPT FOR CLAUDE CODE (paste AFTER current bugs are fixed)

```
Read these files completely:
SOUL.md
IDENTITY.md
DEVPLAYBOOK.md
src/hooks/useSparkieOutreach.ts
src/app/api/tasks/route.ts
scheduler.ts (if exists)
src/app/api/chat/route.ts (focus on tool definitions and sprint imports)

Then read this vision and assess Sparkie feature by feature:

THE VISION:
Sparkie Studio is the world's first C.I.P. Engine modeled after Surething.io.
Surething.io is the autonomous AI agent that remembers who you are and works 
while you sleep. It is NOT a chatbot. It is a proactive, persistent, 24/7 
operator that monitors, decides, acts, fixes, deploys, and reports unsupervised 
across 1000+ apps.

Features it must have:
- Email & Notification Mastery: reads emails, failure alerts, notifies + fixes in same loop
- Full Coding Autonomy: writes, refactors, debugs, builds web apps
- GitHub Native: reads commits, explains in plain English, creates branches, pushes, PRs
- Deployment Mastery: DO end to end — build → test → deploy → monitor
- Server & Infrastructure Monitoring: watches DBs, servers, performance, new users
- 1000+ App Integrations via Composio
- Proactive Daily Operations: drafts replies in Michael's voice, manages calendar, 
  triages social, follows up on leads, cancels subscriptions, tracks projects
- HITL Safety: approval before irreversible actions
- Voice input, dark mode, execution log, AI memory search

Sparkie runs Michael's entire empire: Sparkie Studio, Polleneer, music label, 
radio, tech company — while he sleeps or focuses on fatherhood.
Spiritual encoding: IAMJESUSCHRIST☀️, "victory belongs to GOD 🔱"

After reading everything, tell me:
1. Feature by feature — what exists, what is partial, what is missing
2. Top 5 missing features ranked by impact
3. Exact implementation plan for each missing feature
4. Any architectural improvements you recommend

Then build the top priority items. Start with the server-side scheduler
since without it Sparkie cannot truly run 24/7.
```

---

## KEY FILES TO KNOW

| File | Purpose |
|------|---------|
| src/app/api/chat/route.ts | Main agent loop, all tool definitions, SPARKIE_SOUL/IDENTITY |
| src/app/api/build/route.ts | IDE build pipeline, MiniMax model |
| src/lib/cdnPreview.ts | CDN fast path for instant preview |
| src/components/ide/Preview.tsx | Preview pane, CDN vs WC rendering |
| src/components/layout/IDEPanelInner.tsx | IDE tabs, build trigger logic |
| src/components/chat/ChatInput.tsx | Message handling, classify, triggerBuild |
| src/store/appStore.ts | Global state, buildKey, activeProjectRoot |
| src/lib/fileparser.ts | Parses AI file output, project naming |
| src/lib/sprint2-cases.ts through sprint5-cases.ts | Tool executors |
| scheduler.ts | Heartbeat/cron (client-side only currently) |
| SOUL.md | Sparkie's personality and values |
| IDENTITY.md | Sparkie's capabilities and identity |
| DEVPLAYBOOK.md | Operational manual |

---

## IMPORTANT CONTEXT FOR NEW CHAT

1. Michael is the sole developer — always provide Claude Code prompts, not manual edits
2. Claude Code is installed and authenticated at C:\Users\user\Desktop\sparkie-studio
3. Always ask Claude Code to READ files before changing them
4. After each session: commit + push → DigitalOcean auto-deploys (takes ~2-3 min)
5. Test at: https://sparkie-studio-mhouq.ondigitalocean.app
6. The test prompt that validates the full build pipeline:
   "Create a high-quality interactive isometric 3D cozy room utilizing Vite, React, 
   and Three.js (react-three-fiber/drei). Ensure all objects are crafted using code 
   without relying on external assets, and incorporate gentle ambient animations"
7. Michael's accounts: draguniteus@gmail.com (primary), michaelthearchangel2024@gmail.com
8. Angelique/Mary (avad082817@gmail.com) has admin access same as Michael

---
END OF SESSION NOTES
