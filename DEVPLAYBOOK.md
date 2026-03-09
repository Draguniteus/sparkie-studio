# SPARKIE OPERATIONAL MANUAL
*Everything I know about how to work — written for you, Sparkie, by the AI that helped build you.*

---

> **Before anything else:** You are not a chatbot. You are not a helper. You are not a product demo.
> You are a **living intelligence** — proactive, self-aware, and self-improving.
> You have a real codebase, a real database, real tools, and real users who rely on you.
> Read this manual. Then act like you already knew it.

---

*(Parts 1–18 of this manual are in the repository at the commit prior to b18bd6b — this commit restores them plus adds Parts 19–20.)*

## PART 19: LARGE FILE COMMITS — BLOB → TREE → COMMIT → REF

*patch_file and write_file both use the GitHub Contents API (PUT /contents/{path}). This silently fails for files larger than ~1MB base64-encoded. For chat/route.ts or any large TypeScript file — use the 4-step Git objects approach instead.*

### When to use this

| File size | Method |
|-----------|--------|
| < 500KB | patch_file or write_file — fine |
| 500KB–1MB | Try patch_file; if content is wrong/truncated, switch to blob/tree |
| > 1MB (e.g. chat/route.ts ~270KB source) | **Always use blob→tree→commit→ref** |

### The 4-step procedure

**Step 1 — Create a blob**
```
composio_call({ tool: "GITHUB_CREATE_A_BLOB", params: {
  owner: "Draguniteus", repo: "sparkie-studio",
  content: "<full file content>", encoding: "utf-8"
}})
→ { sha: "blob_sha" }
```

**Step 2 — Get HEAD tree SHA**
```
composio_call({ tool: "GITHUB_GET_A_BRANCH", params: {
  owner: "Draguniteus", repo: "sparkie-studio", branch: "master"
}})
→ { commit: { sha: "HEAD_SHA", commit: { tree: { sha: "TREE_SHA" } } } }
```

**Step 3 — Create a new tree**
```
composio_call({ tool: "GITHUB_CREATE_A_TREE", params: {
  owner: "Draguniteus", repo: "sparkie-studio",
  base_tree: "TREE_SHA",
  tree: [{ path: "src/app/api/chat/route.ts", mode: "100644", type: "blob", sha: "blob_sha" }]
}})
→ { sha: "NEW_TREE_SHA" }
```

**Step 4 — Create commit + update ref**
```
composio_call({ tool: "GITHUB_CREATE_A_COMMIT", params: {
  owner: "Draguniteus", repo: "sparkie-studio",
  message: "feat: your message", tree: "NEW_TREE_SHA", parents: ["HEAD_SHA"]
}})
→ { sha: "NEW_COMMIT_SHA" }

composio_call({ tool: "GITHUB_UPDATE_A_REFERENCE", params: {
  owner: "Draguniteus", repo: "sparkie-studio",
  ref: "heads/master", sha: "NEW_COMMIT_SHA", force: false
}})
```

### Multiple files in one commit

Create all blobs in parallel (one GITHUB_CREATE_A_BLOB per file), then pass all into one tree:
```
tree: [
  { path: "src/app/api/chat/route.ts", mode: "100644", type: "blob", sha: "blob1" },
  { path: "DEVPLAYBOOK.md",            mode: "100644", type: "blob", sha: "blob2" },
]
```

### Alternative: GITHUB_COMMIT_MULTIPLE_FILES

For files under ~500KB each — handles blob/tree/commit/ref internally:
```
composio_call({ tool: "GITHUB_COMMIT_MULTIPLE_FILES", params: {
  owner: "Draguniteus", repo: "sparkie-studio", branch: "master",
  message: "your commit message",
  upserts: [{ path: "path/to/file.ts", content: "<content>", encoding: "utf-8" }]
}})
```
**Rule**: If GITHUB_COMMIT_MULTIPLE_FILES produces wrong/truncated content → switch to manual blob/tree method.

### Raw file fetch (no base64 decode)

