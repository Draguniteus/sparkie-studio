/**
 * API Module - Integration with MiniMax, ModelScope and other APIs
 */

const API = {
    // Request timeout (30 seconds)
    timeout: 30000,
    
    // Generic request handler
    async request(url, options = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.message || `HTTP error ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new Error('Request timed out');
            }
            
            throw error;
        }
    },
    
    // MiniMax Chat API (using backend proxy)
    minimax: {
        // Send chat message through backend proxy
        async chat(messages, options = {}) {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: messages.map(msg => ({
                        role: msg.role,
                        content: msg.content
                    })),
                    temperature: options.temperature || 0.7,
                    max_tokens: options.maxTokens || 4000
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const error = new Error(errorData.error || `HTTP error ${response.status}`);
                // Pass through detailed error info
                error.detail = errorData.detail;
                error.hint = errorData.hint;
                throw error;
            }

            return await response.json();
        },
        
        // Stream chat (for future implementation)
        async *streamChat(messages, options = {}) {
            const { apiKey, groupId, model, temperature } = Config.api.minimax;
            
            if (!apiKey || !groupId) {
                throw new Error('MiniMax API key or Group ID not configured');
            }
            
            const body = {
                model,
                messages: messages.map(msg => ({
                    role: msg.role,
                    content: msg.content
                })),
                temperature: temperature || 0.7,
                stream: true,
                ...options
            };
            
            const response = await fetch(`${Config.api.minimax.baseUrl}/text/chatcompletion_v2`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'X-GroupId': groupId,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim());
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data !== '[DONE]') {
                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.choices && parsed.choices[0].delta?.content) {
                                    yield parsed.choices[0].delta.content;
                                }
                            } catch (e) {
                                // Skip invalid JSON
                            }
                        }
                    }
                }
            }
        },
        
        // Vision API - Analyze images
        async vision(imageUrl, prompt = 'Describe this image in detail') {
            const { apiKey, groupId, model } = Config.api.minimax;
            
            if (!apiKey || !groupId) {
                throw new Error('MiniMax API key or Group ID not configured');
            }
            
            const body = {
                model,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            { type: 'image_url', image_url: { url: imageUrl } }
                        ]
                    }
                ]
            };
            
            return API.request(`${Config.api.minimax.baseUrl}/text/chatcompletion_v2`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'X-GroupId': groupId
                },
                body: JSON.stringify(body)
            });
        },
        
        // Search API - Web search capability
        async search(query, options = {}) {
            const { apiKey, groupId } = Config.api.minimax;
            
            if (!apiKey || !groupId) {
                throw new Error('MiniMax API key or Group ID not configured');
            }
            
            const body = {
                query,
                max_results: options.maxResults || 10,
                ...options
            };
            
            return API.request(`${Config.api.minimax.baseUrl}/text/search`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'X-GroupId': groupId
                },
                body: JSON.stringify(body)
            });
        }
    },
    
    // DeepSeek Chat API (using backend proxy)
    deepseek: {
        // Send chat message through backend proxy
        async chat(messages, options = {}) {
            const response = await fetch('/api/chat/deepseek', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: messages.map(msg => ({
                        role: msg.role,
                        content: msg.content
                    })),
                    temperature: options.temperature || 0.7,
                    max_tokens: options.maxTokens || 4000
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const error = new Error(errorData.error || `HTTP error ${response.status}`);
                // Pass through detailed error info
                error.detail = errorData.detail;
                error.hint = errorData.hint;
                throw error;
            }

            return await response.json();
        }
    },
    
    // Groq Chat API (Free tier, very fast!)
    groq: {
        // Send chat message through backend proxy
        async chat(messages, options = {}) {
            const response = await fetch('/api/chat/groq', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: messages.map(msg => ({
                        role: msg.role,
                        content: msg.content
                    })),
                    temperature: options.temperature || 0.7,
                    max_tokens: options.maxTokens || 4000
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const error = new Error(errorData.error || `HTTP error ${response.status}`);
                // Pass through detailed error info
                error.detail = errorData.detail;
                error.hint = errorData.hint;
                throw error;
            }

            return await response.json();
        }
    },
    
    // ModelScope Image Generation API
    modelscope: {
        // Generate image from prompt using backend proxy
        async generate(prompt, options = {}) {
            const { width = 1024, height = 1024 } = options;
            
            const response = await fetch('/api/images/modelscope', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt,
                    width,
                    height
                })
            });
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.message || `HTTP error ${response.status}`);
            }
            
            return await response.json();
        },
        
        // Use Pollinations API (backup) through backend
        async generatePollinations(prompt, options = {}) {
            const { width = 1024, height = 1024, model = 'zimage' } = options;
            
            const response = await fetch('/api/images/pollinations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt,
                    width,
                    height,
                    model
                })
            });
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.message || `HTTP error ${response.status}`);
            }
            
            return await response.json();
        }
    },
    
    // Pollinations API (Direct access)
    pollinations: {
        // Generate image from prompt
        async generate(prompt, options = {}) {
            const { 
                width = 1024, 
                height = 1024, 
                model = 'zimage',
                seed = null
            } = options;
            
            const encodedPrompt = encodeURIComponent(prompt);
            
            let url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=${model}&nologo=true`;
            
            if (seed) {
                url += `&seed=${seed}`;
            }
            
            return {
                url,
                prompt,
                width,
                height,
                model
            };
        },
        
        // Get available models
        getModels() {
            return {
                'zimage': 'Z-Image Turbo (Fast & Cheap)',
                'turbo': 'SDXL Turbo (High Quality)',
                'flux': 'FLUX Schnellflux (Best Quality)',
                'klein': 'FLUX.2 Klein (Detailed)',
                'seedream': 'Seedream 4.0 (Creative)',
                'nanobanana': 'NanoBanana (Fast)'
            };
        },
        
        // Get default model
        getDefaultModel() {
            return 'zimage';
        }
    },
    
    // Text-to-Speech API
    tts: {
        // Generate speech from text
        async generate(text, options = {}) {
            const apiKey = Config.getModelScopeKey();
            
            if (!apiKey) {
                throw new Error('ModelScope API key not configured');
            }
            
            const body = {
                input: text,
                voice: options.voice || 'default',
                speed: options.speed || 1.0
            };
            
            return API.request(`${Config.api.modelscope.baseUrl}/audio/speech`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
        },
        
        // Browser Speech Synthesis (free alternative)
        speak(text, options = {}) {
            if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = options.lang || 'en-US';
                utterance.rate = options.speed || 1;
                utterance.pitch = options.pitch || 1;
                utterance.volume = options.volume || 1;
                
                // Try to find a good voice
                const voices = speechSynthesis.getVoices();
                const preferredVoice = options.voice || 'Google US English';
                const voice = voices.find(v => v.name.includes(preferredVoice)) || voices[0];
                if (voice) utterance.voice = voice;
                
                speechSynthesis.cancel(); // Stop any current speech
                speechSynthesis.speak(utterance);
                
                return true;
            }
            return false;
        }
    },
    
    // Utility: Check API availability via backend
    async checkAvailability() {
        try {
            const response = await fetch('/api/health');
            if (response.ok) {
                const health = await response.json();
                // Server-side API is configured if status is healthy
                if (health.status === 'healthy') {
                    return {
                        minimax: health.apis?.minimax || false,
                        deepseek: health.apis?.deepseek || false,
                        groq: health.apis?.groq || false,
                        modelscope: health.apis?.modelscope || false
                    };
                }
            }
        } catch (e) {
            console.error('Error checking API health:', e);
        }

        // Backend not available or not configured, check local config as fallback
        const results = {
            minimax: false,
            deepseek: false,
            modelscope: false
        };

        try {
            const { apiKey, groupId } = Config.api.minimax;
            if (apiKey && groupId) {
                results.minimax = true;
            }
        } catch (e) {
            results.minimax = false;
        }

        try {
            const modelScopeKey = Config.getModelScopeKey();
            if (modelScopeKey) {
                results.modelscope = true;
            }
        } catch (e) {
            results.modelscope = false;
        }

        return results;
    }
};

// Export API
window.API = API;
