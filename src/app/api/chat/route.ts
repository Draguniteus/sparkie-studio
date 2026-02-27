import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { extractAndSaveMemories } from '@/lib/memory'
import { getUserAwareness, loadMemories } from '@/lib/systemprompt'
import ComposioClient from '@composio/core'

export const runtime = 'nodejs'
export const maxDuration = 60

const BASE_URL = process.env.OPENKEYAPI_BASE_URL || 'https://opencode.ai/zen/v1'
const API_KEY = process.env.OPENCODE_API_KEY || ''

const MODELS_EXCLUDED: Record<string, string[]> = {
  function_calling: ['glm-5-free'],
}

clprocess.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

// === Tool Definitions ===
const BUILT_IN_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get current weather for a city. Use for morning briefs, when user asks about weather, or to add context to conversations.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name, e.g. "New York"' },
          lat: { type: 'number', description: 'Latitude (optional)' },
          lon: { type: 'number', description: 'Longitude (optional)' },
        },
        required: ['city'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the web for current information — news, events, prices, people, anything real-time.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_github',
      description: 'Read files or get info from a GitHub repository.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository in format "owner/repo"' },
          path: { type: 'string', description: 'File path within the repo. Leave empty for repo overview.' },
        },
        required: ['repo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_radio_playlist',
      description: 'Get the current Sparkie Radio playlist.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_music',
      description: `Generate an original music track and embed it in chat. Use proactively to brighten someone's day, celebrate a moment, or set a mood. Returns an audio URL to display.`,
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Music style and feel, e.g. "uplifting lo-fi hip hop with warm piano"' },
          title: { type: 'string', description: 'Track title' },
        },
        required: ['prompt', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: 'Generate an image and display it directly in chat. Use proactively to motivate, inspire, illustrate, or surprise the user. Returns an image URL to display.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Detailed image description. Be specific and vivid for best results.' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_video',
      description: 'Generate a short video clip and display it in chat. Use for special moments that deserve motion. Returns a video URL to display.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Video description — what should happen, style, mood.' },
          duration: { type: 'number', enum: [6, 10], description: 'Duration in seconds: 6 or 10.' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'Get the current date and time.',
      parameters: {
        type: 'object',
        properties: {
          timezone: { type: 'string', description: 'Timezone name, e.g. "America/New_York".' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_memory',
      description: 'Save something important the user told you. Use proactively when the user shares something meaningful.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['personal', 'preference', 'work', 'goal', 'other'],
            description: 'Memory category',
          },
          content: { type: 'string', description: 'The fact or memory to save.' },
        },
        required: ['category', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_twitter',
      description: 'Search recent tweets and trending topics. Use to get current takes, trending news, or what people are saying on Twitter/X.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query, e.g. "AI news" or "#SparkieStudio"' },
          max_results: { type: 'number', description: 'Max number of results (1-10). Default 5.' },
        },
        required: ['query'],
      },
      },
  },
  {
    type: 'function',
    function: {
      name: 'search_reddit',
      description: 'Search Reddit posts and discussions. Great for community opinions, niche topics, and what people are actually thinking.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          subreddit: { type: 'string', description: 'Specific subreddit to search (optional), e.g. "programming"' },
        },
        required: ['query'],
      },
    },
  },
]
