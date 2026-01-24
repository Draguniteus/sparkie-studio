/**
 * UI Module - Handles UI state and interactions
 */

const UI = {
    // State
    currentView: 'chat',
    isSettingsOpen: false,
    
    // DOM Elements
    elements: {
        app: null,
        authOverlay: null,
        sidebar: null,
        views: null,
        navButtons: null,
        settingsModal: null,
        toastContainer: null
    },
    
    // Initialize UI module
    init() {
        this.elements = {
            app: document.getElementById('app'),
            authOverlay: document.getElementById('auth-overlay'),
            sidebar: document.querySelector('.sidebar'),
            views: document.querySelectorAll('.view'),
            navButtons: document.querySelectorAll('.nav-btn[data-view]'),
            settingsModal: document.getElementById('settings-modal'),
            toastContainer: document.getElementById('toast-container')
        };
        
        this.bindEvents();
        this.checkAuth();
        this.loadSettings();
        
        return this;
    },
    
    // Bind event listeners
    bindEvents() {
        // Navigation buttons
        this.elements.navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                this.switchView(view);
            });
        });
        
        // Settings button
        document.getElementById('settings-btn')?.addEventListener('click', () => {
            this.openSettings();
        });
        
        // Settings modal close
        document.getElementById('settings-close')?.addEventListener('click', () => {
            this.closeSettings();
        });
        
        document.getElementById('settings-cancel')?.addEventListener('click', () => {
            this.closeSettings();
        });
        
        document.getElementById('settings-save')?.addEventListener('click', () => {
            this.saveSettings();
        });
        
        // Auth tabs
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchAuthTab(tab.dataset.tab);
            });
        });
        
        // Password toggle buttons
        document.querySelectorAll('.password-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                this.togglePasswordVisibility(btn);
            });
        });
        
        // Auth forms
        document.getElementById('login-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });
        
        document.getElementById('register-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRegister();
        });
        
        // Close modal on backdrop click
        this.elements.settingsModal?.addEventListener('click', (e) => {
            if (e.target === this.elements.settingsModal) {
                this.closeSettings();
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + , to open settings
            if ((e.ctrlKey || e.metaKey) && e.key === ',') {
                e.preventDefault();
                this.openSettings();
            }
            
            // Escape to close modals
            if (e.key === 'Escape') {
                this.closeSettings();
            }
        });
    },
    
    // Check authentication status
    checkAuth() {
        if (UserManager.isLoggedIn()) {
            this.showApp();
            this.updateUserInfo();
        } else {
            this.showAuth();
        }
    },
    
    // Show authentication screen
    showAuth() {
        this.elements.authOverlay.classList.remove('hidden');
        this.elements.app.classList.add('hidden');
    },
    
    // Show main app
    showApp() {
        this.elements.authOverlay.classList.add('hidden');
        this.elements.app.classList.remove('hidden');
        
        // Initialize modules
        setTimeout(() => {
            ChatModule.init();
            IDE.init();
        }, 100);
    },
    
    // Update user info in sidebar
    updateUserInfo() {
        const user = UserManager.getCurrentUser();
        const userName = document.querySelector('.user-name');
        const userAvatar = document.querySelector('.user-avatar');
        
        if (user && userName) {
            userName.textContent = user.username;
        }
        
        if (userAvatar) {
            const initial = user?.username?.charAt(0).toUpperCase() || 'U';
            userAvatar.innerHTML = `<i class="fas fa-user"></i>`;
        }
    },
    
    // Switch auth tab
    switchAuthTab(tab) {
        document.querySelectorAll('.auth-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });
        
        document.querySelectorAll('.auth-form').forEach(form => {
            form.classList.toggle('active', form.id === `${tab}-form`);
        });
    },
    
    // Toggle password visibility
    togglePasswordVisibility(button) {
        const targetId = button.dataset.target;
        const input = document.getElementById(targetId);
        const icon = button.querySelector('i');
        
        if (input && icon) {
            if (input.type === 'password') {
                input.type = 'text';
                button.classList.add('active');
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                button.classList.remove('active');
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        }
    },
    
    // Handle login
    async handleLogin() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        const result = UserManager.login(email, password);
        
        if (result.success) {
            this.showToast('Welcome back, ' + result.user.username + '!', 'success');
            this.showApp();
        } else {
            this.showToast(result.message, 'error');
        }
    },
    
    // Handle register
    async handleRegister() {
        const username = document.getElementById('register-username').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        
        if (password.length < 6) {
            this.showToast('Password must be at least 6 characters', 'warning');
            return;
        }
        
        const result = UserManager.register(username, email, password);
        
        if (result.success) {
            this.showToast('Account created successfully!', 'success');
            this.showApp();
        } else {
            this.showToast(result.message, 'error');
        }
    },
    
    // Switch view
    switchView(viewName) {
        this.currentView = viewName;

        // Update nav buttons
        this.elements.navButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === viewName);
        });

        // Update views
        this.elements.views.forEach(view => {
            view.classList.toggle('active', view.id === `${viewName}-view`);
        });

        // Special handling for Code view - open IDE
        if (viewName === 'code') {
            // Open IDE panel with safety check
            setTimeout(() => {
                if (window.IDE) {
                    IDE.open();
                    console.log('IDE: Opened from sidebar button');
                } else {
                    console.error('IDE module not loaded yet');
                }
            }, 100);
        }
    },
    
    // Open settings
    openSettings() {
        this.isSettingsOpen = true;
        this.elements.settingsModal.classList.remove('hidden');
        
        // Load current settings
        this.loadSettings();
    },
    
    // Close settings
    closeSettings() {
        this.isSettingsOpen = false;
        this.elements.settingsModal.classList.add('hidden');
    },
    
    // Load settings from storage
    loadSettings() {
        const settings = StorageManager.get('sparkie_settings') || {};
        
        // API keys
        if (settings.apiKeys) {
            document.getElementById('minimax-key').value = settings.apiKeys.minimax || '';
            document.getElementById('modelscope-key').value = settings.apiKeys.modelscope || '';
            document.getElementById('pollinations-key').value = settings.apiKeys.pollinations || '';
        }
        
        // Theme
        if (settings.theme) {
            document.getElementById('theme-select').value = settings.theme;
        }
        
        // Temperature
        if (settings.temperature !== undefined) {
            document.getElementById('temperature').value = settings.temperature * 100;
            document.querySelector('.range-value').textContent = (settings.temperature * 100) + '%';
        }
    },
    
    // Save settings
    saveSettings() {
        const settings = StorageManager.get('sparkie_settings') || {};
        
        // API keys
        const minimaxKey = document.getElementById('minimax-key').value;
        const modelscopeKey = document.getElementById('modelscope-key').value;
        const pollinationsKey = document.getElementById('pollinations-key').value;
        
        if (minimaxKey) {
            Config.setMiniMaxKey(minimaxKey, Config.api.minimax.groupId);
        }
        
        if (modelscopeKey) {
            Config.setModelScopeKey(modelscopeKey);
        }
        
        if (pollinationsKey) {
            Config.setPollinationsKey(pollinationsKey);
        }
        
        // Theme
        settings.theme = document.getElementById('theme-select').value;
        
        // Temperature
        const temperature = parseInt(document.getElementById('temperature').value) / 100;
        settings.temperature = temperature;
        Config.api.minimax.temperature = temperature;
        
        // Save to storage
        StorageManager.set('sparkie_settings', settings);
        
        this.showToast('Settings saved!', 'success');
        this.closeSettings();
    },
    
    // Update range value display
    updateRangeValue(value, suffix = '%') {
        const rangeValue = document.querySelector('.range-value');
        if (rangeValue) {
            rangeValue.textContent = value + suffix;
        }
    },
    
    // Show toast notification
    showToast(message, type = 'info') {
        if (!this.elements.toastContainer) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        
        toast.innerHTML = `
            <i class="fas ${icons[type] || icons.info}"></i>
            <span class="toast-message">${message}</span>
        `;
        
        this.elements.toastContainer.appendChild(toast);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },
    
    // Show loading overlay
    showLoading(message = 'Loading...') {
        let overlay = document.getElementById('loading-overlay');
        
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'loading-overlay';
            overlay.className = 'loading-overlay';
            overlay.innerHTML = `
                <div class="loading-spinner"></div>
                <p>${message}</p>
            `;
            document.body.appendChild(overlay);
        }
        
        overlay.classList.remove('hidden');
    },
    
    // Hide loading overlay
    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    },
    
    // Confirm dialog
    confirm(message, title = 'Confirm') {
        return confirm(`${title}\n\n${message}`);
    },
    
    // Prompt dialog
    prompt(message, defaultValue = '') {
        return prompt(message, defaultValue);
    }
};

// Toast Manager
const ToastManager = {
    show(message, type = 'info') {
        if (typeof UI !== 'undefined') {
            UI.showToast(message, type);
        }
    }
};

// Event Bus for inter-module communication
const EventBus = {
    events: {},
    
    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
    },
    
    off(event, callback) {
        if (!this.events[event]) return;
        this.events[event] = this.events[event].filter(cb => cb !== callback);
    },
    
    emit(event, data) {
        if (!this.events[event]) return;
        this.events[event].forEach(callback => callback(data));
    }
};

// Export UI and EventBus
window.UI = UI;
window.ToastManager = ToastManager;
window.EventBus = EventBus;
