# 🐝 Sparkie Studio V1

<p align="center">
  <img src="https://img.shields.io/badge/Version-1.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License">
  <img src="https://img.shields.io/badge/Framework-Flask-orange.svg" alt="Flask">
</p>

<p align="center">
  <strong>A comprehensive AI workspace featuring chat, code execution, and image generation</strong>
</p>

<p align="center">
  Built with the Polleneer Queen Bee theme (Black & Gold)
</p>

---

## ✨ Features

### 💬 Chat Interface
- **MiniMax M2.1 AI** - Powerful language model for intelligent conversations
- **Real-time streaming** - See responses as they're generated
- **Code highlighting** - Beautiful syntax highlighting for code blocks
- **Markdown support** - Rich text formatting in messages
- **File attachments** - Drag and drop images into chat

### 💻 Full IDE Window (Toggleable)
- **Live Process Monitoring** - Watch code execution in real-time with status indicators
- **File Explorer** - Create, edit, rename, delete, and manage multiple files
- **Live Preview Panel** - See visualizations, plots, and HTML output instantly
- **Python Execution** - In-browser Pyodide integration (no server needed)
- **Auto-save** - All files persist in localStorage
- **Toggle Shortcut** - Press `Ctrl+\` or click the Code tab

### 🎨 Image Generation
- **ModelScope AI** - High-quality image generation
- **Pollinations AI** - Free fallback (no API key needed)
- **Image Gallery** - Browse and manage generated images
- **Download Support** - Save images locally

### 🔐 Authentication
- **User registration** - Create accounts with username, email, and password
- **Secure sessions** - LocalStorage-based persistence
- **No database required** - V1 stores everything locally

---

## 🚀 Quick Start

### Option 1: Local Development (Static Files)

1. **Clone or download the project:**
```bash
cd sparkie-studio
```

2. **Start a local server:**
```bash
# Using Python
python -m http.server 8080

# Using Node.js
npx serve .

# Using PHP
php -S localhost:8080
```

3. **Open in browser:**
```
http://localhost:8080
```

### Option 2: Full Backend (With Flask)

1. **Install Python dependencies:**
```bash
cd backend
pip install -r requirements.txt
```

2. **Start the server:**
```bash
cd ..
python backend/main.py
```

3. **Open in browser:**
```
http://localhost:8080
```

---

## 📦 Deployment to GitHub + Railway

### Step 1: Create GitHub Repository

1. **Go to GitHub and create a new repository:**
   - Visit: https://github.com/new
   - Repository name: `sparkie-studio`
   - Description: "A comprehensive AI workspace with chat, code, and image generation"
   - Make it **Public** or **Private**
   - Do NOT initialize with README (we already have one)

2. **Open terminal and navigate to your project:**
```bash
cd /workspace/sparkie-studio
```

3. **Initialize git and push to GitHub:**
```bash
# Initialize git repository
git init
git add .
git commit -m "Initial commit: Sparkie Studio V1 with IDE, Chat, and Images"

# Add your GitHub repository (replace with your username)
git remote add origin https://github.com/YOUR_USERNAME/sparkie-studio.git

# Push to GitHub
git branch -M main
git push -u origin main
```

4. **Verify on GitHub:**
   - Visit your repository URL
   - You should see all files uploaded

### Step 2: Deploy to Railway

1. **Create Railway account:**
   - Visit: https://railway.app
   - Sign up with GitHub

2. **Create new project:**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your `sparkie-studio` repository

3. **Configure environment variables:**
   - Go to your project settings
   - Add the following variables:
   ```
   MINIMAX_API_KEY=your_minimax_api_key
   MINIMAX_GROUP_ID=your_minimax_group_id
   MODELSCOPE_API_KEY=your_modelscope_api_key
   PORT=8080
   ```

4. **Deploy:**
   - Railway will automatically detect it's a Flask app
   - Click "Deploy" and wait for build to complete
   - Your app will be available at: `https://sparkie-studio.up.railway.app`

### Step 3: Update API Configuration (Optional)

For development, you can also configure API keys in the browser:
1. Open your deployed app
2. Click Settings (or press `Ctrl+,`)
3. Enter your API keys
4. Keys are stored locally in your browser

---

## 🎨 Queen Bee Theme

The application features the Polleneer Queen Bee aesthetic:

