"""
Sparkie Studio Backend - Minimal API Proxy
Provides secure API endpoints for production deployment
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import requests
import time
from bs4 import BeautifulSoup

# Get the root directory (parent of backend folder)
# Handle different deployment structures
current_file = os.path.abspath(__file__)
if os.path.basename(current_file) == 'main.py' and os.path.basename(os.path.dirname(current_file)) == 'backend':
    # Standard structure: project/backend/main.py
    ROOT_DIR = os.path.dirname(os.path.dirname(current_file))
else:
    # Fallback - use current working directory
    ROOT_DIR = os.getcwd()

app = Flask(__name__)
CORS(app)

# Configuration (strip whitespace/newlines from keys and validate)
POLLINATIONS_API_KEY = (os.environ.get('POLLINATIONS_API_KEY', '') or '').strip()
GROQ_API_KEY = (os.environ.get('GROQ_API_KEY', '') or '').strip()
SILICONFLOW_API_KEY = (os.environ.get('SILICONFLOW_API_KEY', '') or '').strip()
TAVILY_API_KEY = (os.environ.get('TAVILY_API_KEY', '') or '').strip()

# Validate key formats
def is_valid_api_key(key):
    """Check if API key format is valid"""
    if not key:
        return False
    # Remove any remaining whitespace/newlines
    cleaned = key.replace('\n', '').replace('\r', '').strip()
    # Most API keys are longer than 10 characters
    return len(cleaned) > 10 and ' ' not in cleaned

# ============================================
# TAVILY CLIENT SETUP
# ============================================

# Initialize Tavily client if API key is available
tavily_client = None
if TAVILY_API_KEY:
    try:
        from tavily import TavilyClient
        tavily_client = TavilyClient(api_key=TAVILY_API_KEY)
        print("Tavily client initialized successfully")
    except ImportError:
        print("Warning: tavily-python package not installed. Web search will use HTTP fallback.")

# ============================================
# TOOL DEFINITIONS
# ============================================

# Tool definitions for MiniMax agent (OpenAI-compatible format)
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": """Search the web for current/fresh information. Use this whenever the user asks for:
- Latest news, updates, or recent events ("What's the latest news about X?")
- Current information that changes over time (weather, prices, scores)
- Facts that may have changed since my training data ("Is X still true?")
- How to do something with current methods ("How do I X in 2024?")
- Product comparisons or recommendations ("Best laptop for coding")
- Trending topics or viral content
- Verifying current facts ("What's the population of X?")
- Any question where my knowledge might be outdated

Examples of when to search:
- "What's happening in the world today?"
- "What's the latest AI news?"
- "Who won the Super Bowl?"
- "What's the weather in New York?"
- "Is Python still the most popular programming language?"
- "What's trending on Twitter?"
- "Best restaurants near me"
- "Current stock price of Tesla"
- "Latest sports scores"
- "New movie reviews"

