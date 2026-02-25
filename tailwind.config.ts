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
        // Queen Bee Theme
        // hive + text + honey wired to CSS vars so applyTheme() affects Tailwind classes instantly
        honey: {
          50:  '#FFF9E6',
          100: '#FFF0BF',
          200: '#FFE699',
          300: '#FFDB66',
          400: '#FFD140',
          500: 'var(--honey-primary)',
          600: 'var(--honey-dark)',
          700: '#B38300',
          800: '#805E00',
          900: '#4D3800',
        },
        hive: {
          50:  '#F5F5F5',
          100: 'var(--hive-hover)',
          200: 'var(--hive-border)',
          300: 'var(--hive-elevated)',
          400: 'var(--hive-surface)',
          500: 'var(--hive-elevated)',
          600: 'var(--hive-bg)',
          700: 'var(--hive-surface)',
          800: '#111111',
          900: '#0A0A0A',
        },
        'hive-border': 'var(--hive-border)',
        'hive-hover':  'var(--hive-hover)',
        'text-primary':   'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted':     'var(--text-muted)',
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
