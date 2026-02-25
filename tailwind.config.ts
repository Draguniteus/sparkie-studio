import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Queen Bee Theme — dark mode defaults (hardcoded for Tailwind JIT compatibility)
        // Light mode overrides applied via [data-theme="light"] in globals.css
        honey: {
          50:  '#FFF9E6',
          100: '#FFF0BF',
          200: '#FFE699',
          300: '#FFDB66',
          400: '#FFD140',
          500: '#FFC30B', // Primary Gold (dark mode) — overridden in light
          600: '#E5A800',
          700: '#B38300',
          800: '#805E00',
          900: '#4D3800',
        },
        hive: {
          50:  '#F5F5F5',
          100: '#3A3A3A',
          200: '#333333',
          300: '#2D2D2D',
          400: '#252525',
          500: '#1F1F1F',
          600: '#1A1A1A', // Primary Background (dark)
          700: '#151515', // Sidebar (dark)
          800: '#111111',
          900: '#0A0A0A',
        },
        'hive-border': '#333333',
        'hive-hover':  '#3A3A3A',
        'text-primary':   '#F5F5F5',
        'text-secondary': '#A0A0A0',
        'text-muted':     '#666666',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-gold': 'pulseGold 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        pulseGold: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255, 195, 11, 0.4)' },
          '50%':      { boxShadow: '0 0 0 8px rgba(255, 195, 11, 0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}

export default config