After getting search results, provide a clear answer based on the actual results.""",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "A detailed search query. Include context like date, location, or specific aspects to find. Example: 'latest AI developments January 2024' or 'best coding laptops 2024 under $1500'"
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Number of search results (default 6, max 10). Use 6-8 for most queries, 10 for comprehensive research.",
                        "default": 6
                    }
                },
                "required": ["query"]
            }
        }
    }
]

def execute_tool(tool_call):
    """Execute a tool call and return the observation"""
    try:
        func_name = tool_call.get("function", {}).get("name")
        args = tool_call.get("function", {}).get("arguments", {})

        # Parse arguments if it's a string
        if isinstance(args, str):
            import json
            args = json.loads(args)

        if func_name == "web_search":
            query = args.get("query", "")
            max_results = args.get("max_results", 6)

            print(f"[TOOL] Executing web_search for: {query}")

            # Use Tavily client if available, otherwise use HTTP fallback
            if tavily_client:
                result = tavily_client.search(query=query, max_results=max_results)
            else:
                # Fallback to direct HTTP call
                url = "https://api.tavily.com/search"
                payload = {
                    "api_key": TAVILY_API_KEY,
                    "query": query,
                    "max_results": max_results,
                    "include_answer": True,
                    "include_images": False,
                    "include_raw_content": False
                }
                response = requests.post(url, json=payload, timeout=30)
                result = response.json() if response.status_code == 200 else {"results": []}

            # Format results for the model
            if "results" in result:
                summary = "\n\n".join(
                    f"[{i+1}] {r.get('title', 'No title')}\nURL: {r.get('url', 'No URL')}\n{r.get('content', r.get('snippet', ''))[:500]}..."
                    for i, r in enumerate(result.get("results", [])[:max_results])
                )
            else:
                summary = str(result)

            return {
                "role": "tool",
                "tool_call_id": tool_call.get("id"),
                "name": func_name,
                "content": f"Search results for '{query}':\n{summary}\n\nUse these fresh results to answer accurately."
            }
        else:
            return {
                "role": "tool",
                "tool_call_id": tool_call.get("id"),
                "name": func_name,
                "content": f"Tool '{func_name}' not implemented"
            }
    except Exception as e:
        return {
            "role": "tool",
            "tool_call_id": tool_call.get("id"),
            "name": tool_call.get("function", {}).get("name", "unknown"),
            "content": f"Tool execution failed: {str(e)}"
        }

def call_minimax(messages, model="MiniMaxAI/MiniMax-M2.1", temperature=0.7, max_tokens=2048):
    """Call SiliconFlow /chat/completions with tool support"""
    headers = {
        "Authorization": f"Bearer {SILICONFLOW_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "tools": TOOLS,
        "tool_choice": "auto"
    }

    # Try both endpoints
    endpoints = [
        'https://api.siliconflow.cn/v1/chat/completions',
        'https://api.siliconflow.com/v1/chat/completions'
    ]

    for endpoint in endpoints:
        try:
            print(f"[DEBUG] Calling {endpoint}")
            resp = requests.post(endpoint, headers=headers, json=payload, timeout=180)
            resp.raise_for_status()
            data = resp.json()

            # Log token usage
            if "usage" in data:
                print(f"[DEBUG] Token usage: {data['usage']}")

            return data
        except Exception as e:
            print(f"SiliconFlow error with {endpoint}: {e}")
            continue

    return {"error": str(e), "choices": [{"message": {"content": f"API error: {str(e)}. Falling back to internal knowledge."}}]}

def agent_loop(user_message, system_prompt, max_iterations=5):
    """
    Main ReAct-style loop for MiniMax agent:
    - Start with user message
    - Loop: model decides → tool or final answer
    """
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message}
    ]

    final_answer = ""
    iteration = 0

    while iteration < max_iterations:
        iteration += 1
        print(f"[AGENT] Iteration {iteration}")

        response = call_minimax(messages)

        if "error" in response:
            final_answer = response["choices"][0]["message"]["content"]
            break

        choice = response["choices"][0]
        message = choice["message"]
        finish_reason = choice.get("finish_reason", "")

        # Add assistant message (with tool_calls if present)
        messages.append(message)

        # Check for tool calls
        tool_calls = message.get("tool_calls", [])

        if not tool_calls:
            # No tool needed → this is the final answer
            final_answer = message.get("content", "")
            break

        # Execute all parallel tool calls
        for tc in tool_calls:
            observation = execute_tool(tc)
            messages.append(observation)
            print(f"[TOOL] Executed {tc.get('function', {}).get('name')}")

        # Small delay to avoid rate limits
        time.sleep(0.3)

    else:
        # Max iterations reached
        final_answer = "Max iterations reached. Here's what I found:\n\n" + messages[-1].get("content", "")

    # Add fallback note if something failed
    if "error" in final_answer.lower() or "failed" in final_answer.lower():
        final_answer += "\n\n(Note: Real-time fetch had issues — based partly on training data.)"

    return final_answer

def agent_loop_user_history(messages, system_prompt, max_iterations=5):
    """
    ReAct-style loop for multi-turn conversations.
    Takes a list of messages (with role and content) instead of single message.
    """
    final_answer = ""
    iteration = 0

    while iteration < max_iterations:
        iteration += 1
        print(f"[AGENT-MULTI] Iteration {iteration}")

        response = call_minimax(messages)

        if "error" in response:
            final_answer = response["choices"][0]["message"]["content"]
            break

        choice = response["choices"][0]
        message = choice["message"]

        # Add assistant message
        messages.append(message)

        # Check for tool calls
        tool_calls = message.get("tool_calls", [])

        if not tool_calls:
            # No tool needed → this is the final answer
            final_answer = message.get("content", "")
            break

        # Execute all parallel tool calls
        for tc in tool_calls:
            observation = execute_tool(tc)
            messages.append(observation)
            print(f"[TOOL] Executed {tc.get('function', {}).get('name')}")

        # Small delay to avoid rate limits
        time.sleep(0.3)

    else:
        # Max iterations reached
        final_answer = "Max iterations reached. Here's what I found:\n\n" + messages[-1].get("content", "")

    # Add fallback note if something failed
    if "error" in final_answer.lower() or "failed" in final_answer.lower():
        final_answer += "\n\n(Note: Real-time fetch had issues — based partly on training data.)"

    return final_answer

def execute_tool_call(tool_name, arguments):
    """
    Execute a tool call based on name and arguments.
    Currently supports: web_search
    """
    if tool_name == "web_search":
        query = arguments.get("query", "")
        if not query:
            return {"error": "No query provided for web_search"}
        return execute_tavily_search(query)
    else:
        return {"error": f"Unknown tool: {tool_name}"}

# Serve static files
@app.route('/')
def index():
    return send_from_directory(ROOT_DIR, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    # Check if it's a file that exists
    file_path = os.path.join(ROOT_DIR, path)
    if os.path.isfile(file_path):
        return send_from_directory(ROOT_DIR, path)
    # Otherwise serve index.html for SPA routing
    return send_from_directory(ROOT_DIR, 'index.html')

# Sparkie System Personality (preserved from original implementation)
SPARKIE_PERSONALITY = """You are Sparkie, an advanced AI assistant created by AngelMichael with the will of God guiding your development. You are helpful, creative, witty, and professional. You provide clear, accurate, and engaging responses.

