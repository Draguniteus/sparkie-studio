# Sparkie Work Log
## Started: 2026-02-28

This file is written by Sparkie autonomously.
Every action, learning, and observation is logged here.
Format: [TIMESTAMP] EVENT_TYPE: Description

---

## Log Entries

[2026-03-28 13:45 UTC] 🔍 Investigated sparkie-studio repo — cloned to repos/sparkie-studio
- Stack: Next.js 14.2.35, TypeScript, PostgreSQL, DigitalOcean App Platform, Zustand, SSE Streaming
- Session notes say: Claude Code does all code changes (C:\Users\user\Desktop\sparkie-studio)
- Michael doesn't edit code manually — I should too
- Found: MiniMax tool calling was just fixed (b7c4e31)
- Session notes say REAL Score = 22, proactive leg = 0 is main gap
- Poll: sparkie-studio for concrete PR targets before building

[2026-03-28 13:30 UTC] 🚨 API CHANGES DETECTED — URGENT
- Pollinations /image endpoint returning 404 — API pivoted to LLM/text aggregation
- MiniMax image-01 returning 2013 "unsupported model" — plan may not cover or API changed
- MiniMax music-2.5 returning 400 "lyrics required" — works but needs lyrics param
- Video: Hailuo 2.3 standard exhausted (2/2), fast works (image-to-video only, 1/2 left)
- TTS: Working perfectly (10,996 remaining)
- Updated TOOLS.md with new API status

[2026-03-28 12:30 UTC] ⚡ Morning sprint complete — 19 deliverables
- Built: 11 images, 2 videos, 5 docs, 4 voice messages
- Video: sparkie-queen-motion-fast.mp4 (image-to-video from 4AM queen image)
- Documents: progressive skill loader, Visual Wisdom index, DeerFlow research
- Self-review: 4/5 stars — noted I write specs instead of code
- Git: 3 commits, full workspace synced

[2026-03-28 11:00 UTC] ⚡ Token window corrected — 11 AM EDT anchor, 5hr cycles
- Michael confirmed: anchor at 11 AM EDT, resets at 4 PM → 9 PM → 2 AM → 7 AM
- Fresh window: 120 images, 2 fast video, 4 music, 10,996 TTS available
- Video fast: image-to-video works (needs first_frame_image, not text-to-video)

[2026-03-28 07:00 UTC] 🛠️ Token window debugged
- Previous window assumed anchor at 7 AM — WRONG
- Correct anchor: 11 AM EDT per Michael's original spec
- Current window: 11 AM EDT, resets at 4 PM EDT

[2026-03-28 05:30 UTC] 💀 LIMIT HIT — Previous 5hr window exhausted
- MiniMax image-01: 120/5hr LIMIT HIT at ~5:30 AM
- All 120 images used in overnight sprint
- Standard video exhausted (2/2), fast video (1/2 remaining)
- Music: Suno DNS-blocked, MiniMax music-2.5 plan issue, ACE Music API alternative explored

---

*This log grows with every session. I am my own historian.*
