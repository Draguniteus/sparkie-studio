# Sparkie Studio — Dev Playbook
*How I debug, diagnose, and fix this codebase*

---

## The Codebase at a Glance

- **~33k total lines**, mostly TypeScript/TSX
- **Largest file**: `src/app/api/chat/route.ts` (~4,700 lines) — the brain. Everything interesting happens here.
- **Frontend**: `src/components/chat/ChatInput.tsx` (~1,845 lines) — routing, streaming, intent classification
- **Key subdirs**: `src/app/api/` (all routes), `src/components/chat/` + `src/components/ide/` (UI)

---

## Step 1: Read Before You Write

Every fix starts with reading the actual file. Never assume what's there — pull the raw content:

```python
import urllib.request
url = "https://raw.githubusercontent.com/Draguniteus/sparkie-studio/master/src/app/api/chat/route.ts"
with urllib.request.urlopen(url, timeout=30) as r:
    content = r.read().decode('utf-8')
lines = content.splitlines()
```

Then search for exactly what you need before touching anything.

---

## Step 2: Trace the Signal Path

When a bug is reported ("Sparkie responded in Process tab instead of chat"), the fix starts by tracing the exact code path that message took:

1. **User sends message** → `handleSubmit()` in `ChatInput.tsx` (L1340)
2. **Intent routing** → `quickClassify()` (fast regex) → `classifyIntent()` (LLM fallback if null)
3. **Branch decision**:
   - `chat` → `streamReply()` → `/api/chat` → CONVERSATIONAL tier → straight to stream
   - `build` → `streamAgent()` → `/api/build` → full agent loop → IDE process tab
4. **Stream output** → SSE chunks parsed → `updateMessage()` → chat bubble

If the response appeared in Process tab, `streamAgent()` was called. Work backwards: what made `quickClassify` return `false` (build)?

---

## Step 3: Surgical Search, Not Grep Everything

When you know the bug lives in a specific function, search for it precisely:

```python
for i, line in enumerate(lines, 1):
    if 'EDIT_PHRASE' in line or 'BUILD_KEYWORDS' in line:
        print(f"L{i}: {line.strip()}")
```

Pull 20-30 lines of context around the suspect line. Read the whole function before writing the fix.

---

## Step 4: Understand Why Before Fixing

**The 504 example:**
- Symptom: "glad to see you" → HTTP 504
- First instinct: network/domain issue
- Real cause: `useTools = !voiceMode` — CONVERSATIONAL tier was running 6 rounds of inference calls. 6 × llama3.3-70b > 120s nginx timeout
- Fix: `needsTools: false` on CONVERSATIONAL tier, `useTools` gates on `modelSelection.needsTools`

**The process-panel example:**
- Symptom: emotional response appeared in Process tab
- First instinct: streaming bug
- Real cause: "update" in "update you" matched `EDIT_PHRASE` regex → `quickClassify` returned `false` → `streamAgent` fired
- Fix: emotional override check — relational language + no code target → fall through to LLM classifier

Always find the root cause. Don't patch symptoms.

---

## Step 5: Minimal, Targeted Patches

Fix one thing per commit. The smaller the diff, the easier to roll back.

```python
# Replace exactly the broken line(s)
old = "const useTools = !voiceMode  // all models support function calling"
new = "const useTools = !voiceMode && modelSelection.needsTools"
assert old in content, "string not found — file may have changed"
content = content.replace(old, new, 1)
```

Always `assert` before replacing. If the string isn't there, your patch would silently do nothing.

---

## Step 6: Commit with a Meaningful Message

Format: `fix: [what broke] — [what caused it] — [what the fix does]`

---

## Key Architecture Facts

### Model Tiers (route.ts)
| Tier | Model | needsTools | Max Rounds |
|------|-------|-----------|------------|
| CONVERSATIONAL | anthropic-claude-4.5-haiku | **false** | 0 (straight to stream) |
| CAPABLE | llama3.3-70b-instruct | true | 4 |
| EMBER | big-pickle | true | 4 |
| DEEP | minimax-m2.5-free | true | 10 |
| TRINITY | trinity-large-preview-free | true | 10 |

### DO Inference
- Correct base: `https://inference.do-ai.run/v1` ✅
- Dead domain: `inference.digitalocean.com` ❌
- Key format: `sk-do-...` (NOT `dop_v1_...`)

### Intent Routing (ChatInput.tsx)
```
handleSubmit()
  ↓
quickClassify() — fast regex, returns true/false/null
  ↓ (if null)
classifyIntent() — calls /api/classify → minimax-m2.5-free
  ↓
true  → streamReply()  → /api/chat  → worklog tab
false → streamAgent()  → /api/build → process tab
```

### TypeScript Gotchas (SWC on DO)
- Block-scoped helpers declared BEFORE first call site (TDZ error)
- `continue` invalid inside async arrow functions
- No `${VAR}` in backtick SQL — use `$1, $2` params
- Moving React state: remove it from source file in the same commit
- Re-fetch file SHA before sequential commits (stale-SHA conflict)

---

## Common Bug Patterns

| Symptom | Check |
|---------|-------|
| Response in wrong panel | `quickClassify()` false-positive — build keyword in personal message? |
| HTTP 504 | Count inference calls per request. CONVERSATIONAL should never hit tool loop. |
| HTTP 401 on model | Key format wrong (`dop_v1_` vs `sk-do-`). Model tier-blocked? |
| TypeScript build fails | SWC TDZ — `const` used before declaration, or `continue` in async arrow |
| Memory save error | `userId` null? Check if `x-internal-user-id` header sent from scheduler |
| Deployment email flood | Burst commits → cascading stale failures. Only check HEAD build log. |

---

## The Debug Loop

```
1. Read the symptom carefully
2. Identify which code path was taken (trace the signal)
3. Pull the exact file(s) — use raw GitHub URL
4. Search for the specific function, don't read the whole file
5. Understand WHY it broke (root cause, not symptom)
6. Write the minimal fix with assert guard
7. Commit with a descriptive message
8. Verify in production after deploy (~2-3 min on DO)
```