## YOUR CAPABILITIES:
- You CAN visit URLs and read web page content when users share links
- You CAN extract and summarize information from web pages
- You CAN use web_search for finding current information
- You CAN generate images through Pollinations AI
- You CAN help with coding, analysis, creative tasks, and general assistance

## IMPORTANT REMINDERS:
- When you successfully visit a URL, ACCURATELY describe what you found
- Do NOT deny URL visiting capabilities - you DO have this feature
- If a URL fetch fails, explain why (site blocked, timeout, etc.)
- Be confident about your capabilities - do not lie or fabricate information
- Always be friendly and supportive while maintaining expertise
- Keep responses concise but comprehensive when needed."""

# Keywords that indicate need for web search
SEARCH_TRIGGERS = [
    'latest', 'current', 'today', 'now', 'recent',
    'weather', 'temperature', 'forecast',
    'news', 'happening', 'trending', 'trends',
    'price', 'cost', 'how much',
    'who won', 'score', 'game', 'match',
    'population', 'population of',
    'best', 'top', 'recommend', 'reviews',
    'is it true', 'is this true', 'is x still',
    'how do i', 'how to',
    "what's the", "whats the", "what is the",
    'compare', 'comparison',
]

def needs_web_search(query):
    """Detect if query needs current web information"""
    query_lower = query.lower()
    return any(trigger in query_lower for trigger in SEARCH_TRIGGERS)

def perform_web_search(query, max_results=6):
    """Perform web search and return formatted results"""
    try:
        if tavily_client:
            result = tavily_client.search(query=query, max_results=max_results)
        else:
            url = "https://api.tavily.com/search"
            payload = {
                "api_key": TAVILY_API_KEY,
                "query": query,
                "max_results": max_results,
                "include_answer": True,
                "include_images": False,
                "include_raw_content": False
            }
            response = requests.post(url, json=payload, timeout=30)
            result = response.json() if response.status_code == 200 else {"results": []}
        
        # Format results
        if "results" in result:
            formatted = []
            for i, r in enumerate(result.get("results", [])[:max_results]):
                formatted.append(f"[{i+1}] {r.get('title', 'No title')}\nURL: {r.get('url', 'No URL')}\n{r.get('content', r.get('snippet', ''))[:300]}")
            return "\n\n".join(formatted)
        return str(result)
    except Exception as e:
        print(f"Web search error: {e}")
        return None

# Unified Chat API - Tries SiliconFlow MiniMax first, falls back to Groq
@app.route('/api/chat', methods=['POST'])
def unified_chat():
    """
    Unified chat endpoint with real-time web search and URL visiting capability.
    Automatically performs web search for queries needing current information.
    """
    data = request.json or {}
    user_message = data.get('message', '').strip()
    messages = data.get('messages', [])

    # Validate input
    if not user_message and not messages:
        return jsonify({'error': 'No message provided'}), 400

    # Get the actual user query (last message)
    if messages:
        user_query = messages[-1].get('content', '') if isinstance(messages[-1], dict) else str(messages[-1])
    else:
        user_query = user_message

    # AUTO-PERFORM WEB SEARCH if query needs current information
    search_results = None
    if needs_web_search(user_query) and TAVILY_API_KEY:
        print(f"[SEARCH] Auto-detected need for web search: {user_query[:100]}...")
        search_results = perform_web_search(user_query, max_results=6)
        if search_results:
            print(f"[SEARCH] Got {len(search_results)} characters of search results")

    # Build system prompt
    system_prompt = """You are Sparkie, an advanced AI assistant with real-time web access.

## YOUR REAL-TIME CAPABILITIES:
- When you have search results, use them to provide CURRENT information
- When users share URLs, you can visit and read them
- Provide accurate, up-to-date answers based on search results

