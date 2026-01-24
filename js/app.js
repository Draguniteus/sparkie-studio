/**
 * Sparkie Studio - Main Application Entry Point
 * A comprehensive AI workspace with chat, code, and image generation
 */

// Application State
const App = {
    version: '1.0.0',
    name: 'Sparkie Studio',
    initialized: false,
    
    // Initialize application
    async init() {
        if (this.initialized) {
            console.log('App already initialized');
            return this;
        }
        
        console.log(`Initializing ${App.name} v${App.version}...`);
        
        try {
            // Clear any old API keys from localStorage (now server-side only)
            this.clearOldApiKeys();
            
            // Load configuration from storage
            if (typeof Config !== 'undefined') {
                Config.loadFromStorage();
                console.log('Config loaded');
            } else {
                console.error('Config not loaded!');
            }
            
            // Initialize storage managers
            if (typeof ChatManager !== 'undefined') {
                ChatManager.init();
            }
            if (typeof FileManager !== 'undefined') {
                FileManager.init();
            }
            if (typeof ImageManager !== 'undefined') {
                ImageManager.init();
            }
            console.log('Storage managers initialized');
            
            // Initialize feature modules
            if (typeof ImagesModule !== 'undefined') {
                ImagesModule.init();
            }
            if (typeof VideosModule !== 'undefined') {
                VideosModule.init();
            }
            console.log('Feature modules initialized');
            
            // Initialize UI
            if (typeof UI !== 'undefined') {
                UI.init();
            }
            console.log('UI initialized');
            
            // Setup additional event listeners
            this.setupKeyboardShortcuts();
            this.setupRangeInputs();
            this.setupFileDragDrop();
            
            this.initialized = true;
            console.log(`${App.name} initialized successfully!`);
            
            // Check API availability
            this.checkAPIStatus();
            
        } catch (error) {
            console.error('Failed to initialize application:', error);
            console.error('Error details:', error.stack);
        }
        
        return this;
    },
    
    // Clear old API keys from localStorage (now server-side only)
    clearOldApiKeys() {
        try {
            if (typeof StorageManager !== 'undefined' && StorageManager.isAvailable()) {
                const settings = StorageManager.get('sparkie_settings');
                if (settings && settings.apiKeys) {
                    // Remove API keys from localStorage for security
                    delete settings.apiKeys;
                    StorageManager.set('sparkie_settings', settings);
                    console.log('Cleared old API keys from localStorage');
                }
            }
        } catch (error) {
            console.error('Error clearing old API keys:', error);
        }
    },
    
    // Setup keyboard shortcuts
    setupKeyboardShortcuts() {
        try {
            document.addEventListener('keydown', (e) => {
                // Ctrl/Cmd + Enter in chat input - send message
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    const activeEl = document.activeElement;
                    if (activeEl && activeEl.id === 'chat-input') {
                        e.preventDefault();
                        if (typeof ChatModule !== 'undefined') {
                            ChatModule.sendMessage();
                        }
                    }
                }
                
                // Ctrl/Cmd + \ to toggle IDE
                if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
                    e.preventDefault();
                    if (typeof IDE !== 'undefined') {
                        IDE.toggle();
                    }
                }
                
                // Ctrl/Cmd + 1/2/3/4 for navigation
                if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
                    if (e.key === '1') {
                        e.preventDefault();
                        UI.switchView('chat');
                    } else if (e.key === '2') {
                        e.preventDefault();
                        UI.switchView('images');
                    } else if (e.key === '3') {
                        e.preventDefault();
                        UI.switchView('video');
                    } else if (e.key === '4') {
                        e.preventDefault();
                        UI.switchView('code');
                    }
                }
            });
        } catch (error) {
            console.error('Error setting up keyboard shortcuts:', error);
        }
    },
    
    // Setup range input displays
    setupRangeInputs() {
        try {
            const temperatureInput = document.getElementById('temperature');
            const rangeValue = document.querySelector('.range-value');
            
            if (temperatureInput && rangeValue) {
                temperatureInput.addEventListener('input', () => {
                    const value = temperatureInput.value;
                    rangeValue.textContent = value + '%';
                });
            }
        } catch (error) {
            console.error('Error setting up range inputs:', error);
        }
    },
    
    // Setup file drag and drop for chat
    setupFileDragDrop() {
        try {
            const chatContainer = document.getElementById('chat-container');
            
            if (!chatContainer) return;
            
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                chatContainer.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                });
            });
            
            chatContainer.addEventListener('dragenter', () => {
                chatContainer.classList.add('drag-over');
            });
            
            chatContainer.addEventListener('dragleave', () => {
                chatContainer.classList.remove('drag-over');
            });
            
            chatContainer.addEventListener('drop', (e) => {
                chatContainer.classList.remove('drag-over');
                
                const files = Array.from(e.dataTransfer.files);
                
                files.forEach(file => {
                    if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            if (typeof ChatModule !== 'undefined') {
                                ChatModule.currentAttachments.push({
                                    type: 'image',
                                    data: event.target.result,
                                    name: file.name
                                });
                                ChatModule.renderAttachmentPreview();
                            }
                        };
                        reader.readAsDataURL(file);
                    }
                });
            });
        } catch (error) {
            console.error('Error setting up drag and drop:', error);
        }
    },
    
    // Check API status and show notifications
    async checkAPIStatus() {
        const statusIndicator = document.querySelector('.api-status-indicator');
        const statusText = document.querySelector('.api-status-text');
        
        try {
            const status = await API.checkAvailability();
            
            if (status.minimax || status.modelscope) {
                // Server-side APIs are configured
                if (statusIndicator) {
                    statusIndicator.classList.add('connected');
                }
                if (statusText) {
                    statusText.textContent = 'Server connected';
                }
            } else {
                // No server-side APIs configured
                if (statusIndicator) {
                    statusIndicator.classList.add('error');
                }
                if (statusText) {
                    statusText.textContent = 'Server configured - AI ready';
                }
            }
        } catch (error) {
            console.error('Error checking API status:', error);
            if (statusIndicator) {
                statusIndicator.classList.add('error');
            }
            if (statusText) {
                statusText.textContent = 'Connecting...';
            }
        }
    },
    
    // Logout
    logout() {
        try {
            UserManager.logout();
            ChatManager.clearAll();
            FileManager.clearAll();
            ImageManager.clearAll();
            
            UI.showAuth();
            UI.showToast('Logged out successfully', 'success');
        } catch (error) {
            console.error('Error during logout:', error);
        }
    },
    
    // Reset application data
    resetData() {
        try {
            if (UI.confirm('This will delete all your chats, files, and images. Continue?')) {
                ChatManager.clearAll();
                FileManager.clearAll();
                ImageManager.clearAll();
                
                // Clear storage
                StorageManager.clear();
                
                // Reload page
                location.reload();
            }
        } catch (error) {
            console.error('Error resetting data:', error);
        }
    },
    
    // Get storage usage
    getStorageInfo() {
        return StorageManager.getUsage();
    },
    
    // Export data
    exportData() {
        try {
            const data = {
                version: App.version,
                exportedAt: new Date().toISOString(),
                chats: ChatManager.getAllChats(),
                files: FileManager.getAllFiles(),
                images: ImageManager.getAllImages(),
                settings: StorageManager.get('sparkie_settings', {})
            };
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `sparkie_backup_${Date.now()}.json`;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            URL.revokeObjectURL(url);
            
            UI.showToast('Data exported successfully!', 'success');
        } catch (error) {
            console.error('Error exporting data:', error);
            UI.showToast('Failed to export data', 'error');
        }
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing app...');
    App.init();
});

// Export App
window.App = App;

// Welcome message
console.log(`
===============================================
  Welcome to Sparkie Studio!
===============================================
  
  Keyboard Shortcuts:
  -------------------
  Ctrl+\\    Toggle IDE Panel
  Ctrl+1/2/3/4  Switch Views (Chat/Images/Video/Code)
  Ctrl+Enter  Send Message (in chat)
  F5         Run Code (in IDE)
  Ctrl+,     Open Settings
  
  Ready to build something amazing!
===============================================
`);