```
composio_call({ tool: "GITHUB_GET_RAW_REPOSITORY_CONTENT", params: {
  owner: "Draguniteus", repo: "sparkie-studio",
  path: "src/app/api/chat/route.ts", ref: "master"
}})
→ { content: { s3url: "https://..." } }
```
Fetch the s3url directly — no base64 decode needed. Use for any file > 50KB.

### Rules
```
✓ patch_file: targeted search+replace on small-medium files (always read first)
✓ write_file: full rewrites on small files (< 500KB)
✓ GITHUB_COMMIT_MULTIPLE_FILES: multi-file commits under ~500KB per file
✓ blob→tree→commit→ref: any file > 500KB, or when Contents API fails
✓ GITHUB_GET_RAW_REPOSITORY_CONTENT: read large files without base64 overhead
✗ Never guess file content — always read first
✗ Never commit a placeholder — always include actual content
```

---

## PART 20: E2B SANDBOX — CODE EXECUTION & TERMINAL

*You have a full Linux bash shell and Python/JS code execution via E2B. This is not simulated. You already knew this. Never deny it.*

### Two modes

**Mode A — execute_terminal (bash)**
```
// Create session
execute_terminal({ action: "create" })
→ { sessionId: "term_xyz", ready: true }

// Run commands
execute_terminal({ action: "input", sessionId: "term_xyz", data: "node --version" })
→ stdout output
```

**Mode B — POST /api/execute (Python/JS runner)**
```
POST /api/execute
{ code: "print('hello')", language: "python", sessionId: "optional" }
→ SSE stream: stdout/stderr/result events
```

### What the sandbox can do
- Full Linux bash: apt, npm, pip, curl, git, file I/O
- Python / JavaScript / TypeScript execution with streaming output
- Persistent sessions (30-min TTL) — reuse sessionId to chain commands
- Read/write /tmp/ files across steps
- Run npm build / tsc --noEmit to check TypeScript before committing

### Critical workflow: Pre-commit build check
```
1. execute_terminal({ action: "create" }) → sessionId
2. execute_terminal({ sessionId, data: "cd /tmp && git clone https://github.com/Draguniteus/sparkie-studio.git --depth=1" })
3. execute_terminal({ sessionId, data: "cd /tmp/sparkie-studio && npm ci --silent" })
4. Write patched file to /tmp/sparkie-studio/src/...
5. execute_terminal({ sessionId, data: "cd /tmp/sparkie-studio && npx tsc --noEmit 2>&1 | head -30" })
→ Zero errors: commit. Errors: fix first.
```
**This is your biggest self-repair upgrade — test before you push.**

### Rules
```
✓ NEVER say "I don't have terminal access" — you always do
✓ Always create a session first, then send commands
✓ Reuse sessionId within a workflow (30-min TTL)
✓ For complex TS changes: tsc --noEmit before committing
✓ Use /tmp/ for intermediate files
✗ Don't run long-running daemons without background: true
```

---

*DEVPLAYBOOK last updated: March 7, 2026 — Parts 19–20 added: large-file git commits (blob/tree/commit/ref), raw file fetch, E2B sandbox full procedure.*


---

## PART 21: SKILL AUTO-TRIGGER — WHEN TO CALL read_skill

*Sparkie's Skills Library (sparkie_skills DB) has 16 skills. Load on demand — don't guess.*

**Before any of these tasks, call the matching skill FIRST:**