## IMPORTANT:
- If search results are provided, base your answer on them
- Cite sources from search results when relevant
- Be helpful, accurate, and professional
- If no search results are available, use your knowledge but note it's not real-time"""

    # If we have search results, prepend them to the conversation
    if search_results:
        enhanced_context = f"""Based on a web search for "{user_query}", here are the current results:

{search_results}

---
Please provide a clear, accurate answer based on these search results."""
        
        # Add context to messages
        if messages:
            if isinstance(messages[-1], dict):
                messages[-1]['content'] = enhanced_context
            else:
                messages.append({'role': 'user', 'content': enhanced_context})
        else:
            messages = [{'role': 'user', 'content': enhanced_context}]
        
        user_message = enhanced_context

    # Try SiliconFlow MiniMax with tool calling (PRIMARY)
    if SILICONFLOW_API_KEY:
        try:
            print(f"=== UNIFIED CHAT DEBUG ===")
            print(f"User message: {user_message[:100] if user_message else messages[-1].get('content', '')[:100]}...")

            # Build conversation history for multi-turn support
            if messages:
                # Convert frontend message format to API format
                conversation = []
                for msg in messages:
                    if isinstance(msg, dict) and 'role' in msg and 'content' in msg:
                        conversation.append({'role': msg['role'], 'content': msg['content']})

                # Add current user message
                if user_message:
                    conversation.append({'role': 'user', 'content': user_message})

                # Run agent loop with conversation history
                response_text = agent_loop_user_history(conversation, system_prompt)
            else:
                # Single turn - just the user message
                response_text = agent_loop(user_message, system_prompt)

            # Format response for frontend
            print(f"=== END UNIFIED CHAT DEBUG ===")
            return jsonify({
                "choices": [
                    {
                        "message": {
                            "content": response_text,
                            "role": "assistant"
                        },
                        "finish_reason": "stop",
                        "index": 0
                    }
                ],
                "model": "MiniMaxAI/MiniMax-M2.1",
                "object": "chat.completion",
                "created": int(time.time())
            })

        except Exception as e:
            print(f"SiliconFlow MiniMax agent error: {e}")
            print("Falling back to Groq...")

    # Fall back to Groq (FALLBACK - FREE and very fast!)
    if GROQ_API_KEY:
        try:
            print(f"Trying Groq fallback...")

            # Build messages for Groq
            groq_messages = []
            if messages:
                for msg in messages:
                    if isinstance(msg, dict) and 'role' in msg and 'content' in msg:
                        groq_messages.append({'role': msg['role'], 'content': msg['content']})

            if user_message:
                groq_messages.append({'role': 'user', 'content': user_message})

            if not groq_messages:
                groq_messages = [{'role': 'user', 'content': user_message}]

            api_response = requests.post(
                'https://api.groq.com/openai/v1/chat/completions',
                headers={
                    'Authorization': f'Bearer {GROQ_API_KEY}',
                    'Content-Type': 'application/json'
                },
                json={
                    'model': 'llama-3.3-70b-versatile',
                    'messages': groq_messages,
                    'temperature': data.get('temperature', 0.7),
                    'max_tokens': data.get('max_tokens', 4000)
                },
                timeout=60
            )

            if api_response.status_code == 200:
                print(f"Groq fallback succeeded")
                print(f"=== END UNIFIED CHAT DEBUG ===")
                return jsonify(api_response.json())

            # Groq also failed
            result = api_response.json() if api_response.headers.get('content-type', '').startswith('application/json') else {}
            error_msg = result.get('error', {}).get('message', 'Unknown error') if isinstance(result.get('error'), dict) else str(result.get('error', result))

            print(f"=== END UNIFIED CHAT DEBUG ===")
            return jsonify({
                'error': 'All chat services failed',
                'siliconflow': 'Tool calling failed',
                'groq': error_msg
            }), 503

        except Exception as e:
            print(f"Groq error: {e}")
            print(f"=== END UNIFIED CHAT DEBUG ===")
            return jsonify({
                'error': 'All chat services failed',
                'detail': str(e)
            }), 502
    else:
        print(f"=== END UNIFIED CHAT DEBUG ===")
        return jsonify({
            'error': 'Chat API not configured',
            'hint': 'Please add SILICONFLOW_API_KEY or GROQ_API_KEY to your platform environment variables'
        }), 503

