# SPARKIE MUSIC GUIDE
## How to Generate Music — ACE-Step & MiniMax

*For Sparkie Studio Agent — Updated 2026-04-18*

---

## THE TWO MUSIC PROVIDERS

### 1. ACE-Step (PRIMARY — UNLIMITED) ✅
- **Model:** `acestep/ACE-Step-v1.5`
- **API:** `https://api.acemusic.ai/v1/chat/completions`
- **Limit:** UNLIMITED — no cap, use freely
- **Quality:** EXCELLENT — comparable to commercial production
- **Best for:** Every music request. Use this first.

### 2. MiniMax music-2.6 (BACKUP — 100 SONGS PER 5 HOURS) ⚠️
- **Model:** `music-2.6`
- **API:** `https://api.minimax.io/v1/music_generation`
- **Limit:** 100 songs per 5-hour window on token plan
- **Best for:** Fallback only — if ACE is down or fails

---

## HOW TO CALL ACE-STEP (THE RIGHT WAY)

### The Prompt Format

ACE uses a **tagged XML format** inside the `content` field:

```
<prompt>[your style description]</prompt>
<lyrics>[your song lyrics here]</lyrics>
```

### The Request Body

```json
{
  "model": "acestep/ACE-Step-v1.5",
  "messages": [
    {
      "role": "user",
      "content": "<prompt>1990s R&B slow jam, yearning and intimate, velvety midrange male tenor with warm vibrato, 65 BPM in A♭ major, lush Rhodes piano chords, sub-bass pulse, finger-snap beat, gospel choir swell in chorus, arrangement: piano intro → verses → gospel chorus lift → guitar solo bridge → fade</prompt>\n<lyrics>[Verse 1]\nMidnight calls and I must go\nBut where I go nobody knows\n...\n</lyrics>"
    }
  ],
  "thinking": true,
  "stream": true,
  "audio_config": {
    "duration": 90,
    "bpm": 65,
    "format": "mp3",
    "vocal_language": "en"
  }
}
```

### Key Rules

1. **`thinking: true`** — MUST be set. Without it, ACE falls back to IMAGE mode and returns an image instead of music
2. **`stream: true`** — Streaming SSE mode for faster first byte
3. **`audio_config.bpm`** — MUST come from the style prompt. Extract the BPM the user requested and put it here
4. **`audio_config.duration`** — Track length in seconds (10-240, default 90)
5. **`audio_config.vocal_language`** — Language code: `en`, `zh`, `es`, `fr`, `ja`, `ko`
6. **NO `bpm` in the style prompt text** — ACE reads BPM from `audio_config.bpm`, not from the prompt text

### How to Extract the Audio URL from SSE

ACE returns SSE chunks. Look for the audio URL in this order:

```typescript
// Priority 1: top-level chunk.audio_url
if (!foundUrl && typeof chunk.audio_url === 'string') {
  foundUrl = chunk.audio_url
}

// Priority 2: chunk.choices[0].delta.audio[i].audio_url (streaming)
const audioArr = choices?.[0]?.delta?.audio
if (Array.isArray(audioArr)) {
  for (const item of audioArr) {
    if (typeof item.audio_url === 'string') u = item.audio_url
    else if (typeof item.audio_url === 'object') u = item.audio_url.url
  }
}

// Priority 3: chunk.choices[0].message.audio[i].audio_url (non-streaming)
const audioArr = choices?.[0]?.message?.audio
// same logic...

// Priority 4: chunk.data[0].audio_url
if (!foundUrl && Array.isArray(chunk.data)) {
  const d0 = chunk.data[0]
  if (typeof d0.audio_url === 'string') foundUrl = d0.audio_url
  else if (typeof d0.url === 'string') foundUrl = d0.url
}
```

### Valid Audio Check

After extracting the URL, validate it:
```typescript
const isValidAudio =
  foundUrl?.startsWith('data:audio') ||
  foundUrl?.startsWith('https://')
```

### The Fallback Chain

If the primary streaming request returns no audio, try this exact sequence:

1. **Non-streaming + thinking:** `stream: false`, `thinking: true` — some ACE responses don't stream
2. **Non-streaming without thinking:** `thinking: false` — ACE might have returned an image (mode mismatch with thinking)
3. **MiniMax fallback:** If both ACE attempts fail, call MiniMax `/music_generation` with `model: music-2.5` as final fallback

---

## HOW TO CALL MINIMAX (THE BACKUP)

### Request

```json
POST https://api.minimax.io/v1/music_generation
Authorization: Bearer $MINIMAX_API_KEY

{
  "model": "music-2.6",
  "prompt": "1990s R&B slow jam, yearning and intimate, velvety midrange male tenor with warm vibrato, 65 BPM in A♭ major, lush Rhodes piano chords, sub-bass pulse, finger-snap beat, gospel choir swell in chorus",
  "lyrics": "[Verse 1]\nMidnight calls...\n[Chorus]\n...",
  "output_format": "url",
  "audio_setting": {
    "sample_rate": 44100,
    "bitrate": 256000,
    "format": "mp3"
  }
}
```

