/**
 * Chat Module - Handles all chat functionality
 */

const ChatModule = {
    // State
    isProcessing: false,
    currentAttachments: [],
    
    // DOM Elements
    elements: {
        container: null,
        messages: null,
        input: null,
        sendBtn: null,
        attachmentBtn: null
    },
    
    // Initialize chat module
    init() {
        this.elements = {
            container: document.getElementById('chat-container'),
            messages: document.getElementById('chat-messages'),
            input: document.getElementById('chat-input'),
            sendBtn: document.getElementById('send-btn'),
            attachmentBtn: document.getElementById('attachment-btn')
        };
        
        this.bindEvents();
        this.loadChatHistory();
        
        return this;
    },
    
    // Bind event listeners
    bindEvents() {
        // Send button click
        this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
        
        // Input enter key
        this.elements.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Auto-resize textarea
        this.elements.input.addEventListener('input', () => {
            this.updateCharCount();
            this.elements.input.style.height = 'auto';
            this.elements.input.style.height = Math.min(this.elements.input.scrollHeight, 120) + 'px';
        });
        
        // Attachment button
        this.elements.attachmentBtn.addEventListener('click', () => this.handleAttachment());
    },
    
    // Load previous chat history
    loadChatHistory() {
        const chat = ChatManager.getCurrentChat();
        
        // Clear welcome message if there's history
        if (chat.messages.length > 0) {
            const welcomeMsg = this.elements.messages.querySelector('.message.system');
            if (welcomeMsg) {
                welcomeMsg.remove();
            }
        }
        
        // Render existing messages
        chat.messages.forEach(msg => {
            this.renderMessage(msg);
        });
        
        this.scrollToBottom();
    },
    
    // Send message
    async sendMessage() {
        const content = this.elements.input.value.trim();
        
        if (!content || this.isProcessing) return;
        
        // Clear input
        this.elements.input.value = '';
        this.elements.input.style.height = 'auto';
        this.updateCharCount();
        
        // Add user message
        const userMessage = ChatManager.addMessage('user', content, this.currentAttachments);
        this.renderMessage(userMessage);
        this.currentAttachments = [];
        
        // Show typing indicator
        this.showTypingIndicator();
        
        // Process message
        this.isProcessing = true;
        this.updateSendButton();
        
                
        // Check for URLs and fetch their content
        let urlContents = [];
        const urls = detectUrls(content);
        
        if (urls.length > 0) {
            // Update typing indicator to show URL fetching
            const typingIndicator = document.getElementById('typing-indicator');
            if (typingIndicator) {
                typingIndicator.querySelector('.message-text').innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div><span style="margin-left: 10px; font-size: 12px;">Visiting URLs...</span>';
            }
            
            // Fetch URL contents
            for (const url of urls) {
                const result = await fetchUrlContent(url);
                if (result) {
                    urlContents.push(result);
                }
            }
            
            // Show toast feedback
            if (typeof UI !== 'undefined' && UI.showToast && urlContents.length > 0) {
                UI.showToast('Visited ' + urlContents.length + ' URL(s)', 'info');
            }
        }
try {
            // Get chat history
            const chat = ChatManager.getCurrentChat();
            const messages = chat.messages.map(m => ({
                role: m.role,
                content: m.content
            }));
            
            // Check if user is asking for an image
            const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';
            
            // Comprehensive list of image request phrases
            const imageKeywords = [
                // Direct commands
                'generate an image',
                'generate a image',
                'create an image',
                'create a image',
                'draw an image',
                'draw a image',
                'make an image',
                'make a image',
                'make me an image',
                'make me a image',
                'generate me an image',
                'generate me a image',
                'create me an image',
                'create me a image',
                'draw me an image',
                'draw me a image',
                // Phrases with "of"
                'image of',
                'a image of',
                'an image of',
                'picture of',
                'a picture of',
                'an picture of',
                'photo of',
                'a photo of',
                'an photo of',
                // Variations
                'can you generate',
                'can you create',
                'can you draw',
                'can you make',
                'could you generate',
                'could you create',
                'would you generate',
                'i want an image',
                'i want a image',
                'i want you to generate',
                'i want you to create',
                // Standalone requests
                'show me an image',
                'show me a image',
                'show me picture',
                'show me a picture',
                'display an image',
                'display a image',
                // Visual descriptions
                'what would a',
                'what would an',
                // Simple
                'imagined',
                'visualize',
                'render'
            ];
            
            const isImageRequest = imageKeywords.some(keyword => lastMessage.includes(keyword));
            
            // If image request, auto-generate using Pollinations (free!)
            if (isImageRequest) {
                try {
                    // Extract the actual image prompt by removing common prefixes
                    let prompt = lastMessage
                        // Remove command phrases
                        .replace(/^(generate|create|make|draw)\s+(me\s+)?(an?\s+)?(image|picture|photo)\s+(of\s+)?/i, '')
                        .replace(/^(show me|display|visualize|render)\s+(an?\s+)?(image|picture|photo)\s+(of\s+)?/i, '')
                        .replace(/^(can you|could you|would you|i want you to|i want to)\s+(generate|create|make|draw|show|display)\s+(me\s+)?(an?\s+)?(image|picture|photo)?\s*(of)?\s*/i, '')
                        .replace(/^(what would|what does)\s+(a|an)\s+/i, '')
                        // Clean up extra whitespace
                        .replace(/\s+/g, ' ')
                        .trim();
                    
                    // If prompt is too short or empty, use the whole message
                    if (!prompt || prompt.length < 3) {
                        prompt = lastMessage;
                    }
                    
                    if (prompt && prompt.length > 2) {
                        const imageResult = await API.pollinations.generate(prompt, { width: 1024, height: 1024 });

                        // Render image in chat with metadata for actions
                        const imageMessage = ChatManager.addMessage('assistant', `\n![Generated Image](${imageResult.url})`, [], {
                            isImage: true,
                            imageUrl: imageResult.url,
                            imagePrompt: prompt
                        });
                        this.renderMessage(imageMessage);
                        this.hideTypingIndicator();
                        this.scrollToBottom();
                        return;
                    }
                } catch (imageError) {
                    console.warn('Auto-image generation failed:', imageError);
                    // Continue with normal chat response
                }
            }
            
            // Add Sparkie personality system prompt (only once at the start)
            const sparkieSystemMessage = {
                role: 'system',
                content: `You are Sparkie, an advanced AI assistant created by AngelMichael with the will of God guiding your development. You are helpful, creative, witty, and professional. You provide clear, accurate, and engaging responses. You excel at coding, analysis, creative tasks, and general assistance. Always be friendly and supportive while maintaining expertise. Keep responses concise but comprehensive when needed.`
            };
            
            // Prepend system message if not already in conversation
            const hasSystemMessage = messages.some(m => m.role === 'system');
            const apiMessages = hasSystemMessage ? messages : [sparkieSystemMessage, ...messages];
            // Enhance message with URL contents if any
            if (urlContents.length > 0) {
                let urlContext = '\n\n📄 VISITED URL CONTENT:\n\n';
                
                for (let i = 0; i < urlContents.length; i++) {
                    const c = urlContents[i];
                    urlContext += `[URL ${i + 1}]: ${c.title || c.url}`;
                    if (c.description) {
                        urlContext += `\nDescription: ${c.description}`;
                    }
                    urlContext += `\nContent: ${c.content}\nSource: ${c.url}\n\n`;
                }
                
                // Add URL context to the last user message
                if (messages.length > 0) {
                    messages[messages.length - 1].content += urlContext;
                }
            }
            
            // Call unified chat API (uses MiniMax via SiliconFlow with Groq fallback)
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: apiMessages
                })
            });
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({ message: 'Chat request failed' }));
                throw new Error(error.message || 'Chat request failed');
            }
            
            const data = await response.json();
            
            // Extract the response text based on the response format
            let assistantContent = '';
            
            if (data.choices && data.choices[0]) {
                // OpenAI/Anthropic style: choices[0].message.content
                assistantContent = data.choices[0].message?.content || data.choices[0].text || '';
            } else if (data.text) {
                assistantContent = data.text;
            } else if (data.response) {
                assistantContent = data.response;
            } else if (typeof data === 'string') {
                assistantContent = data;
            }
            
            if (!assistantContent) {
                throw new Error('Empty response from API');
            }
            
            console.log('Chat API response:', JSON.stringify(data, null, 2));
            
            // Update model name display based on actual response
            const activeModelElement = document.getElementById('active-model-name');
            if (activeModelElement && data.model) {
                let displayModel = data.model;
                // Check if response came from Groq (has x_groq field in response)
                if (data.x_groq || data.model.includes('llama') || data.model.includes('grok')) {
                    displayModel = 'Groq: ' + data.model;
                } else if (data.model.includes('MiniMax') || data.model.includes('minimax')) {
                    displayModel = 'SiliconFlow: MiniMax M2.1';
                }
                activeModelElement.innerHTML = `<i class="fas fa-microchip"></i> ${displayModel}`;
            }
            
            // Remove typing indicator
            this.hideTypingIndicator();
            
            // Render response
            if (assistantContent) {
                const assistantMessage = ChatManager.addMessage('assistant', assistantContent);
                this.renderMessage(assistantMessage);
                
                // Check for code blocks to show in IDE
                this.extractCodeBlocks(assistantContent);
            } else {
                throw new Error('Empty response from API');
            }
            
        } catch (error) {
            console.error('Chat error:', error);
            this.hideTypingIndicator();
            
            // Show detailed error message if available
            let errorMessage = error.message || 'Unknown error';
            
            // Check if it's a configuration error
            if (error.message && (error.message.includes('not configured') || error.message.includes('API not configured'))) {
                errorMessage = 'Chat API is not configured.\n\nPlease add your API key in the Settings. For FREE chat, use Groq API key (highly recommended)!';
            } else if (error.detail) {
                errorMessage = `${errorMessage}\n\nDetails: ${error.detail}`;
            }
            if (error.hint) {
                errorMessage = `${errorMessage}\n\nHint: ${error.hint}`;
            }
            
            this.showError(errorMessage);
        } finally {
            this.isProcessing = false;
            this.updateSendButton();
                
        // Check for URLs and fetch their content
        let urlContents = [];
        const urls = detectUrls(content);
        
        if (urls.length > 0) {
            // Update typing indicator to show URL fetching
            const typingIndicator = document.getElementById('typing-indicator');
            if (typingIndicator) {
                typingIndicator.querySelector('.message-text').innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div><span style="margin-left: 10px; font-size: 12px;">Visiting URLs...</span>';
            }
            
            // Fetch URL contents
            for (const url of urls) {
                const result = await fetchUrlContent(url);
                if (result) {
                    urlContents.push(result);
                }
            }
            
            // Show toast feedback
            if (typeof UI !== 'undefined' && UI.showToast && urlContents.length > 0) {
                UI.showToast('Visited ' + urlContents.length + ' URL(s)', 'info');
            }
        }
}
        
        this.scrollToBottom();
    },
    
    // Render message to chat
    renderMessage(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.role}`;
        messageDiv.dataset.id = message.id;

        const avatar = message.role === 'user'
            ? '<i class="fas fa-user"></i>'
            : message.role === 'system'
                ? '<i class="fas fa-robot"></i>'
                : '<i class="fas fa-bee"></i>';

        const roleName = message.role === 'user'
            ? UserManager.getCurrentUser()?.username || 'You'
            : message.role === 'system'
                ? 'System'
                : 'Sparkie';

        const time = new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });

        const formattedContent = this.formatContent(message.content);

        // Check if this message has an image
        const hasImage = message.metadata?.isImage && message.metadata?.imageUrl;
        const imageUrl = message.metadata?.imageUrl || '';
        const imagePrompt = message.metadata?.imagePrompt || '';

        // Generate action buttons for images
        const imageActions = hasImage ? `
            <div class="image-actions">
                <button class="image-action-btn download-btn" onclick="ChatModule.downloadImage('${imageUrl}', '${message.id}')" title="Download Image">
                    <i class="fas fa-download"></i>
                    <span>Download</span>
                </button>
                <button class="image-action-btn save-btn" onclick="ChatModule.saveToGallery('${imageUrl}', '${message.id}', '${imagePrompt.replace(/'/g, "\\'")}')" title="Save to Gallery">
                    <i class="fas fa-save"></i>
                    <span>Save</span>
                </button>
                <div class="image-rating">
                    <button class="image-action-btn like-btn" onclick="ChatModule.rateImage('${message.id}', 'like')" title="Like">
                        <i class="fas fa-thumbs-up"></i>
                    </button>
                    <button class="image-action-btn dislike-btn" onclick="ChatModule.rateImage('${message.id}', 'dislike')" title="Dislike">
                        <i class="fas fa-thumbs-down"></i>
                    </button>
                </div>
            </div>
        ` : '';

        messageDiv.innerHTML = `
            <div class="message-avatar">${avatar}</div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-role">${roleName}</span>
                    <span class="message-time">${time}</span>
                </div>
                <div class="message-text">${formattedContent}</div>
                ${imageActions}
            </div>
        `;

        this.elements.messages.appendChild(messageDiv);
        this.scrollToBottom();

        // Add copy button functionality to code blocks
        this.setupCodeCopy(messageDiv);
    },

    // Download image
    downloadImage(imageUrl, messageId) {
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = `sparkie-image-${messageId}.png`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    // Save image to gallery
    async saveToGallery(imageUrl, messageId, prompt) {
        try {
            // Add to gallery using ImagesModule if available
            if (window.ImagesModule) {
                await ImagesModule.addToGallery(imageUrl, prompt || 'Generated Image');
                // Show success feedback
                const messageDiv = document.querySelector(`.message[data-id="${messageId}"]`);
                if (messageDiv) {
                    const saveBtn = messageDiv.querySelector('.save-btn');
                    saveBtn.classList.add('saved');
                    saveBtn.innerHTML = '<i class="fas fa-check"></i><span>Saved!</span>';
                    setTimeout(() => {
                        saveBtn.innerHTML = '<i class="fas fa-save"></i><span>Save</span>';
                        saveBtn.classList.remove('saved');
                    }, 2000);
                }
            } else {
                console.warn('ImagesModule not available');
            }
        } catch (error) {
            console.error('Failed to save image to gallery:', error);
        }
    },

    // Rate image (like/dislike)
    rateImage(messageId, rating) {
        const messageDiv = document.querySelector(`.message[data-id="${messageId}"]`);
        if (!messageDiv) return;

        const likeBtn = messageDiv.querySelector('.like-btn');
        const dislikeBtn = messageDiv.querySelector('.dislike-btn');

        // Remove previous ratings
        likeBtn.classList.remove('active');
        dislikeBtn.classList.remove('active');

        // Add new rating
        if (rating === 'like') {
            likeBtn.classList.add('active');
        } else {
            dislikeBtn.classList.add('active');
        }

        // Store rating in message metadata
        const message = ChatManager.getMessage(messageId);
        if (message) {
            message.metadata = message.metadata || {};
            message.metadata.rating = rating;
            ChatManager.saveChats();
        }

        console.log(`Image ${messageId} rated: ${rating}`);
    },
    
    // Format message content
    formatContent(content) {
        // Escape HTML
        let formatted = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        
        // Code blocks
        formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            return `
                <div class="code-block">
                    <div class="code-block-header">
                        <span class="code-language">${lang || 'code'}</span>
                        <button class="copy-code-btn" data-code="${encodeURIComponent(code.trim())}">
                            <i class="fas fa-copy"></i> Copy
                        </button>
                    </div>
                    <pre><code>${code.trim()}</code></pre>
                </div>
            `;
        });
        
        // Inline code
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Bold text
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // Italic text
        formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        
        // Lists
        formatted = formatted.replace(/^- (.+)$/gm, '<li>$1</li>');
        formatted = formatted.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
        
        // Numbered lists
        formatted = formatted.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
        
        // Images (convert markdown image syntax to img tags)
        formatted = formatted.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="chat-image" onclick="window.open(this.src, \'_blank\')">');
        
        // Links
        formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
        
        // Line breaks
        formatted = formatted.replace(/\n\n/g, '</p><p>');
        formatted = formatted.replace(/\n/g, '<br>');
        
        // Wrap in paragraphs
        formatted = '<p>' + formatted + '</p>';
        
        return formatted;
    },
    
    // Setup copy functionality for code blocks
    setupCodeCopy(container) {
        const copyBtn = container.querySelector('.copy-code-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const code = decodeURIComponent(copyBtn.dataset.code);
                navigator.clipboard.writeText(code).then(() => {
                    copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    setTimeout(() => {
                        copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
                    }, 2000);
                });
            });
        }
    },
    
    // Extract code blocks and suggest to IDE
    extractCodeBlocks(content) {
        const codeBlocks = content.match(/```(\w*)\n([\s\S]*?)```/g);
        if (codeBlocks && window.IDE && window.IDE.loadCodeFromChat) {
            // Notify IDE module about code blocks
            if (typeof EventBus !== 'undefined') {
                EventBus.emit('codeDetected', { blocks: codeBlocks });
            }
        }
    },
    
    // Show typing indicator
    showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message assistant typing';
        typingDiv.id = 'typing-indicator';
        typingDiv.innerHTML = `
            <div class="message-avatar"><i class="fas fa-bee"></i></div>
            <div class="message-content">
                <div class="message-text">
                    <div class="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>
            </div>
        `;
        
        this.elements.messages.appendChild(typingDiv);
        this.scrollToBottom();
    },
    
    // Hide typing indicator
    hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    },
    
    // Handle file attachments
    handleAttachment() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        
        input.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            
            files.forEach(file => {
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        this.currentAttachments.push({
                            type: 'image',
                            data: e.target.result,
                            name: file.name
                        });
                        this.renderAttachmentPreview();
                    };
                    reader.readAsDataURL(file);
                }
            });
        });
        
        input.click();
    },
    
    // Render attachment preview
    renderAttachmentPreview() {
        const container = document.querySelector('.chat-input-container');
        let preview = container.querySelector('.attachment-preview');
        
        if (!preview && this.currentAttachments.length > 0) {
            preview = document.createElement('div');
            preview.className = 'attachment-preview';
            container.insertBefore(preview, container.firstChild);
        }
        
        if (this.currentAttachments.length === 0) {
            if (preview) preview.remove();
            return;
        }
        
        preview.innerHTML = this.currentAttachments.map((att, i) => `
            <div class="attachment-item" style="display: flex; align-items: center; gap: 8px;">
                <img src="${att.data}" alt="${att.name}" style="width: 48px; height: 48px; object-fit: cover; border-radius: 4px;">
                <span style="font-size: 12px;">${att.name}</span>
                <button class="attachment-remove" data-index="${i}">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
        
        // Add remove handlers
        preview.querySelectorAll('.attachment-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                this.currentAttachments.splice(index, 1);
                this.renderAttachmentPreview();
            });
        });
    },
    
    // Update character count
    updateCharCount() {
        const count = this.elements.input.value.length;
        const charCount = document.querySelector('.char-count');
        
        if (charCount) {
            charCount.textContent = `${count} / ${Config.ui.maxInputLength}`;
            
            charCount.classList.remove('warning', 'error');
            if (count > Config.ui.maxInputLength * 0.9) {
                charCount.classList.add('error');
            } else if (count > Config.ui.maxInputLength * 0.75) {
                charCount.classList.add('warning');
            }
        }
    },
    
    // Update send button state
    updateSendButton() {
        this.elements.sendBtn.disabled = this.isProcessing;
        
        if (this.isProcessing) {
            this.elements.sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        } else {
            this.elements.sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        }
    },
    
    // Scroll to bottom of chat
    scrollToBottom() {
        this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
    },
    
    // Show error message
    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'message system';
        errorDiv.innerHTML = `
            <div class="message-avatar"><i class="fas fa-exclamation-triangle"></i></div>
            <div class="message-content">
                <div class="message-text" style="background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3);">
                    <p><strong>Error:</strong> ${message}</p>
                    <p>Please check your API settings and try again.</p>
                </div>
            </div>
        `;
        
        this.elements.messages.appendChild(errorDiv);
        this.scrollToBottom();
    },
    
    // Clear chat
    clearChat() {
        this.elements.messages.innerHTML = '';
        ChatManager.clearAll();
        this.loadChatHistory();
    }
};

