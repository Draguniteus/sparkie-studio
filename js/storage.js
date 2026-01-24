/**
 * Storage Manager - LocalStorage Wrapper
 * Handles all local storage operations for Sparkie Studio
 */

const StorageManager = {
    prefix: 'sparkie_',
    
    // Check if localStorage is available
    isAvailable() {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            console.warn('LocalStorage is not available:', e);
            return false;
        }
    },
    
    // Get prefixed key
    getKey(key) {
        return this.prefix + key;
    },
    
    // Set item
    set(key, value) {
        if (!this.isAvailable()) return false;
        
        try {
            const prefixedKey = this.getKey(key);
            const serialized = JSON.stringify(value);
            localStorage.setItem(prefixedKey, serialized);
            return true;
        } catch (e) {
            console.error('Error saving to localStorage:', e);
            return false;
        }
    },
    
    // Get item
    get(key, defaultValue = null) {
        if (!this.isAvailable()) return defaultValue;
        
        try {
            const prefixedKey = this.getKey(key);
            const item = localStorage.getItem(prefixedKey);
            if (item === null) return defaultValue;
            return JSON.parse(item);
        } catch (e) {
            console.error('Error reading from localStorage:', e);
            return defaultValue;
        }
    },
    
    // Remove item
    remove(key) {
        if (!this.isAvailable()) return false;
        
        try {
            const prefixedKey = this.getKey(key);
            localStorage.removeItem(prefixedKey);
            return true;
        } catch (e) {
            console.error('Error removing from localStorage:', e);
            return false;
        }
    },
    
    // Clear all Sparkie data
    clear() {
        if (!this.isAvailable()) return false;
        
        try {
            const keys = Object.keys(localStorage);
            const sparkieKeys = keys.filter(key => key.startsWith(this.prefix));
            sparkieKeys.forEach(key => localStorage.removeItem(key));
            return true;
        } catch (e) {
            console.error('Error clearing localStorage:', e);
            return false;
        }
    },
    
    // Get storage usage
    getUsage() {
        if (!this.isAvailable()) return { used: 0, total: 0, percent: 0 };
        
        try {
            let total = 0;
            const items = [];
            
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith(this.prefix)) {
                    const value = localStorage.getItem(key);
                    total += (key.length + value.length) * 2; // Approximate bytes
                    items.push({ key, size: (key.length + value.length) * 2 });
                }
            }
            
            // Most browsers allow ~5MB
            const totalLimit = 5 * 1024 * 1024;
            
            return {
                used: total,
                total: totalLimit,
                percent: ((total / totalLimit) * 100).toFixed(2),
                items: items.sort((a, b) => b.size - a.size)
            };
        } catch (e) {
            console.error('Error calculating storage usage:', e);
            return { used: 0, total: 5 * 1024 * 1024, percent: 0, items: [] };
        }
    }
};

// User Management
const UserManager = {
    currentUser: null,
    
    // Register new user
    register(username, email, password) {
        const users = StorageManager.get('users', {});
        
        if (users[email]) {
            return { success: false, message: 'Email already registered' };
        }
        
        if (users[username]) {
            return { success: false, message: 'Username already taken' };
        }
        
        users[email] = {
            username,
            email,
            password: this.hashPassword(password),
            createdAt: new Date().toISOString(),
            settings: {}
        };
        
        StorageManager.set('users', users);
        
        // Auto login
        return this.login(email, password);
    },
    
    // Login user
    login(email, password) {
        const users = StorageManager.get('users', {});
        const user = users[email];
        
        if (!user) {
            return { success: false, message: 'User not found' };
        }
        
        if (user.password !== this.hashPassword(password)) {
            return { success: false, message: 'Invalid password' };
        }
        
        this.currentUser = {
            username: user.username,
            email: user.email,
            settings: user.settings || {}
        };
        
        StorageManager.set(Config.storage.user, this.currentUser);
        
        return { success: true, user: this.currentUser };
    },
    
    // Logout user
    logout() {
        this.currentUser = null;
        StorageManager.remove(Config.storage.user);
        return { success: true };
    },
    
    // Check if logged in
    isLoggedIn() {
        if (this.currentUser) return true;
        this.currentUser = StorageManager.get(Config.storage.user);
        return this.currentUser !== null;
    },
    
    // Get current user
    getCurrentUser() {
        if (!this.currentUser) {
            this.currentUser = StorageManager.get(Config.storage.user);
        }
        return this.currentUser;
    },
    
    // Simple hash function (for demo purposes - use proper hashing in production)
    hashPassword(password) {
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    },
    
    // Update user settings
    updateSettings(settings) {
        if (!this.currentUser) return { success: false, message: 'Not logged in' };
        
        this.currentUser.settings = { ...this.currentUser.settings, ...settings };
        StorageManager.set(Config.storage.user, this.currentUser);
        
        // Update in users database
        const users = StorageManager.get('users', {});
        if (users[this.currentUser.email]) {
            users[this.currentUser.email].settings = this.currentUser.settings;
            StorageManager.set('users', users);
        }
        
        return { success: true };
    }
};