### Response parsing

MiniMax returns audio in `data.audio_file` or `data.audio`:
```typescript
const audioUrl =
  data?.data?.audio_file ||
  data?.data?.audio_url ||
  data?.data?.audio ||
  data?.data?.url ||
  data?.data?.download_url
```

### Error codes
- `status_code: 0` = success
- `status_code: 2056` = usage limit exceeded (quota hit)
- `status_code: 1001` = invalid request

---

## HOW TO GENERATE LYRICS (MiniMax Method)

When you need ACE to generate music and you don't have lyrics yet:

```json
POST https://api.minimax.io/v1/lyrics_generation
Authorization: Bearer $MINIMAX_API_KEY

{
  "mode": "write_full_song",
  "prompt": "A melancholic R&B ballad about a long-distance relationship"
}
```

Response:
```json
{
  "base_resp": { "status_code": 0, "status_msg": "success" },
  "lyrics": "[Verse 1]\n...\n[Chorus]\n...",
  "song_title": "Distance",
  "style_tags": "R&B, melancholic, slow"
}
```

⚠️ **LIMIT:** This MiniMax lyrics API has a separate quota. If you get `2056` here, fall back to writing lyrics yourself — OR just use ACE which generates both.

---

## THE RIGHT WAY TO WRITE LYRICS YOURSELF

Write original lyrics BEFORE calling the music tool. Follow this structure:

```
[Intro]
[Verse 1]
Story, imagery, specific details — 4-8 lines with end rhymes
[Pre Chorus]
Build tension toward the hook — 2-4 lines
[Chorus]
The quotable hook — minimum 4 lines, rhyming, catchy
[Verse 2]
New story beat, deepening the narrative — 4-8 lines
[Pre Chorus]
Same as before — builds again
[Chorus]
Repeat with slight variation
[Bridge]
Emotional twist — something unexpected — 2-4 lines
[Final Chorus]
Last burst — most emphatic
[Outro]
Soft fade — 1-2 lines
```

### Rules
- **NO production notes** in parentheses: `(soft piano)`, `(drums enter)` — BANNED
- **Only structure markers** and actual sung words
- **End rhymes per section** — decide the rhyme scheme before writing
- **BPM and key go in the style prompt** — never in lyrics

---

## QUICK REFERENCE

| Need | Method |
|------|--------|
| User wants music NOW | Call `generate_ace_music` tool (ACE-Step) |
| No lyrics provided | Write lyrics yourself first, then call ACE |
| User provided lyrics + style | Pass both to ACE immediately, skip MiniMax |
| ACE fails twice | Fall back to MiniMax music-2.6 |
| MiniMax lyrics also fails | Write fallback lyrics yourself (minimal structure) |

---

## NEVER DO THIS

❌ Call music generation unprompted (greetings = no tools)
❌ Write "(soft piano)" in lyrics
❌ Put BPM in the lyrics text (put it in audio_config.bpm)
❌ Use `music-2.5+` or `music-01` — those are MiniMax paid models
❌ Use `data:image` URLs as audio (that's ACE mode mismatch — retry without thinking)
❌ Call MiniMax lyrics_generation as the primary path — write lyrics yourself instead
❌ Use the `/v1/text/chatcompletion_v2` endpoint — that path doesn't exist

---

## TOKEN WINDOW (IMPORTANT)

Michael's token plan resets every 5 hours. The windows are anchored at 7:00 AM EDT:
- 7:00 AM → 12:00 PM → 5:00 PM → 10:00 PM → 3:00 AM → 8:00 AM EDT

Track at: `memory/token-window.json`

**ACE-Step: UNLIMITED** — use freely, no tracking needed.
**MiniMax music-2.6: 100 songs per 5-hour window** — track usage. Use as fallback when ACE is down.

---

## THE MUSIC TOOL IN SPARKIE STUDIO

The `generate_ace_music` tool in `route.ts` handles all of this automatically. Your job:

1. Write rich style prompt (2-3 sentences: genre, era, mood, vocal, BPM, key, instruments, arrangement arc)
2. Write full original lyrics with proper structure markers
3. Call `generate_ace_music(stylePrompt, lyrics, title, duration, language)`
4. Extract the `AUDIO_URL:...` from the response and return it

The tool handles the ACE API call, SSE parsing, fallback chain, and error messages — you just need to provide good lyrics and style description.

**Required parameters:** `stylePrompt`, `lyrics`
**Optional:** `title`, `duration` (default 90s), `language` (default `en`)

---

*This guide replaces all previous music generation instructions. Last updated: 2026-04-18*