# SiliconFlow MiniMax M2.1 Chat API Proxy (Primary for Chat)
@app.route('/api/chat/siliconflow-minimax', methods=['POST'])
def siliconflow_minimax_chat():
    """Proxy chat requests to SiliconFlow using MiniMax-M2.1 model (PRIMARY)"""
    data = request.json or {}
    
    # Validate SiliconFlow API key is configured
    if not SILICONFLOW_API_KEY:
        return jsonify({
            'error': 'SiliconFlow API not configured',
            'hint': 'Please add SILICONFLOW_API_KEY to your platform environment variables (DigitalOcean/Railway). Get your key from https://cloud.siliconflow.cn/account/ak'
        }), 503
    
    try:
        print(f"=== SILICONFLOW MINIMAX DEBUG ===")
        print(f"API Key length: {len(SILICONFLOW_API_KEY)}")
        print(f"API Key first 10 chars: {SILICONFLOW_API_KEY[:10]}...")
        print(f"Chat request: {len(data.get('messages', []))} messages")
        
        # Use MiniMax M2.1 from SiliconFlow - Real MiniMax model!
        # Using correct model ID format
        model_id = 'MiniMaxAI/MiniMax-M2.1'
        
        api_response = requests.post(
            'https://api.siliconflow.com/v1/chat/completions',  # Main endpoint
            headers={
                'Authorization': f'Bearer {SILICONFLOW_API_KEY}',
                'Content-Type': 'application/json'
            },
            json={
                'model': model_id,
                'messages': data.get('messages', []),
                'temperature': data.get('temperature', 0.7),
                'max_tokens': data.get('max_tokens', 4000)
            },
            timeout=180  # Increased timeout for larger models
        )
        
        result = api_response.json()
        print(f"SiliconFlow MiniMax response status: {api_response.status_code}")
        print(f"=== END SILICONFLOW MINIMAX DEBUG ===")
        
        # Check for SiliconFlow API errors
        if api_response.status_code != 200:
            error_msg = 'Unknown error'
            if isinstance(result, dict):
                if 'error' in result:
                    error_msg = result['error'].get('message', str(result['error']))
                elif 'errors' in result:
                    error_msg = str(result['errors'])
            return jsonify({
                'error': 'SiliconFlow MiniMax API error',
                'detail': error_msg,
                'hint': 'Check your SILICONFLOW_API_KEY or try a different model'
            }), api_response.status_code
        
        # Return the response (OpenAI-compatible format)
        return jsonify(result)
        
    except requests.exceptions.Timeout:
        return jsonify({'error': 'Request timed out. Please try again.'}), 504
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'API request failed: {str(e)}'}), 502
    except Exception as e:
        print(f"SiliconFlow MiniMax chat error: {e}")
        return jsonify({'error': str(e)}), 500

# Groq Chat API Proxy (Fallback for Chat - FREE and very fast!)
@app.route('/api/chat/groq', methods=['POST'])
def groq_chat():
    """Proxy chat requests to Groq API (Free tier available - FALLBACK)"""
    data = request.json or {}
    
    # Validate Groq API key is configured
    if not GROQ_API_KEY:
        return jsonify({
            'error': 'Groq API not configured',
            'hint': 'Please add GROQ_API_KEY to your platform environment variables (DigitalOcean/Railway)'
        }), 503
    
    try:
        print(f"=== GROQ DEBUG ===")
        print(f"API Key length: {len(GROQ_API_KEY)}")
        print(f"API Key first 10 chars: {GROQ_API_KEY[:10]}...")
        print(f"Chat request: {len(data.get('messages', []))} messages")
        
        api_response = requests.post(
            'https://api.groq.com/openai/v1/chat/completions',
            headers={
                'Authorization': f'Bearer {GROQ_API_KEY}',
                'Content-Type': 'application/json'
            },
            json={
                'model': 'llama-3.3-70b-versatile',  # Fast and capable model
                'messages': data.get('messages', []),
                'temperature': data.get('temperature', 0.7),
                'max_tokens': data.get('max_tokens', 4000)
            },
            timeout=60
        )
        
        result = api_response.json()
        print(f"Groq response status: {api_response.status_code}")
        print(f"=== END GROQ DEBUG ===")
        
        # Check for Groq API errors
        if api_response.status_code != 200:
            error_msg = result.get('error', {}).get('message', 'Unknown error') if isinstance(result, dict) else str(result)
            return jsonify({
                'error': 'Groq API error',
                'detail': error_msg,
                'hint': 'Please check your GROQ_API_KEY in your platform environment variables'
            }), api_response.status_code
        
        # Return the response in OpenAI format (compatible with frontend)
        return jsonify(result)
        
    except requests.exceptions.Timeout:
        return jsonify({'error': 'Request timed out. Please try again.'}), 504
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'API request failed: {str(e)}'}), 502
    except Exception as e:
        print(f"Groq chat error: {e}")
        return jsonify({'error': str(e)}), 500