| Element | Color | Hex |
|---------|-------|-----|
| Primary Gold | Honey Gold | `#FFC30B` |
| Gold Light | Bright Gold | `#FFD700` |
| Gold Dark | Deep Gold | `#E5A800` |
| Background | Deep Black | `#1A1A1A` |
| Secondary | Dark Gray | `#252525` |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + \` | Toggle IDE Panel |
| `Ctrl + 1` | Switch to Chat |
| `Ctrl + 2` | Switch to Images |
| `Ctrl + 3` | Switch to Code (opens IDE) |
| `Ctrl + Enter` | Send Message |
| `F5` | Run Code (in IDE) |
| `Ctrl + ,` | Open Settings |
| `Escape` | Close Modals |

---

## 🔧 API Configuration

### MiniMax API Setup

1. **Get your API credentials:**
   - Visit: https://api.minimax.chat
   - Sign up and create an account
   - Copy your API Key and Group ID from the dashboard

2. **Configure in Sparkie Studio:**
   - Open Settings
   - Enter your MiniMax API Key
   - Enter your MiniMax Group ID

### ModelScope API Setup (Optional)

1. **Get your API key:**
   - Visit: https://modelscope.cn
   - Create an account and get your API key

2. **Configure in Sparkie Studio:**
   - Open Settings
   - Enter your ModelScope API Key
   - *Note: If not configured, falls back to free Pollinations AI*

---

## 💾 Data Storage

All data is stored locally in your browser:

| Data Type | Limit | Storage |
|-----------|-------|---------|
| Chats | 100 messages per chat | localStorage |
| Files | Unlimited | localStorage |
| Images | Last 50 generated | localStorage |
| Settings | Persisted | localStorage |

**Note:** Data is browser-specific and won't sync across devices.

---

## 📁 Project Structure

```
sparkie-studio/
├── index.html              # Main SPA entry point (400+ lines)
├── Procfile                # Railway deployment config
├── README.md               # This file
├── backend/
│   ├── main.py            # Flask API proxy server (145 lines)
│   └── requirements.txt   # Python dependencies
├── css/
│   ├── main.css           # Queen Bee theme (714 lines)
│   ├── chat.css           # Chat interface (480 lines)
│   ├── ide.css            # IDE panel (573 lines)
│   └── components.css     # UI components (732 lines)
├── js/
│   ├── app.js             # Main application (289 lines)
│   ├── api.js             # API integration (329 lines)
│   ├── chat.js            # Chat functionality (415 lines)
│   ├── config.js          # Configuration (242 lines)
│   ├── ide.js             # IDE with Pyodide (630 lines)
│   ├── images.js          # Image generation (261 lines)
│   ├── storage.js         # LocalStorage (529 lines)
│   └── ui.js              # UI state (396 lines)
└── assets/                # Static assets
```

---

## 🐛 Troubleshooting

### IDE not loading Pyodide
```
✅ Ensure you have an internet connection
✅ Pyodide loads from CDN (~10MB first load)
✅ Try refreshing the page
```

### API errors
```
✅ Verify your API keys in Settings
✅ Check your API quota and rate limits
✅ Ensure Group ID is correct for MiniMax
```

### Chat not loading
```
✅ Clear browser cache
✅ Check localStorage is enabled
✅ Try incognito mode
```

### Railway deployment fails
```
✅ Check all files are committed to Git
✅ Verify environment variables are set
✅ Check Railway build logs for errors
✅ Ensure requirements.txt is in backend/ folder
```

---

## 🛠️ Technology Stack

| Category | Technology |
|----------|------------|
| **Frontend** | Vanilla JavaScript, HTML5, CSS3 |
| **Backend** | Flask (Python) |
| **APIs** | MiniMax M2.1, ModelScope, Pollinations AI |
| **Code Execution** | Pyodide (WebAssembly) |
| **Icons** | Font Awesome 6.4 |
| **Fonts** | Inter, JetBrains Mono |
| **Deployment** | Railway, GitHub |
| **Storage** | localStorage |

---

## 📝 License

MIT License - Feel free to use, modify, and distribute!

---

## 🙏 Credits

- [MiniMax](https://minimax.chat) - AI Chat API
- [ModelScope](https://modelscope.cn) - Image Generation API
- [Pollinations AI](https://pollinations.ai) - Free image generation fallback
- [Pyodide](https://pyodide.org) - Python in the browser
- [Font Awesome](https://fontawesome.com) - Icons
- [Inter](https://fonts.google.com/specimen/Inter) - UI Font
- [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) - Code Font
- [Flask](https://flask.palletsprojects.com) - Web Framework
- [Railway](https://railway.app) - Deployment Platform

---

<p align="center">
  Built with ❤️ by the Polleneer Team<br>
  🐝 Queen Bee Edition 🐝
</p>