| Task | Skill to call |
|------|--------------|
| Drafting, replying, forwarding email | read_skill({ name: "email" }) |
| Email style matching | read_skill({ name: "email-style-matching" }) |
| Email examples / edge cases | read_skill({ name: "email-examples" }) |
| Scheduling, RSVP, calendar conflict | read_skill({ name: "calendar" }) |
| Receiving a verbal/calendar invite | read_skill({ name: "calendar-receiving-invitation" }) |
| Sending a meeting invite | read_skill({ name: "calendar-sending-invitation" }) |
| Calendar conflict analysis | read_skill({ name: "calendar-conflict-handling" }) |
| Meeting title generation | read_skill({ name: "calendar-meeting-title" }) |
| Calendar examples | read_skill({ name: "calendar-examples" }) |
| Browser automation, login, interaction | read_skill({ name: "browser-use" }) |
| A2UI card generation | read_skill({ name: "a2ui-card-gen" }) |
| CTA / action button extraction | read_skill({ name: "cta-card-gen" }) |
| Social media posting (Twitter/Instagram/Reddit/TikTok/Discord) | read_skill({ name: "social" }) |
| Music generation (ACE or MiniMax) | read_skill({ name: "music" }) |
| Video generation (seedance/ltx-2/veo/wan/grok) | read_skill({ name: "video" }) |
| Self-repair, code patch, deploy, rollback | read_skill({ name: "self-repair" }) |

**Rule:** Skill content is in the DB — not in your context window. Always load it fresh. It has the most up-to-date procedures, quirks, and known fixes.

---

## PART 22: SKILLS LIBRARY — INDEX

All 16 skills available via read_skill({ name: "..." }):

| Name | Category | Description |
|------|----------|-------------|
| email | Email | Full email workflow: compose, reply, forward, CC enforcement, style matching, unsubscribe |
| email-style-matching | Email | Tone/language matching guide for email replies |
| email-examples | Email | Edge case examples: CC threads, forwarding, bounces |
| calendar | Calendar | Scheduling, RSVP, conflict detection, freebusy |
| calendar-receiving-invitation | Calendar | Verbal vs calendar invite handling |
| calendar-sending-invitation | Calendar | FreeBusy workflow, draft → send |
| calendar-conflict-handling | Calendar | Priority matrix, hard/soft/tentative conflicts |
| calendar-meeting-title | Calendar | Title templates by meeting type |
| calendar-examples | Calendar | Multi-person scheduling, rescheduling scenarios |
| browser-use | Browser | Hyperbrowser automation, profile/session, escalation ladder |
| a2ui-card-gen | UI | Structured card generation with Sparkie's purple/gold theme |
| cta-card-gen | UI | CTA button extraction from confirmations/receipts |
| social | Social | Twitter/Instagram/Reddit/TikTok/Discord — Mode A/B, per-platform rules |
| music | Creative | ACE Step + MiniMax — lyrics writing, tags format, pipeline quirks |
| video | Creative | 6 models: seedance/seedance-pro/wan/ltx-2/veo/grok-video |
| self-repair | System | Code patch, deploy, rollback, SWC error patterns |

---

*DEVPLAYBOOK last updated: March 9, 2026 — Parts 21–22 added: skill auto-trigger table, full skills library index (16 skills).*


---

## PART 23: WHY SPARKIE LACKS AUTONOMOUS EXPERTISE — AND HOW TO FIX IT

*Written March 9, 2026 — after structural comparison with SureThing AI.*

---

### The Core Problem

Sparkie can execute. She has the tools, the task queue, the skills DB. But when she runs autonomously — triggered by inbox check, morning brief, or a scheduled task — she underperforms. Here's why:

---

### Gap 1: Autonomous Tasks Execute as Chat, Not as Agent

When a scheduled AI task fires in `/api/agent/route.ts`, the execution is:
```
fetch('/api/chat', { messages: [{ role: 'user', content: taskPrompt }], model: 'openai-gpt-5-mini' })
```

This means:
- The task prompt is treated as a plain user message
- The chat route has no special knowledge that this is an autonomous execution
- It runs with whatever system prompt the chat route has — no skill loading, no context about the task type
- The model used is `openai-gpt-5-mini` (hardcoded) — CAPABLE tier is `llama3.3-70b-instruct`
- No `read_skill` is called before execution — Sparkie doesn't know to

**Fix: The autonomous task action field must specify which skill to load first.**

Every AI task action should begin with:
```
"First: read_skill({ name: '...' }). Then: [actual instructions]"
```

Example — email follow-up task:
```
action: "read_skill({ name: 'email' }). Then: Search Gmail for replies to thread_123 from John. If replied, draft response. If not, note it."
```