// Chat History Management
const ChatManager = {
    chats: [],
    currentChatId: null,
    
    // Initialize
    init() {
        this.chats = StorageManager.get(Config.storage.chats, []);
        this.currentChatId = StorageManager.get(Config.storage.currentChat);
        return this;
    },
    
    // Create new chat
    createChat(title = 'New Chat') {
        const chat = {
            id: this.generateId(),
            title,
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        this.chats.unshift(chat);
        this.saveChats();
        this.setCurrentChat(chat.id);
        
        return chat;
    },
    
    // Get current chat
    getCurrentChat() {
        if (!this.currentChatId) {
            const chat = this.createChat();
            return chat;
        }
        
        return this.chats.find(c => c.id === this.currentChatId) || this.createChat();
    },
    
    // Set current chat
    setCurrentChat(chatId) {
        this.currentChatId = chatId;
        StorageManager.set(Config.storage.currentChat, chatId);
        return this.getCurrentChat();
    },
    
    // Add message to current chat
    addMessage(role, content, attachments = [], metadata = {}) {
        const chat = this.getCurrentChat();
        const message = {
            id: this.generateId(),
            role,
            content,
            attachments,
            metadata,
            timestamp: new Date().toISOString()
        };
        
        chat.messages.push(message);
        chat.updatedAt = new Date().toISOString();
        
        // Update title if first message
        if (chat.messages.length === 2) { // system + user
            chat.title = content.slice(0, 30) + (content.length > 30 ? '...' : '');
        }
        
        this.saveChats();
        return message;
    },
    
    // Get message by ID
    getMessage(messageId) {
        for (const chat of this.chats) {
            const message = chat.messages.find(m => m.id === messageId);
            if (message) return message;
        }
        return null;
    },
    
    // Get all chats
    getAllChats() {
        return this.chats;
    },
    
    // Get chat by ID
    getChat(chatId) {
        return this.chats.find(c => c.id === chatId);
    },
    
    // Delete chat
    deleteChat(chatId) {
        const index = this.chats.findIndex(c => c.id === chatId);
        if (index !== -1) {
            this.chats.splice(index, 1);
            this.saveChats();
            
            if (this.currentChatId === chatId) {
                if (this.chats.length > 0) {
                    this.setCurrentChat(this.chats[0].id);
                } else {
                    this.currentChatId = null;
                    StorageManager.remove(Config.storage.currentChat);
                }
            }
            return true;
        }
        return false;
    },
    
    // Save chats to storage
    saveChats() {
        // Limit chat history to prevent storage overflow
        if (this.chats.length > Config.ui.maxMessages) {
            this.chats = this.chats.slice(0, Config.ui.maxMessages);
        }
        StorageManager.set(Config.storage.chats, this.chats);
    },
    
    // Generate unique ID
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    },
    
    // Clear all chats
    clearAll() {
        this.chats = [];
        this.currentChatId = null;
        StorageManager.remove(Config.storage.chats);
        StorageManager.remove(Config.storage.currentChat);
    }
};

