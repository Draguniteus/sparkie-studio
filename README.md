# 🐝 Sparkie Studio V2

<p align="center">
  <img src="https://img.shields.io/badge/Version-2.0.0-FFC30B.svg" alt="Version">
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License">
  <img src="https://img.shields.io/badge/Framework-Next.js_14-black.svg" alt="Next.js">
  <img src="https://img.shields.io/badge/Theme-Queen_Bee-FFC30B.svg" alt="Theme">
</p>

<p align="center">
  <strong>Polleneer's native AI workspace — Chat, Code, Create.</strong>
</p>

<p align="center">
  Like Grok is to X/Twitter, Sparkie is to Polleneer.
</p>

---

## ✨ Features

### 💬 AI Chat
- **Multi-model support** — DeepSeek V3, Llama 3.3, Qwen 2.5, Gemini, Mistral (free tier)
- **Streaming responses** — Real-time token-by-token output
- **Model selector** — Switch models per conversation
- **Markdown & code highlighting** — Beautiful formatted responses
- **File attachments** — Drag and drop images, docs, code files

### 💻 Live IDE Panel
- **Monaco Editor** — VS Code's engine in the browser
- **File Explorer** — Create, edit, rename, delete files
- **Real-time Preview** — See output instantly
- **Current Process** — Watch Sparkie work in real-time
- **Download** — Export files, folders, or entire projects as ZIP

### 🎨 Image Generation
- **Pollinations AI** — Free image generation
- **Gallery** — Browse and manage generated images
- **Download** — Save images locally

### 🔍 Research & Analysis
- **Web search** — Tavily-powered research
- **Document analysis** — Upload and analyze files
- **Data visualization** — Charts and graphs in the IDE

---

## 🚀 Quick Start

### Development

```bash
# Clone
git clone https://github.com/Draguniteus/sparkie-studio.git
cd sparkie-studio

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Environment Variables

Create a `.env.local` file:

```env
OPENROUTER_API_KEY=your_openrouter_key
TAVILY_API_KEY=your_tavily_key
DEEPGRAM_API_KEY=your_deepgram_key
```

---

## 🎨 Queen Bee Theme

| Element | Color | Hex |
|---------|-------|-----|
| Primary Gold | Honey Gold | `#FFC30B` |
| Gold Light | Bright Gold | `#FFD700` |
| Gold Dark | Deep Gold | `#E5A800` |
| Background | Deep Black | `#1A1A1A` |
| Surface | Dark Gray | `#252525` |
| Elevated | Medium Gray | `#2D2D2D` |

---

## 🏗️ Tech Stack

| Category | Technology |
|----------|-----------|
| **Framework** | Next.js 14 (App Router) |
| **UI** | Tailwind CSS |
| **State** | Zustand |
| **Code Editor** | Monaco Editor |
| **Icons** | Lucide React |
| **Fonts** | Inter, JetBrains Mono |
| **LLM Gateway** | OpenRouter (free models) |
| **Deploy** | DigitalOcean App Platform |

---

## 📁 Project Structure

```
sparkie-studio/
├── src/
│   ├── app/
│   │   ├── globals.css          # Queen Bee theme + Tailwind
│   │   ├── layout.tsx           # Root layout
│   │   └── page.tsx             # Main app shell
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx      # Left nav + chat history
│   │   │   ├── MainPanel.tsx    # Center workspace
│   │   │   └── IDEPanel.tsx     # Right IDE panel
│   │   └── chat/
│   │       ├── WelcomeView.tsx  # Landing/home view
│   │       ├── ChatView.tsx     # Active chat view
│   │       ├── ChatInput.tsx    # Input with model selector
│   │       └── MessageBubble.tsx # Message rendering
│   └── store/
│       └── appStore.ts          # Zustand global state
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.mjs
```

---

## 📝 License

MIT License — Built with ❤️ by the Polleneer Team

🐝 Queen Bee Edition 🐝