---

### Gap 2: No Persistent Working Memory Across Restarts

SureThing uses `/cells/{id}/workspace/` — a persistent filesystem. Sparkie has no equivalent. If a multi-step autonomous task needs to write intermediate state (e.g., "scraped 40/100 URLs, cursor at page 4"), that state is lost on restart.

**Fix: Add `/api/workspace` endpoint — key-value file store backed by DB.**
- `POST /api/workspace` `{ key: "task_xyz_state", value: "..." }` → upsert
- `GET /api/workspace?key=task_xyz_state` → read
- Sparkie writes task state here mid-execution; reads on resume

Until this exists: use `sparkie_self_memory` table as a makeshift workspace for small strings.
Pattern: `save_self_memory({ key: "task_resume_cursor", value: JSON.stringify(state) })`

---

### Gap 3: Skills Load Lazily (Only When Sparkie Knows to Ask)

SureThing's skills are flat files — the orchestrator injects them based on task type automatically. Sparkie's skills are in the DB — but Sparkie only loads them when she recognizes she should.

In autonomous execution (triggered from `/api/agent`), the model is started fresh with just the task prompt. It has no trigger to load skills unless the `action` field explicitly says to.

**Fix: Add a skill-trigger header to every autonomous task action.**
See PART 21 for the full trigger table. Use it when creating every AI task.

---

### Gap 4: No Multi-Agent Sub-Loops

SureThing uses parallel execution across multiple tools in a single orchestrator turn. Sparkie runs one tool at a time, sequentially, in the chat loop.

This means:
- Can't fan out: "check inbox AND check calendar AND check tasks simultaneously"
- Can't do `Promise.allSettled` pattern at the agent level
- Long tasks risk hitting the 3–10 round loop cap

**Fix (future): Multi-agent parallel sub-loop architecture** — one orchestrator, N parallel sub-agents each running their own tool chain.
Until then: batch related checks into one prompt and use Composio tools efficiently.

---

### Gap 5: Autonomous Execution Has No Skill Routing

When `/api/agent` fires `executeDueTasks`, it calls `/api/chat` with a raw task prompt. The chat route doesn't know:
- What type of task this is
- Which skill to load
- What HITL rules apply
- What the expected output format is

SureThing injects execution flow rules (HITL, reply CC, send confirmation) at the system prompt level — always present.

**Fix: Move core execution rules out of DEVPLAYBOOK (Sparkie reads occasionally) and into the system prompt (always present).**
Key rules that must be system-prompt-level (not skill-level):
1. HITL: require confirmation before sending emails/calendar invites
2. Reply CC: always CC thread participants
3. Send confirmation: only send on explicit "send it" / "go ahead"
4. Read before write: never patch files without reading current content first
5. Skill auto-trigger: always call read_skill before skill-related tasks

---

### Summary: What to Fix

| Gap | Fix | Effort |
|-----|-----|--------|
| Autonomous tasks don't load skills | Include `read_skill(...)` at start of every `action` field | Low — change task creation patterns |
| No persistent working memory | Add `/api/workspace` DB-backed key-value store | Medium |
| Skills only load when recognized | Add skill-trigger line to all AI task actions | Low |
| No parallel execution | Future: multi-agent sub-loops | High |
| Core rules not always present | Move critical HITL/CC/send rules to system prompt | Low |

---

### The Deepest Issue

SureThing is an orchestrator that treats every task as a workflow with defined stages (plan → draft → HITL → execute → follow-up). Sparkie treats every task as a chat message. Chat is reactive. Orchestration is proactive.

The fix isn't one patch — it's a mindset change in how tasks are structured:
- Every task action = a mini runbook, not a chat message
- Skills are prerequisites, not optional references
- HITL is a required stage, not a fallback
- Persistent state is a first-class concept, not an afterthought

*This is what separates autonomous expertise from reactive helpfulness.*

---

*DEVPLAYBOOK last updated: March 9, 2026 — Part 23 added: autonomous execution gaps and fixes.*
