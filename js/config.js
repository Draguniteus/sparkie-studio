/**
 * Sparkie Studio Configuration
 * Centralized configuration for API keys and settings
 */

const Config = {
    // API Configuration
    api: {
        // MiniMax API Configuration
        minimax: {
            baseUrl: 'https://api.minimax.chat/v1',
            groupId: '', // To be set by user
            apiKey: '',  // To be set by user
            model: 'MiniMax-M2.1',
            maxTokens: 4000,
            temperature: 0.7
        },
        
        // ModelScope API Configuration
        modelscope: {
            baseUrl: 'https://api-inference.modelscope.cn/v1',
            apiKey: '',  // To be set by user
            model: 'Z Turbo',  // ModelScope Z-Turbo as primary
            defaultSize: '1024x1024',
            defaultSteps: 30
        },
        
        // Pollinations AI Configuration (Backup)
        pollinations: {
            baseUrl: 'https://image.pollinations.ai',
            apiKey: '',  // To be set by user
            defaultModel: 'zimage',  // Z-Image Turbo
            models: {
                'zimage': 'Z-Image Turbo (Fast & Cheap)',
                'turbo': 'SDXL Turbo (High Quality)',
                'flux': 'FLUX Schnellflux (Best Quality)',
                'klein': 'FLUX.2 Klein (Detailed)',
                'seedream': 'Seedream 4.0 (Creative)',
                'nanobanana': 'NanoBanana (Fast)'
            },
            defaultSize: '1024x1024',
            defaultSteps: 30
        },
        
        // Backend Proxy (for production)
        backend: {
            baseUrl: '/api'
        }
    },
    
    // Pyodide Configuration
    pyodide: {
        indexUrl: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/',
        packagesUrl: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/',
        defaultPackages: ['numpy', 'pandas', 'matplotlib', 'pillow']
    },
    
    // UI Configuration
    ui: {
        maxMessages: 100,
        maxInputLength: 4000,
        typingIndicator: true,
        autoSave: true,
        saveInterval: 5000, // 5 seconds
        theme: 'dark'
    },
    
    // LocalStorage Keys
    storage: {
        user: 'sparkie_user',
        settings: 'sparkie_settings',
        chats: 'sparkie_chats',
        currentChat: 'sparkie_current_chat',
        files: 'sparkie_files',
        images: 'sparkie_images'
    },
    
    // Default Files for IDE
    defaultFiles: {
        'main.py': '# Welcome to Sparkie IDE!\n# Write Python code here and click Run to execute\n\nimport sys\n\ndef greet(name):\n    """Greet the user with a friendly message"""\n    print(f"Hello, {name}! *")\n    print(f"Python version: {sys.version}")\n    return f"Welcome to Sparkie Studio, {name}!"\n\n# Execute the greet function\nresult = greet("Developer")\nprint(f"\n{result}")\nprint("\n* Try editing this code or writing your own!")',
        
        'data_analysis.py': '# Data Analysis Example\nimport pandas as pd\nimport numpy as np\n\n# Create sample data\ndata = {\n    "name": ["Alice", "Bob", "Charlie", "Diana", "Eve"],\n    "age": [25, 30, 35, 28, 32],\n    "score": [85.5, 92.0, 78.5, 95.0, 88.0]\n}\n\ndf = pd.DataFrame(data)\nprint("Sample Data:")\nprint(df.to_string(index=False))\nprint(f"\nAverage Score: {df["score"].mean():.2f}")\nprint(f"Oldest person: {df.loc[df["age"].idxmax(), "name"]}")',
        
        'visualization.py': '# Visualization Example\nimport matplotlib.pyplot as plt\nimport numpy as np\n\n# Generate sample data\nx = np.linspace(0, 10, 100)\ny1 = np.sin(x)\ny2 = np.cos(x)\n\n# Create plot\nplt.figure(figsize=(10, 6))\nplt.plot(x, y1, label="sin(x)", color="#FFC30B", linewidth=2)\nplt.plot(x, y2, label="cos(x)", color="#3B82F6", linewidth=2)\n\nplt.title("Sine and Cosine Waves", fontsize=14, fontweight="bold")\nplt.xlabel("x", fontsize=12)\nplt.ylabel("y", fontsize=12)\nplt.legend()\nplt.grid(True, alpha=0.3)\nplt.tight_layout()\n\n# Save plot\nplt.savefig("/tmp/plot.png", dpi=150, bbox_inches="tight")\nprint("Plot saved to /tmp/plot.png")\nplt.show()',
        
        'web_demo.html': '<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>Sparkie Studio Demo</title>\n    <style>\n        * {\n            margin: 0;\n            padding: 0;\n            box-sizing: border-box;\n        }\n        body {\n            font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;\n            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);\n            min-height: 100vh;\n            display: flex;\n            justify-content: center;\n            align-items: center;\n            padding: 20px;\n        }\n        .card {\n            background: rgba(255, 255, 255, 0.1);\n            backdrop-filter: blur(10px);\n            border: 1px solid rgba(255, 195, 11, 0.3);\n            border-radius: 20px;\n            padding: 40px;\n            text-align: center;\n            max-width: 400px;\n            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);\n        }\n        h1 {\n            color: #FFC30B;\n            font-size: 28px;\n            margin-bottom: 15px;\n            text-shadow: 0 2px 10px rgba(255, 195, 11, 0.3);\n        }\n        p {\n            color: #e0e0e0;\n            font-size: 16px;\n            line-height: 1.6;\n            margin-bottom: 25px;\n        }\n        .features {\n            display: grid;\n            grid-template-columns: repeat(2, 1fr);\n            gap: 15px;\n            margin-top: 20px;\n        }\n        .feature {\n            background: rgba(255, 195, 11, 0.1);\n            border: 1px solid rgba(255, 195, 11, 0.2);\n            border-radius: 10px;\n            padding: 15px;\n            color: #FFC30B;\n            font-size: 12px;\n        }\n        .feature i {\n            font-size: 24px;\n            margin-bottom: 8px;\n            display: block;\n        }\n    </style>\n</head>\n<body>\n    <div class="card">\n        <h1>* Sparkie Studio</h1>\n        <p>Your AI-powered coding workspace</p>\n        <div class="features">\n            <div class="feature">\n                <i class="fas fa-comments"></i>\n                AI Chat\n            </div>\n            <div class="feature">\n                <i class="fas fa-image"></i>\n                Image Gen\n            </div>\n            <div class="feature">\n                <i class="fas fa-code"></i>\n                Code IDE\n            </div>\n            <div class="feature">\n                <i class="fas fa-chart-bar"></i>\n                Analysis\n            </div>\n        </div>\n    </div>\n</body>\n</html>'
    },
    
    // Image Generation Defaults
    imageDefaults: {
        sizes: {
            '1024x1024': { width: 1024, height: 1024 },
            '1280x720': { width: 1280, height: 720 },
            '720x1280': { width: 720, height: 1280 }
        },
        steps: [20, 30, 50]
    },
    
    // Initialize with environment variables (server-side only)
    init() {
        // API keys are now managed server-side via Railway environment variables
        // No client-side environment variables needed
        
        return this;
    },
    
    // Get API key safely
    getMiniMaxKey() {
        return this.api.minimax.apiKey;
    },
    
    getMiniMaxGroupId() {
        return this.api.minimax.groupId;
    },
    
    getModelScopeKey() {
        return this.api.modelscope.apiKey;
    },
    
    // Note: API keys are now managed server-side via Railway
    // No client-side set/load functions needed
    
    // Save config to localStorage (non-sensitive data only)
    saveToStorage() {
        if (StorageManager.isAvailable()) {
            const settings = StorageManager.get('sparkie_settings') || {};
            // Don't save API keys - they're server-side only
            StorageManager.set('sparkie_settings', settings);
        }
    },
    
    // Load config from localStorage (non-sensitive data only)
    loadFromStorage() {
        if (StorageManager.isAvailable()) {
            const settings = StorageManager.get('sparkie_settings');
            // Load theme, preferences, etc. but NOT API keys
            if (settings) {
                // Theme and other settings
                if (settings.theme) {
                    this.ui.theme = settings.theme;
                }
            }
        }
        return this;
    },
    
    // Get Pollinations API key
    getPollinationsKey() {
        return this.api.pollinations.apiKey;
    },
    
    // Set Pollinations API key
    setPollinationsKey(key) {
        this.api.pollinations.apiKey = key;
        this.saveToStorage();
    }
};

// Initialize config on load
Config.init();

window.Config = Config;