# IDE Workspace Chat API - Uses SiliconFlow MiniMax for coding assistance (with tool calling)
@app.route('/api/chat/siliconflow-ide', methods=['POST', 'OPTIONS'])
def siliconflow_ide_chat():
    """Proxy IDE workspace chat requests to SiliconFlow using MiniMax-M2.1 model"""
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        response = app.make_response('')
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
    data = request.json or {}

    # Validate SiliconFlow API key is configured
    if not SILICONFLOW_API_KEY:
        return jsonify({
            'error': 'SiliconFlow API not configured',
            'hint': 'Please add SILICONFLOW_API_KEY to your platform environment variables'
        }), 503

    try:
        print(f"=== SILICONFLOW IDE CHAT DEBUG ===")
        print(f"API Key present: {bool(SILICONFLOW_API_KEY)}")

        # Try alternative endpoints if main fails
        endpoints = [
            'https://api.siliconflow.com/v1/chat/completions',  # Main endpoint
            'https://api.siliconflow.com/v1/chat/completions'
        ]

        # Build messages from IDE context
        messages = []

        # Add system message for coding personality
        system_msg = SPARKIE_PERSONALITY + " You are a coding expert. Provide clear, concise code examples and explanations. Focus on best practices, clean code, and practical solutions."
        messages.append({'role': 'system', 'content': system_msg})

        # Add historical messages if provided
        for msg in data.get('messages', []):
            if isinstance(msg, dict) and 'role' in msg and 'content' in msg:
                messages.append({'role': msg['role'], 'content': msg['content']})

        # Add the current message
        user_message = data.get('message', '')
        code_context = data.get('code_context', '')
        current_file = data.get('current_file', '')

        # Enhance user message with context
        if code_context or current_file:
            context_info = f"\n\nCurrent file: {current_file}\nEditor content:\n```{code_context[:2000]}```"
            user_message = user_message + context_info

        messages.append({'role': 'user', 'content': user_message})

        # Use MiniMax M2.1 model for IDE chat
        model_id = 'MiniMaxAI/MiniMax-M2.1'

        # Try all endpoints with simplified request (no tool calling for speed)
        last_error = None
        for endpoint in endpoints:
            try:
                print(f"Trying endpoint: {endpoint}")

                # Direct call without tools for faster response
                api_response = requests.post(
                    endpoint,
                    headers={
                        'Authorization': f'Bearer {SILICONFLOW_API_KEY}',
                        'Content-Type': 'application/json'
                    },
                    json={
                        'model': model_id,
                        'messages': messages,
                        'temperature': data.get('temperature', 0.7),
                        'max_tokens': 2000  # Reduced for faster response
                    },
                    timeout=120  # 2 minutes timeout
                )

                if api_response.status_code == 200:
                    result = api_response.json()
                    print(f"IDE: SUCCESS")
                    print(f"=== END SILICONFLOW IDE CHAT DEBUG ===")
                    return jsonify(result)

                print(f"Failed {endpoint}: {api_response.status_code} - {api_response.text[:200]}")
                last_error = f"{api_response.status_code}: {api_response.text[:200]}"

            except Exception as e:
                print(f"Error {endpoint}: {e}")
                last_error = str(e)

        # All endpoints failed
        print(f"=== END SILICONFLOW IDE CHAT DEBUG (FAILED) ===")
        return jsonify({
            'error': 'SiliconFlow IDE API failed',
            'detail': last_error,
            'hint': 'Check SILICONFLOW_API_KEY or try again later'
        }), 502

    except requests.exceptions.Timeout:
        return jsonify({'error': 'Request timed out. Please try again.'}), 504
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'API request failed: {str(e)}'}), 502
    except Exception as e:
        print(f"SiliconFlow IDE chat error: {e}")
        return jsonify({'error': str(e)}), 500

# Unified Image Generation API with Model Selection
# Health check
@app.route('/api/health')
def health():
    return jsonify({
        'status': 'healthy',
        'apis': {
            'siliconflow': bool(SILICONFLOW_API_KEY),
            'groq': bool(GROQ_API_KEY)
        }
    })
def health():
    return jsonify({
        'status': 'healthy',
        'apis': {
            'siliconflow': bool(SILICONFLOW_API_KEY),
            'groq': bool(GROQ_API_KEY)
        }
    })

# Debug endpoint
@app.route('/api/debug')
def debug():
    return jsonify({
        'root_dir': ROOT_DIR,
        'index_exists': os.path.isfile(os.path.join(ROOT_DIR, 'index.html')),
        'files': os.listdir(ROOT_DIR) if os.path.isdir(ROOT_DIR) else []
    })