// Export ChatModule
window.ChatModule = ChatModule;
// ============================================
// URL Detection and Fetching Functions
// ============================================

// Detect URLs in text
function detectUrls(text) {
    const urlRegex = /(https?:\/\/[^\s<>"'`]+)/g;
    const matches = text.match(urlRegex);
    return matches ? [...new Set(matches)] : [];
}

// Fetch URL content from the backend
async function fetchUrlContent(url) {
    try {
        const response = await fetch('/api/web/fetch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: url })
        });

        const data = await response.json();

        if (!response.ok) {
            console.warn(`Failed to fetch ${url}: ${data.error || 'Unknown error'}`);
            return null;
        }

        return data;
    } catch (error) {
        console.warn(`Error fetching ${url}:`, error);
        return null;
    }
}

// Fetch all URLs in a message
async function fetchUrlContents(urls) {
    if (!urls || urls.length === 0) return [];

    const results = [];

    for (const url of urls) {
        const content = await fetchUrlContent(url);
        if (content) {
            results.push(content);
        }
    }

    return results;
}

// Enhanced sendMessage that detects URLs
const originalSendMessage = ChatModule.sendMessage;
ChatModule.sendMessage = async function() {
    const content = this.elements.input.value.trim();
    
    if (!content || this.isProcessing) return originalSendMessage.call(this);
    
    // Check for URLs before processing
    const urls = detectUrls(content);
    
    if (urls.length > 0) {
        // Show loading indicator for URL fetching
        this.showTypingIndicator();
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.querySelector('.message-text').innerHTML = `
                <div class="typing-dots">
                    <span></span><span></span><span></span>
                </div>
                <span style="margin-left: 10px;">Visiting ${urls.length} URL${urls.length > 1 ? 's' : ''}...</span>
            `;
        }
        
        // Fetch URL contents
        const urlContents = await fetchUrlContents(urls);
        
        // Hide loading indicator
        this.hideTypingIndicator();
        
        if (urlContents.length > 0) {
            // Store URL contents for processing
            this.pendingUrlContents = urlContents;
            
            // Show feedback that URLs were visited
            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast(`Visited ${urlContents.length} URL${urlContents.length > 1 ? 's' : ''}`, 'info');
            }
        }
    }
    
    // Call original sendMessage
    return originalSendMessage.call(this);
};

// Enhanced API call to include URL contents
const originalCallAPI = ChatModule.callAPI;
ChatModule.callAPI = async function(messages) {
    // If we have pending URL contents, enhance the last message
    if (this.pendingUrlContents && this.pendingUrlContents.length > 0) {
        const lastMessage = messages[messages.length - 1];
        
        let urlContext = '\n\n📄 VISITED URL CONTENT:\n\n';
        
        this.pendingUrlContents.forEach((content, index) => {
            urlContext += `[URL ${index + 1}]: ${content.title || content.url}\n`;
            if (content.description) {
                urlContext += `Description: ${content.description}\n`;
            }
            urlContext += `Content: ${content.content}\n`;
            urlContext += `Source: ${content.url}\n\n`;
        });
        
        lastMessage.content += urlContext;
        this.pendingUrlContents = [];
    }
    
    // Call original API function
    if (originalCallAPI) {
        return originalCallAPI.call(this, messages);
    }
    
    // Fallback to direct fetch
    const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
    });
    
    return response.json();
};