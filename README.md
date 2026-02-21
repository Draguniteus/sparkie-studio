# Sparkie Studio

> AI-powered coding environment — Polleneer's native agent. Build anything with a multi-model agent loop, live IDE, real-time preview, and WebContainers.

## Stack

- **Framework**: Next.js 14 (App Router, Edge Runtime)
- **UI**: Tailwind CSS + Zustand state management
- **AI Models**: OpenCode Zen gateway (GLM-5 Planner · MiniMax M2.5 Builder)
- **Media**: Pollinations.ai (image/video generation)
- **Voice**: Deepgram Nova-2 (speech-to-text)
- **Search**: Tavily (web context injection)
- **Deploy**: DigitalOcean App Platform

## Features

- **Agent Loop**: GLM-5 plans structure → MiniMax M2.5 builds with streaming → live code view
- **Live Preview**: Self-contained HTML/CSS/JS renders instantly in sandboxed iframe
- **WebContainers**: Full Node.js runtime for Express/Vite/Next.js projects
- **File IDE**: File explorer, Monaco-style editor, syntax highlighting, download
- **Assets Gallery**: Date-grouped catalogue of all generated files across sessions
- **Voice Input**: Hold mic button, speak, Deepgram transcribes to prompt
- **Web Search**: Tavily injects live docs/context mid-build when needed

## Development

```bash
npm install
cp .env.example .env.local   # fill in your API keys
npm run dev
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENCODE_API_KEY` | ✅ | OpenCode Zen gateway key |
| `TAVILY_API_KEY` | Optional | Enables web search in agent loop |
| `DEEPGRAM_API_KEY` | Optional | Enables voice input |
| `POLLINATIONS_API_KEY` | Optional | Unlocks higher rate limits |

## Architecture

```
User prompt
  └─ /api/agent (Edge)
       ├─ GLM-5 Planner         → build plan JSON
       ├─ [Tavily search]        → context (optional)
       └─ MiniMax M2.5 Builder  → streaming ---FILE:--- blocks
            └─ fileParser.ts    → splits into FileNode[]
                 └─ Preview.tsx → live iframe render
```

## Security

- API keys never exposed to client (all LLM calls server-side via Edge routes)
- Image proxy validates model + sanitizes params (no SSRF)
- Audio upload capped at 10 MB
- Request bodies capped at 50 KB
- Streaming builds time out after 60s

## License

MIT