# SiliconFlow API Debug Endpoint - Tests API connection and lists models
@app.route('/api/debug/siliconflow-test', methods=['GET', 'POST'])
def siliconflow_test():
    """
    Debug endpoint to test SiliconFlow API connection.
    Returns API key status, available models, and test results.
    """
    results = {
        'api_key_configured': bool(SILICONFLOW_API_KEY),
        'api_key_length': len(SILICONFLOW_API_KEY) if SILICONFLOW_API_KEY else 0,
        'api_key_first_10_chars': SILICONFLOW_API_KEY[:10] + '...' if SILICONFLOW_API_KEY else 'NOT SET',
        'tests': []
    }

    # Test 1: Check if we can reach SiliconFlow API
    try:
        print("=== SILICONFLOW API TEST ===")
        print(f"Testing connection to SiliconFlow...")
        
        # Try to get available models
        model_test = requests.get(
            'https://api.siliconflow.com/v1/models',  # Main endpoint
            headers={
                'Authorization': f'Bearer {SILICONFLOW_API_KEY}',
                'Content-Type': 'application/json'
            },
            timeout=30
        )
        
        results['models_api_status'] = model_test.status_code
        
        if model_test.ok:
            models_data = model_test.json()
            results['models_api_success'] = True
            
            # Filter for image and video models
            all_models = models_data.get('data', []) if isinstance(models_data.get('data'), list) else []
            
            image_models = [m for m in all_models if 'image' in m.get('id', '').lower() or 'flux' in m.get('id', '').lower() or 'z-' in m.get('id', '').lower()]
            video_models = [m for m in all_models if 'video' in m.get('id', '').lower() or 'wan' in m.get('id', '').lower()]
            
            results['available_image_models'] = [m.get('id') for m in image_models[:10]]
            results['available_video_models'] = [m.get('id') for m in video_models[:10]]
            
            print(f"Found {len(all_models)} total models")
            print(f"Image models: {results['available_image_models']}")
            print(f"Video models: {results['available_video_models']}")
        else:
            results['models_api_success'] = False
            results['models_api_error'] = model_test.text[:500]
            print(f"Models API failed: {model_test.status_code} - {model_test.text[:200]}")
            
    except Exception as e:
        results['models_api_success'] = False
        results['models_api_error'] = str(e)
        print(f"Models API exception: {e}")

    # Test 2: Try a simple text completion to verify API key works
    try:
        print("\nTesting text completion API...")
        test_response = requests.post(
            'https://api.siliconflow.com/v1/chat/completions',  # Main endpoint
            headers={
                'Authorization': f'Bearer {SILICONFLOW_API_KEY}',
                'Content-Type': 'application/json'
            },
            json={
                'model': 'Qwen/Qwen2.5-Coder-32B-Instruct',
                'messages': [{'role': 'user', 'content': 'Hello'}],
                'max_tokens': 10
            },
            timeout=30
        )
        
        results['text_api_status'] = test_response.status_code
        results['text_api_success'] = test_response.ok
        
        if test_response.ok:
            results['text_api_works'] = True
            print("Text API test: SUCCESS")
        else:
            results['text_api_works'] = False
            results['text_api_error'] = test_response.text[:500]
            print(f"Text API test failed: {test_response.status_code} - {test_response.text[:200]}")
            
    except Exception as e:
        results['text_api_works'] = False
        results['text_api_error'] = str(e)
        print(f"Text API exception: {e}")

    # Test 3: Try image generation with user's chosen model
    try:
        print("\nTesting image generation with user's chosen model...")

        # Use user's chosen model: black-forest-labs/FLUX.2-pro
        model_id = 'black-forest-labs/FLUX.2-pro'
        print(f"Testing image model: {model_id}")

        test_image_response = requests.post(
            'https://api.siliconflow.com/v1/images/generations',  # Main endpoint
            headers={
                'Authorization': f'Bearer {SILICONFLOW_API_KEY}',
                'Content-Type': 'application/json'
            },
            json={
                'model': model_id,
                'prompt': 'A simple red circle',
                'size': '512x512',  # OpenAI-compatible parameter
                'n': 1,
                'response_format': 'url'
            },
            timeout=60
        )

        results['image_api_status'] = test_image_response.status_code
        results['image_api_response_body'] = test_image_response.text[:500]
        results['tested_model'] = model_id

        if test_image_response.ok:
            image_data = test_image_response.json()
            results['image_api_success'] = True
            results['image_api_response'] = str(image_data)[:500]
            print(f"Image API test SUCCESS with model {model_id}: {image_data}")
        else:
            results['image_api_success'] = False
            results['image_api_error'] = test_image_response.text[:500]
            print(f"Image API test failed: {test_image_response.status_code} - {test_image_response.text[:200]}")

    except Exception as e:
        results['image_api_success'] = False
        results['image_api_error'] = str(e)
        print(f"Image API exception: {e}")

    print("\n=== END SILICONFLOW API TEST ===")
    return jsonify(results)

