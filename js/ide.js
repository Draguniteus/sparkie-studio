/**
 * IDE Module - Full IDE Window with Live Process/Files/Preview
 * Toggleable panel with Pyodide integration
 */

const IDE = {
    // State
    isOpen: false,
    isPyodideReady: false,
    pyodide: null,
    currentTab: 'files',
    isRunning: false,
    outputLines: [],

    // Chat State
    chatHistory: [],
    isChatLoading: false,

    // Workspace Chat State
    workspaceChatHistory: [],
    isWorkspaceChatLoading: false,

    // DOM Elements
    elements: {
        panel: null,
        editor: null,
        output: null,
        preview: null,
        fileTree: null,
        runBtn: null,
        closeBtn: null,
        tabs: null,
        // Chat elements
        chatPanel: null,
        chatMessages: null,
        chatInput: null,
        chatSendBtn: null,
        tabPanels: null,
        // Workspace Chat elements
        workspaceChatMessages: null,
        workspaceChatInput: null,
        workspaceChatSend: null
    },
    
    // Initialize IDE module
    init() {
        this.elements = {
            panel: document.getElementById('ide-panel'),
            editor: document.getElementById('code-editor'),
            output: document.getElementById('ide-output'),
            preview: document.getElementById('ide-preview'),
            fileTree: document.getElementById('file-tree'),
            runBtn: document.getElementById('ide-run'),
            closeBtn: document.getElementById('ide-close'),
            tabs: document.querySelectorAll('.ide-tab'),
            tabPanels: {
                files: document.getElementById('ide-files-panel'),
                output: document.getElementById('ide-output-panel'),
                preview: document.getElementById('ide-preview-panel')
            },
            // Legacy Chat elements (no longer used, kept for compatibility)
            chatPanel: null,
            chatMessages: null,
            chatInput: null,
            chatSendBtn: null,
            // Workspace Chat elements
            workspaceChatMessages: document.getElementById('workspace-chat-messages'),
            workspaceChatInput: document.getElementById('workspace-chat-input'),
            workspaceChatSend: document.getElementById('workspace-chat-send')
        };

        FileManager.init();
        this.bindEvents();
        this.renderFileTree();
        this.loadCurrentFile();
        this.bindWorkspaceChatEvents();

        return this;
    },
    
    // Bind event listeners
    bindEvents() {
        // Toggle IDE panel - add event listener to code button
        const codeButton = document.querySelector('[data-view="code"]');
        if (codeButton) {
            codeButton.addEventListener('click', () => {
                console.log('IDE: Code button clicked, calling toggle()');
                this.toggle();
            });
            console.log('IDE: Event listener attached to code button');
        } else {
            console.warn('IDE: Code button not found');
        }

        // Close button
        if (this.elements.closeBtn) {
            this.elements.closeBtn.addEventListener('click', () => this.close());
        }

        // Run button
        if (this.elements.runBtn) {
            this.elements.runBtn.addEventListener('click', () => this.runCode());
        }

        // Clear output button
        document.getElementById('ide-clear')?.addEventListener('click', () => this.clearOutput());

        // Editor keyboard shortcuts
        if (this.elements.editor) {
            this.elements.editor.addEventListener('keydown', (e) => {
                // Tab key for indentation
                if (e.key === 'Tab') {
                    e.preventDefault();
                    this.insertTab();
                }

                // Ctrl/Cmd + Enter to run
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    this.runCode();
                }

                // Ctrl/Cmd + S to save
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    this.saveCurrentFile();
                }
            });

            // Auto-save on blur
            this.elements.editor.addEventListener('blur', () => this.saveCurrentFile());
        }

        // Tab switching
        if (this.elements.tabs) {
            this.elements.tabs.forEach(tab => {
                tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
            });
        }

        // New file button
        document.getElementById('new-file-btn')?.addEventListener('click', () => this.createNewFile());

        // New folder button
        document.getElementById('new-folder-btn')?.addEventListener('click', () => this.createNewFolder());

        // Chat event listeners
        this.bindChatEvents();

        // Listen for code detected from chat
        if (typeof EventBus !== 'undefined') {
            EventBus.on('codeDetected', (data) => {
                this.extractCode(data.blocks);
            });
        }

        console.log('IDE: All event listeners bound');
    },

    // Bind chat-specific events (for legacy IDE chat panel - now disabled)
    bindChatEvents() {
        const chatInput = this.elements.chatInput;
        const chatSendBtn = this.elements.chatSendBtn;

        // IDE chat panel is disabled - chat is now in workspace main view
        if (!chatInput || !chatSendBtn) {
            console.log('IDE: Legacy chat panel disabled - using workspace chat instead');
            return;
        }

        if (chatInput && chatSendBtn) {
            // Send message on button click
            chatSendBtn.addEventListener('click', () => this.sendChatMessage());

            // Send message on Enter (without shift)
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendChatMessage();
                }
            });

            // Auto-resize textarea
            chatInput.addEventListener('input', () => {
                chatInput.style.height = 'auto';
                chatInput.style.height = Math.min(chatInput.scrollHeight, 80) + 'px';
            });
        }
    },
    
    // Toggle IDE panel
    toggle() {
        console.log('IDE.toggle() called, current state:', this.isOpen ? 'open' : 'closed');
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    },

    // Open IDE panel
    async open() {
        console.log('IDE.open() called');
        if (this.isOpen) {
            console.log('IDE is already open, skipping');
            return;
        }

        this.isOpen = true;
        console.log('Adding open class to panel');
        this.elements.panel.classList.add('open');

        // Code-intro placeholder removed - no longer needed

        // Initialize Pyodide if not ready
        if (!this.isPyodideReady) {
            console.log('Initializing Pyodide...');
            await this.initPyodide();
        } else {
            console.log('Pyodide already ready');
        }

        // Switch to output tab when opening
        this.switchTab('output');
        console.log('Switched to output tab');

        this.focusEditor();
        console.log('IDE opened successfully');
    },

    // Close IDE panel
    close() {
        console.log('IDE.close() called');
        if (!this.isOpen) {
            console.log('IDE is already closed, skipping');
            return;
        }

        this.isOpen = false;
        this.elements.panel.classList.remove('open');
        console.log('Removed open class from panel');

        // Code-intro placeholder removed - no longer needed

        // Save current file before closing
        this.saveCurrentFile();
        console.log('IDE closed successfully');
    },
    
    // Switch tab
    switchTab(tabName) {
        this.currentTab = tabName;
        
        // Update tab buttons
        this.elements.tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        // Update tab panels
        Object.keys(this.elements.tabPanels).forEach(key => {
            this.elements.tabPanels[key].classList.toggle('active', key === tabName);
        });
    },
    
    // Initialize Pyodide
    async initPyodide() {
        this.updateOutput('system', 'Initializing Python environment...');
        
        try {
            // Load Pyodide script if not present
            if (typeof loadPyodide === 'undefined') {
                await this.loadPyodideScript();
            }
            
            // Initialize Pyodide
            this.pyodide = await loadPyodide({
                indexURL: Config.pyodide.indexUrl
            });
            
            this.isPyodideReady = true;
            this.updateOutput('system', '✓ Python 3.11 environment ready');
            this.updateOutput('system', 'Type Python code and click Run to execute');
            
            // Preload packages
            await this.preloadPackages();
            
        } catch (error) {
            this.updateOutput('error', 'Failed to initialize Python: ' + error.message);
            console.error('Pyodide initialization error:', error);
        }
    },
    
    // Load Pyodide script dynamically
    loadPyodideScript() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `${Config.pyodide.indexUrl}pyodide.js`;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    },
    
    // Preload common packages
    async preloadPackages() {
        const packages = Config.pyodide.defaultPackages;
        
        for (const pkg of packages) {
            try {
                this.updateOutput('system', `Loading ${pkg}...`);
                await this.pyodide.loadPackage(pkg);
                this.updateOutput('success', `✓ ${pkg} loaded`);
            } catch (error) {
                this.updateOutput('stderr', `Warning: Could not load ${pkg}`);
            }
        }
    },
    
    // Render file tree
    renderFileTree() {
        const files = FileManager.getAllFiles();
        const fileList = Object.keys(files);
        
        if (fileList.length === 0) {
            this.elements.fileTree.innerHTML = `
                <div class="file-item" data-file="main.py">
                    <i class="fas fa-file-python"></i>
                    <span>main.py</span>
                </div>
            `;
            return;
        }
        
        this.elements.fileTree.innerHTML = fileList.map(filename => {
            const icon = this.getFileIcon(filename);
            const isActive = filename === FileManager.currentFile ? 'active' : '';
            
            return `
                <div class="file-item ${isActive}" data-file="${filename}">
                    <i class="fas ${icon}"></i>
                    <span>${filename}</span>
                </div>
            `;
        }).join('');
        
        // Add click handlers
        this.elements.fileTree.querySelectorAll('.file-item').forEach(item => {
            item.addEventListener('click', () => {
                this.saveCurrentFile();
                this.loadFile(item.dataset.file);
            });
            
            // Right-click context menu
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showFileContextMenu(e, item.dataset.file);
            });
        });
    },
    
    // Get file icon based on extension
    getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const icons = {
            'py': 'fa-file-python',
            'js': 'fa-file-js',
            'html': 'fa-file-code',
            'css': 'fa-file-code',
            'json': 'fa-file-code',
            'txt': 'fa-file-alt',
            'md': 'fa-file-alt'
        };
        return icons[ext] || 'fa-file';
    },
    
    // Load file content into editor
    loadFile(filename) {
        const content = FileManager.getFile(filename);
        if (content !== null) {
            FileManager.setCurrentFile(filename);
            this.elements.editor.value = content;
            this.elements.currentFile = filename;
            document.getElementById('current-file').textContent = filename;
            this.renderFileTree();
            this.focusEditor();
        }
    },
    
    // Load current file
    loadCurrentFile() {
        const current = FileManager.getCurrentFile();
        this.elements.editor.value = current.content;
        this.elements.currentFile = current.name;
        document.getElementById('current-file').textContent = current.name;
    },
    
    // Save current file
    saveCurrentFile() {
        const content = this.elements.editor.value;
        FileManager.setFile(FileManager.currentFile, content);
    },
    
    // Create new file
    async createNewFile() {
        const filename = prompt('Enter file name:', 'script.py');
        if (filename) {
            const ext = filename.includes('.') ? filename : filename + '.py';
            FileManager.setFile(ext, '# New file\nprint("Hello, World!")');
            this.renderFileTree();
            this.loadFile(ext);
            this.updateOutput('success', `Created new file: ${ext}`);
        }
    },

    // Create new folder
    async createNewFolder() {
        const folderName = prompt('Enter folder name:', 'new_folder');
        if (folderName) {
            // For simplicity, we'll create a placeholder file in the folder
            const folderFile = `${folderName}/.keep`;
            FileManager.setFile(folderFile, '# This folder is managed by Sparkie IDE');
            this.renderFileTree();
            this.updateOutput('success', `Created new folder: ${folderName}`);
        }
    },
    
    // Show file context menu
    showFileContextMenu(e, filename) {
        const menu = document.createElement('div');
        menu.className = 'file-context-menu';
        menu.innerHTML = `
            <button class="context-menu-item" data-action="rename">
                <i class="fas fa-pen"></i> Rename
            </button>
            <button class="context-menu-item" data-action="duplicate">
                <i class="fas fa-copy"></i> Duplicate
            </button>
            <div class="context-menu-divider"></div>
            <button class="context-menu-item danger" data-action="delete">
                <i class="fas fa-trash"></i> Delete
            </button>
        `;
        
        menu.style.left = e.pageX + 'px';
        menu.style.top = e.pageY + 'px';
        
        document.body.appendChild(menu);
        
        // Handle menu actions
        menu.querySelectorAll('.context-menu-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                this.handleFileAction(action, filename);
                menu.remove();
            });
        });
        
        // Close on click outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    },
    
    // Handle file actions
    handleFileAction(action, filename) {
        switch (action) {
            case 'rename':
                const newName = prompt('Enter new name:', filename);
                if (newName && newName !== filename) {
                    FileManager.renameFile(filename, newName);
                    this.renderFileTree();
                }
                break;
                
            case 'duplicate':
                const content = FileManager.getFile(filename);
                const ext = filename.includes('.') ? filename : filename + '.py';
                FileManager.setFile('copy_' + ext, content);
                this.renderFileTree();
                break;
                
            case 'delete':
                if (confirm(`Delete ${filename}?`)) {
                    FileManager.deleteFile(filename);
                    this.renderFileTree();
                    this.loadCurrentFile();
                }
                break;
        }
    },
    
    // Run code
    async runCode() {
        if (this.isRunning) {
            this.updateOutput('warning', 'Code is already running...');
            return;
        }

        // Check if Pyodide is ready
        if (!this.isPyodideReady || !this.pyodide) {
            this.updateOutput('warning', 'Initializing Python environment... Please wait.');
            await this.initPyodide();
        }

        // Save current file
        this.saveCurrentFile();

        const code = this.elements.editor.value;
        if (!code.trim()) {
            this.updateOutput('stderr', 'No code to run. Write some code in the editor!');
            return;
        }

        this.isRunning = true;
        this.updateRunButton();

        // Clear previous output
        this.elements.output.innerHTML = '';

        // Show process indicator
        this.showProcessIndicator();

        // Check if current file is HTML - if so, just preview it
        if (FileManager.currentFile.endsWith('.html')) {
            this.updateOutput('system', 'Previewing HTML...');
            this.showHtmlPreview(code);
            this.hideProcessIndicator();
            this.isRunning = false;
            this.updateRunButton();
            return;
        }

        try {
            this.updateOutput('system', `Running ${FileManager.currentFile}...`);

            // Run the code with direct output capture
            await this.pyodide.runPythonAsync(`
import sys
import io
import json

class CustomOutput:
    def __init__(self):
        self.stdout_lines = []
        self.stderr_lines = []
        
    def write(self, text):
        if text:
            self.stdout_lines.append(text)
            sys.__stdout__.write(text)
            sys.__stdout__.flush()
            
    def flush(self):
        sys.__stdout__.flush()

    def write_stderr(self, text):
        if text:
            self.stderr_lines.append(text)
            sys.__stderr__.write(text)
            sys.__stderr__.flush()

# Create and redirect
custom_out = CustomOutput()
sys.stdout = custom_out
sys.stderr = custom_out
            `);

            // Run the user code
            await this.pyodide.runPythonAsync(code);

            // Get output
            const output = await this.pyodide.runPythonAsync(`
result = []
for line in custom_out.stdout_lines:
    result.append(('stdout', line))
for line in custom_out.stderr_lines:
    result.append(('stderr', line))
json.dumps(result)
            `);

            // Parse and display output
            const parsedOutput = JSON.parse(output);
            this.displayOutput(parsedOutput);

            // Check for matplotlib plots
            await this.checkForPlots();

            if (parsedOutput.length === 0) {
                this.updateOutput('success', 'Code executed successfully!');
            }

        } catch (error) {
            this.updateOutput('error', `Error: ${error.message}`);
            console.error('Code execution error:', error);
        } finally {
            this.hideProcessIndicator();
            this.isRunning = false;
            this.updateRunButton();
            await this.updateMemoryUsage();
        }
    },
    
    // Display output
    displayOutput(output) {
        if (!Array.isArray(output)) return;
        
        output.forEach(([type, text]) => {
            if (text && text.trim()) {
                this.updateOutput(type, text);
            }
        });
        
        // Show welcome if no output
        if (output.length === 0) {
            this.updateOutput('system', 'Code executed successfully (no output)');
        }
    },
    
    // Update output panel
    updateOutput(type, text) {
        const line = document.createElement('div');
        line.className = `output-line ${type}`;
        
        // Format output
        let formatted = text
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
        
        line.innerHTML = formatted;
        this.elements.output.appendChild(line);
        
        // Auto-scroll
        this.elements.output.scrollTop = this.elements.output.scrollHeight;
    },
    
    // Clear output
    clearOutput() {
        this.elements.output.innerHTML = `
            <div class="output-welcome">
                <i class="fas fa-terminal"></i>
                <p>Python 3.11 environment ready</p>
                <p class="output-hint">Write your code in the editor and click Run to execute</p>
            </div>
        `;
    },
    
    // Show process indicator
    showProcessIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'process-indicator';
        indicator.id = 'process-indicator';
        indicator.innerHTML = `
            <i class="fas fa-cog fa-spin"></i>
            <span>Running code...</span>
        `;
        
        this.elements.output.parentNode.insertBefore(indicator, this.elements.output);
    },
    
    // Hide process indicator
    hideProcessIndicator() {
        const indicator = document.getElementById('process-indicator');
        if (indicator) {
            indicator.remove();
        }
    },
    
    // Check for matplotlib plots
    async checkForPlots() {
        try {
            // Check if plot.png exists
            const hasPlot = await this.pyodide.runPythonAsync(`
                import os
                os.path.exists('/tmp/plot.png')
            `);
            
            if (hasPlot) {
                this.showPlotPreview();
            }

            // Check for any saved images
            const hasAnyPlot = await this.pyodide.runPythonAsync(`
import os
plots_dir = '/tmp'
if os.path.exists(plots_dir):
    files = [f for f in os.listdir(plots_dir) if f.endswith('.png')]
    len(files) > 0
else:
    False
            `);

            if (hasAnyPlot) {
                this.showPlotPreview();
            }
        } catch (e) {
            console.warn('Plot check error:', e);
        }
    },

    // Show plot preview
    showPlotPreview() {
        this.switchTab('preview');
        const timestamp = Date.now();
        this.elements.preview.innerHTML = `
            <div class="preview-content">
                <img src="/tmp/plot.png?${timestamp}" alt="Generated Plot"
                     style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px;">
            </div>
        `;
        this.updateOutput('success', 'Plot displayed in Preview tab');
    },

    // Show HTML preview
    showHtmlPreview(htmlContent) {
        this.switchTab('preview');
        this.elements.preview.innerHTML = `
            <iframe srcdoc="${encodeURIComponent(htmlContent)}"
                    style="width: 100%; height: 100%; border: none; border-radius: 8px;"
                    sandbox="allow-scripts allow-same-origin">
            </iframe>
        `;
        this.updateOutput('success', 'HTML preview displayed');
    },
    
    // Update run button state
    updateRunButton() {
        this.elements.runBtn.disabled = this.isRunning;
        
        if (this.isRunning) {
            this.elements.runBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        } else {
            this.elements.runBtn.innerHTML = '<i class="fas fa-play"></i>';
        }
    },
    
    // Update memory usage
    async updateMemoryUsage() {
        try {
            const memory = await this.pyodide.runPythonAsync(`
                import psutil
                process = psutil.Process()
                memory_info = process.memory_info()
                memory_info.rss / 1024 / 1024
            `);
            
            const memoryEl = document.getElementById('memory-usage');
            if (memoryEl) {
                memoryEl.textContent = Math.round(memory || 0);
            }
        } catch (e) {
            // psutil might not be available
        }
    },
    
    // Insert tab character
    insertTab() {
        const editor = this.elements.editor;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const value = editor.value;
        
        editor.value = value.substring(0, start) + '    ' + value.substring(end);
        editor.selectionStart = editor.selectionEnd = start + 4;
        
        editor.focus();
    },
    
    // Focus editor
    focusEditor() {
        this.elements.editor.focus();
        // Move cursor to end
        this.elements.editor.selectionStart = this.elements.editor.selectionEnd = 
            this.elements.editor.value.length;
    },
    
    // Extract code from chat blocks
    extractCode(blocks) {
        if (blocks && blocks.length > 0) {
            // Take the first code block
            const match = blocks[0].match(/```(\w*)\n([\s\S]*?)```/);
            if (match) {
                const language = match[1];
                const code = match[2].trim();
                
                // Check if it's Python
                if (language === 'py' || language === 'python' || language === '') {
                    // Create a new file for this code
                    const filename = `chat_code_${Date.now()}.py`;
                    FileManager.setFile(filename, code);
                    this.renderFileTree();
                    this.loadFile(filename);
                    
                    // Suggest running
                    this.updateOutput('system', 'Code loaded from chat. Click Run to execute!');
                    this.open();
                }
            }
        }
    },
    
    // Load code from chat
    loadCodeFromChat(code) {
        const filename = `chat_code_${Date.now()}.py`;
        FileManager.setFile(filename, code);
        this.renderFileTree();
        this.loadFile(filename);
        this.open();
    },

    // ========================================
    // IDE Chat Functions
    // ========================================

    // Send a message to the IDE chat API
    async sendChatMessage() {
        const message = this.elements.chatInput.value.trim();

        if (!message || this.isChatLoading) {
            return;
        }

        // Add user message to UI
        this.displayChatMessage('user', message);

        // Clear input
        this.elements.chatInput.value = '';
        this.elements.chatInput.style.height = 'auto';

        // Show loading indicator
        this.showChatTyping();

        try {
            const response = await fetch('/api/chat/minimax-ide', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    code_context: this.elements.editor.value,
                    current_file: FileManager.currentFile,
                    messages: this.chatHistory.slice(-10), // Send last 10 messages for context
                    temperature: 0.7
                })
            });

            // Remove typing indicator
            this.hideChatTyping();

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || data.detail || 'Failed to get response');
            }

            // Extract assistant response
            const assistantMessage = this.extractAssistantMessage(data);

            if (assistantMessage) {
                // Add to chat history
                this.chatHistory.push({ role: 'user', content: message });
                this.chatHistory.push({ role: 'assistant', content: assistantMessage });

                // Display assistant message with typing effect
                await this.displayChatMessageWithTyping('assistant', assistantMessage);
            }

        } catch (error) {
            this.hideChatTyping();
            this.displayChatError(error.message);
            console.error('Chat error:', error);
        }
    },

    // Extract assistant message from API response
    extractAssistantMessage(data) {
        try {
            // Try MiniMax format
            if (data.choices && data.choices[0] && data.choices[0].message) {
                return data.choices[0].message.content;
            }

            // Try direct content format
            if (data.content) {
                return data.content;
            }

            // Try base_resp format
            if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
                return data.choices[0].message.content;
            }

            return null;
        } catch (e) {
            console.error('Error extracting message:', e);
            return null;
        }
    },

    // Display a chat message in the UI
    displayChatMessage(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `ide-chat-message ${role}`;

        const avatarIcon = role === 'user' ? 'fa-user' : 'fa-robot';

        messageDiv.innerHTML = `
            <div class="chat-message-header">
                <span class="chat-message-avatar">
                    <i class="fas ${avatarIcon}"></i>
                </span>
                <span class="chat-message-role">${role === 'user' ? 'You' : 'Sparkie'}</span>
            </div>
            <div class="ide-chat-message-content">${this.formatChatContent(content)}</div>
        `;

        this.elements.chatMessages.appendChild(messageDiv);
        this.scrollChatToBottom();
    },

    // Display message with typing effect
    async displayChatMessageWithTyping(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `ide-chat-message ${role}`;

        const avatarIcon = role === 'user' ? 'fa-user' : 'fa-robot';

        messageDiv.innerHTML = `
            <div class="chat-message-header">
                <span class="chat-message-avatar">
                    <i class="fas ${avatarIcon}"></i>
                </span>
                <span class="chat-message-role">${role === 'user' ? 'You' : 'Sparkie'}</span>
            </div>
            <div class="ide-chat-message-content"></div>
        `;

        const contentDiv = messageDiv.querySelector('.ide-chat-message-content');
        this.elements.chatMessages.appendChild(messageDiv);

        // Typing effect
        await this.typewriterEffect(contentDiv, content);

        this.scrollChatToBottom();
    },

    // Typewriter effect for chat messages
    async typewriterEffect(element, text) {
        element.innerHTML = '';

        // Format the content first
        const formattedText = this.formatChatContent(text);
        element.innerHTML = formattedText;

        // Simple fade in instead of character-by-character for better code display
        element.style.opacity = '0';
        element.style.transition = 'opacity 0.3s ease';

        await new Promise(resolve => setTimeout(resolve, 50));
        element.style.opacity = '1';
    },

    // Format chat content with code blocks
    formatChatContent(content) {
        // Escape HTML
        let formatted = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Format code blocks
        formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
        });

        // Format inline code
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Format bold text
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        // Format italic text
        formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');

        // Convert newlines to breaks
        formatted = formatted.replace(/\n/g, '<br>');

        return formatted;
    },

    // Show typing indicator
    showChatTyping() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'ide-chat-message assistant';
        typingDiv.id = 'chat-typing-indicator';
        typingDiv.innerHTML = `
            <div class="chat-message-header">
                <span class="chat-message-avatar">
                    <i class="fas fa-robot"></i>
                </span>
                <span class="chat-message-role">Sparkie</span>
            </div>
            <div class="ide-chat-typing">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        `;

        this.elements.chatMessages.appendChild(typingDiv);
        this.scrollChatToBottom();
    },

    // Hide typing indicator
    hideChatTyping() {
        const indicator = document.getElementById('chat-typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    },

    // Display chat error
    displayChatError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'chat-error';
        errorDiv.textContent = `Error: ${message}`;
        this.elements.chatMessages.appendChild(errorDiv);
        this.scrollChatToBottom();
    },

    // Scroll chat to bottom
    scrollChatToBottom() {
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    },

    // ========================================
    // Workspace Chat Functions (Main Code View)
    // ========================================

    // Bind workspace chat events
    bindWorkspaceChatEvents() {
        const chatInput = this.elements.workspaceChatInput;
        const chatSendBtn = this.elements.workspaceChatSend;

        if (chatInput && chatSendBtn) {
            // Send message on button click
            chatSendBtn.addEventListener('click', () => this.sendWorkspaceChatMessage());

            // Send message on Enter (without shift)
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendWorkspaceChatMessage();
                }
            });

            // Auto-resize textarea
            chatInput.addEventListener('input', () => {
                chatInput.style.height = 'auto';
                chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
            });
        }
    },

    // Send a message to the workspace chat API
    async sendWorkspaceChatMessage() {
        const message = this.elements.workspaceChatInput.value.trim();

        if (!message || this.isWorkspaceChatLoading) {
            return;
        }

        // Add user message to UI
        this.displayWorkspaceChatMessage('user', message);

        // Clear input
        this.elements.workspaceChatInput.value = '';
        this.elements.workspaceChatInput.style.height = 'auto';

        // Show loading indicator
        this.showWorkspaceChatTyping();

        try {
            // Use unified chat API with internet access (same as main chat)
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    messages: this.workspaceChatHistory.slice(-10), // Send last 10 messages for context
                    temperature: 0.7
                })
            });

            // Remove typing indicator
            this.hideWorkspaceChatTyping();

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || data.detail || 'Failed to get response');
            }

            // Extract assistant response
            const assistantMessage = this.extractAssistantMessage(data);

            if (assistantMessage) {
                // Add to chat history
                this.workspaceChatHistory.push({ role: 'user', content: message });
                this.workspaceChatHistory.push({ role: 'assistant', content: assistantMessage });

                // Display assistant message with typing effect
                await this.displayWorkspaceChatMessageWithTyping('assistant', assistantMessage);
            }

        } catch (error) {
            this.hideWorkspaceChatTyping();
            this.displayWorkspaceChatError(error.message);
            console.error('Workspace chat error:', error);
        }
    },

    // Display a workspace chat message in the UI
    displayWorkspaceChatMessage(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `workspace-chat-message ${role}`;

        const avatarIcon = role === 'user' ? 'fa-user' : 'fa-robot';

        messageDiv.innerHTML = `
            <div class="workspace-chat-message-header">
                <span class="workspace-chat-message-avatar">
                    <i class="fas ${avatarIcon}"></i>
                </span>
                <span class="workspace-chat-message-role">${role === 'user' ? 'You' : 'Sparkie'}</span>
            </div>
            <div class="workspace-chat-message-content">${this.formatChatContent(content)}</div>
        `;

        this.elements.workspaceChatMessages.appendChild(messageDiv);
        this.scrollWorkspaceChatToBottom();
    },

    // Display workspace message with typing effect
    async displayWorkspaceChatMessageWithTyping(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `workspace-chat-message ${role}`;

        const avatarIcon = role === 'user' ? 'fa-user' : 'fa-robot';

        messageDiv.innerHTML = `
            <div class="workspace-chat-message-header">
                <span class="workspace-chat-message-avatar">
                    <i class="fas ${avatarIcon}"></i>
                </span>
                <span class="workspace-chat-message-role">${role === 'user' ? 'You' : 'Sparkie'}</span>
            </div>
            <div class="workspace-chat-message-content"></div>
        `;

        const contentDiv = messageDiv.querySelector('.workspace-chat-message-content');
        this.elements.workspaceChatMessages.appendChild(messageDiv);

        // Typing effect
        await this.workspaceTypewriterEffect(contentDiv, content);

        this.scrollWorkspaceChatToBottom();
    },

    // Typewriter effect for workspace chat messages
    async workspaceTypewriterEffect(element, text) {
        element.innerHTML = '';

        // Format the content first
        const formattedText = this.formatChatContent(text);
        element.innerHTML = formattedText;

        // Simple fade in instead of character-by-character for better code display
        element.style.opacity = '0';
        element.style.transition = 'opacity 0.3s ease';

        await new Promise(resolve => setTimeout(resolve, 50));
        element.style.opacity = '1';
    },

    // Show workspace typing indicator
    showWorkspaceChatTyping() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'workspace-chat-message assistant';
        typingDiv.id = 'workspace-chat-typing-indicator';
        typingDiv.innerHTML = `
            <div class="workspace-chat-message-header">
                <span class="workspace-chat-message-avatar">
                    <i class="fas fa-robot"></i>
                </span>
                <span class="workspace-chat-message-role">Sparkie</span>
            </div>
            <div class="workspace-chat-typing">
                <span class="workspace-typing-dot"></span>
                <span class="workspace-typing-dot"></span>
                <span class="workspace-typing-dot"></span>
            </div>
        `;

        this.elements.workspaceChatMessages.appendChild(typingDiv);
        this.scrollWorkspaceChatToBottom();
    },

    // Hide workspace typing indicator
    hideWorkspaceChatTyping() {
        const indicator = document.getElementById('workspace-chat-typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    },

    // Display workspace chat error
    displayWorkspaceChatError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'workspace-chat-error';
        errorDiv.textContent = `Error: ${message}`;
        this.elements.workspaceChatMessages.appendChild(errorDiv);
        this.scrollWorkspaceChatToBottom();
    },

    // Scroll workspace chat to bottom
    scrollWorkspaceChatToBottom() {
        if (this.elements.workspaceChatMessages) {
            this.elements.workspaceChatMessages.scrollTop = this.elements.workspaceChatMessages.scrollHeight;
        }
    }
};

// Export IDE
window.IDE = IDE;

// Immediate event binding for code button (works even if init() hasn't run yet)
document.addEventListener('DOMContentLoaded', function() {
    const codeButton = document.querySelector('[data-view="code"]');
    if (codeButton) {
        codeButton.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('IDE: Immediate click handler triggered');
            if (window.IDE) {
                window.IDE.toggle();
            } else {
                console.error('IDE module not loaded');
            }
        });
        console.log('IDE: Immediate event listener attached to code button');
    }
});