// File Manager for IDE
const FileManager = {
    files: {},
    currentFile: 'main.py',
    currentFolder: '/',
    
    // Initialize
    init() {
        this.files = StorageManager.get(Config.storage.files, {});
        
        // Create default files if none exist
        if (Object.keys(this.files).length === 0) {
            this.files = { ...Config.defaultFiles };
            this.saveFiles();
        }
        
        return this;
    },
    
    // Get all files
    getAllFiles() {
        return this.files;
    },
    
    // Get file content
    getFile(filename) {
        return this.files[filename] || null;
    },
    
    // Set file content
    setFile(filename, content) {
        this.files[filename] = content;
        this.saveFiles();
        return true;
    },
    
    // Delete file
    deleteFile(filename) {
        if (this.files[filename]) {
            delete this.files[filename];
            this.saveFiles();
            return true;
        }
        return false;
    },
    
    // Rename file
    renameFile(oldName, newName) {
        if (this.files[oldName] && !this.files[newName]) {
            this.files[newName] = this.files[oldName];
            delete this.files[oldName];
            this.saveFiles();
            
            if (this.currentFile === oldName) {
                this.currentFile = newName;
            }
            
            return true;
        }
        return false;
    },
    
    // Get file list
    getFileList() {
        return Object.keys(this.files).map(filename => ({
            name: filename,
            type: this.getFileType(filename),
            content: this.files[filename]
        }));
    },
    
    // Get file type
    getFileType(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const types = {
            'py': 'python',
            'js': 'javascript',
            'html': 'html',
            'css': 'css',
            'json': 'json',
            'txt': 'text'
        };
        return types[ext] || 'text';
    },
    
    // Set current file
    setCurrentFile(filename) {
        if (this.files[filename]) {
            this.currentFile = filename;
            return true;
        }
        return false;
    },
    
    // Get current file
    getCurrentFile() {
        return {
            name: this.currentFile,
            content: this.files[this.currentFile] || ''
        };
    },
    
    // Save files to storage
    saveFiles() {
        StorageManager.set(Config.storage.files, this.files);
    },
    
    // Clear all files
    clearAll() {
        this.files = { ...Config.defaultFiles };
        this.currentFile = 'main.py';
        this.saveFiles();
    }
};

// Image Gallery Manager
const ImageManager = {
    images: [],
    
    // Initialize
    init() {
        this.images = StorageManager.get(Config.storage.images, []);
        // Clean up images with expired Azure Blob Storage URLs (SAS tokens expire)
        this.cleanupExpiredImages();
        return this;
    },
    
    // Clean up images with expired/invalid URLs
    cleanupExpiredImages() {
        const originalCount = this.images.length;
        // Filter out images with Azure Blob Storage URLs (they have SAS tokens that expire)
        // Keep only Pollinations URLs or proxied URLs that go through our backend
        this.images = this.images.filter(img => {
            if (!img.url) return false;
            // Keep Pollinations URLs (they don't expire)
            if (img.url.includes('pollinations.ai')) return true;
            // Keep proxied URLs (they go through our backend)
            if (img.url.includes('/api/media-proxy')) return true;
            // Keep data URLs
            if (img.url.startsWith('data:')) return true;
            // Remove Azure Blob Storage URLs (SAS tokens expire)
            if (img.url.includes('blob.core.windows.net')) {
                console.log('Removing expired Azure image:', img.id);
                return false;
            }
            // Remove other external URLs that might have expired
            if (img.url.includes('_sample.jpeg') || img.url.includes('siliconflow')) {
                console.log('Removing potentially expired image:', img.id);
                return false;
            }
            return true;
        });
        
        if (this.images.length !== originalCount) {
            console.log(`Cleaned up ${originalCount - this.images.length} expired images from gallery`);
            this.saveImages();
        }
    },
    
    // Add image
    addImage(imageData) {
        const image = {
            id: this.generateId(),
            url: imageData.url,
            prompt: imageData.prompt,
            size: imageData.size,
            createdAt: new Date().toISOString()
        };
        
        this.images.unshift(image);
        this.saveImages();
        
        return image;
    },
    
    // Get all images
    getAllImages() {
        return this.images;
    },
    
    // Delete image
    deleteImage(imageId) {
        const index = this.images.findIndex(img => img.id === imageId);
        if (index !== -1) {
            this.images.splice(index, 1);
            this.saveImages();
            return true;
        }
        return false;
    },
    
    // Save images to storage
    saveImages() {
        // Limit to 50 images
        if (this.images.length > 50) {
            this.images = this.images.slice(0, 50);
        }
        StorageManager.set(Config.storage.images, this.images);
    },
    
    // Generate unique ID
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    },
    
    // Clear all images
    clearAll() {
        this.images = [];
        StorageManager.remove(Config.storage.images);
    }
};

// Export managers
window.StorageManager = StorageManager;
window.UserManager = UserManager;
window.ChatManager = ChatManager;
window.FileManager = FileManager;
window.ImageManager = ImageManager;