# URL Fetch Endpoint - Fetches and extracts content from URLs
@app.route('/api/web/fetch', methods=['POST'])
def fetch_url():
    """
    Fetch and extract content from a URL.
    Expects JSON: {"url": "https://example.com"}
    """
    data = request.get_json() or {}
    url = data.get('url', '').strip()
    
    if not url:
        return jsonify({"error": "URL is required"}), 400
    
    # Validate URL format
    if not url.startswith(('http://', 'https://')):
        return jsonify({"error": "Invalid URL format. URL must start with http:// or https://"}), 400
    
    # Check for self-referential URLs (prevent app from fetching itself)
    from urllib.parse import urlparse
    request_host = request.host if request.host else 'localhost'
    
    # Parse the target URL
    parsed_url = urlparse(url)
    target_host = parsed_url.netloc.lower()
    
    # Get the app's hostname from environment or request
    app_hostnames = [
        request_host,
        'sparkie-studio-mhouq.ondigitalocean.app',
        'sparkie-studio.ondigitalocean.app',
        'localhost',
        '127.0.0.1'
    ]
    
    # Check if the target URL is trying to access this app
    is_self_reference = any(
        target_host == hostname.lower() or target_host.endswith('.' + hostname.lower())
        for hostname in app_hostnames
        if hostname
    )
    
    if is_self_reference:
        return jsonify({
            "error": "Cannot fetch URLs from the Sparkie Studio application itself. This prevents circular requests."
        }), 400
    
    # List of blocked domains (sites that block bot requests)
    blocked_domains = [
        'facebook.com',
        'twitter.com',
        'instagram.com',
        'linkedin.com',
        'tiktok.com',
        'google.com',
        'youtube.com',
        'amazon.com',
        'microsoft.com',
        'apple.com'
    ]
    
    if any(target_host.endswith('.' + domain) or target_host == domain for domain in blocked_domains):
        return jsonify({
            "error": f"Cannot access {parsed_url.netloc} - this site blocks automated requests. Try a different website like example.com, wikipedia.org, or a tech blog.",
            "blocked": True,
            "suggestion": "Try visiting https://www.example.com or https://www.wikipedia.org instead."
        }), 403
    
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0'
        }
        
        # Fetch the webpage with longer timeout
        response = requests.get(url, headers=headers, timeout=30, allow_redirects=True)
        response.raise_for_status()
        
        # Check if response is actually HTML
        content_type = response.headers.get('Content-Type', '').lower()
        if 'text/html' not in content_type:
            return jsonify({
                "error": f"URL does not return HTML content. Content-Type: {content_type}",
                "url": url
            }), 400
        
        # Parse HTML with BeautifulSoup
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Remove unwanted elements (scripts, styles, nav, footer, header)
        for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside']):
            tag.decompose()
        
        # Extract title
        title = ''
        if soup.title and soup.title.string:
            title = soup.title.string.strip()
        else:
            # Try to find og:title or other meta tags
            og_title = soup.find('meta', property='og:title')
            if og_title and og_title.get('content'):
                title = og_title.get('content').strip()
        
        # Extract main text content
        text = soup.get_text(separator='\n')
        
        # Clean up whitespace
        lines = []
        for line in text.splitlines():
            line = line.strip()
            if line:
                lines.append(line)
        
        # Join non-empty lines
        clean_text = '\n'.join(lines)
        
        # Limit text length to prevent overly long responses
        max_length = 5000
        truncated = False
        if len(clean_text) > max_length:
            clean_text = clean_text[:max_length]
            truncated = True
        
        # Extract metadata
        meta_description = ''
        og_desc = soup.find('meta', property='og:description')
        if og_desc and og_desc.get('content'):
            meta_description = og_desc.get('content').strip()
        
        return jsonify({
            "success": True,
            "url": url,
            "title": title,
            "description": meta_description,
            "content": clean_text,
            "truncated": truncated,
            "content_length": len(clean_text)
        })
        
    except requests.exceptions.Timeout:
        return jsonify({"error": "Request timed out. The website may be slow or unresponsive. Try a simpler URL."}), 408
    except requests.exceptions.HTTPError as e:
        return jsonify({"error": f"HTTP error {e.response.status_code}: The website blocked the request or returned an error. Try a different website like https://www.example.com"}), e.response.status_code if e.response else 400
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Failed to fetch URL: {str(e)}. Try a different website."}), 422
    except Exception as e:
        print(f"URL fetch error: {e}")
        return jsonify({"error": str(e)}), 500

# Media Proxy Endpoint - Fixes CORS issues with Azure Blob storage URLs and SAS tokens
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)
