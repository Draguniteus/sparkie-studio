'use client'

export type Theme = 'dark' | 'light'

export function applyTheme(t: Theme) {
  const root = document.documentElement
  // Set data-theme attribute — drives [data-theme="light"] CSS overrides in globals.css
  root.setAttribute('data-theme', t)
  // Also update CSS vars for components that use var() directly (e.g. SettingsModal ThemeTokens)
  if (t === 'light') {
    root.style.setProperty('--honey-primary', '#0A0A0A')
    root.style.setProperty('--honey-dark',    '#1A1A1A')
    root.style.setProperty('--hive-bg',       '#F5C842')
    root.style.setProperty('--hive-surface',  '#E5A800')
    root.style.setProperty('--hive-elevated', '#FFD166')
    root.style.setProperty('--hive-border',   '#B38300')
    root.style.setProperty('--hive-hover',    '#FFD700')
    root.style.setProperty('--text-primary',  '#0A0A0A')
    root.style.setProperty('--text-secondary','#1A1A1A')
    root.style.setProperty('--text-muted',    '#3D3000')
    root.style.setProperty('--honey-glow',         'rgba(0,0,0,0.10)')
    root.style.setProperty('--honey-glow-strong',  'rgba(0,0,0,0.22)')
  } else {
    root.removeAttribute('data-theme')  // dark is default, no attribute needed
    root.style.setProperty('--honey-primary', '#FFC30B')
    root.style.setProperty('--honey-dark',    '#E5A800')
    root.style.setProperty('--hive-bg',       '#1A1A1A')
    root.style.setProperty('--hive-surface',  '#252525')
    root.style.setProperty('--hive-elevated', '#2D2D2D')
    root.style.setProperty('--hive-border',   '#333333')
    root.style.setProperty('--hive-hover',    '#3A3A3A')
    root.style.setProperty('--text-primary',  '#F5F5F5')
    root.style.setProperty('--text-secondary','#A0A0A0')
    root.style.setProperty('--text-muted',    '#666666')
    root.style.setProperty('--honey-glow',         'rgba(255,195,11,0.15)')
    root.style.setProperty('--honey-glow-strong',  'rgba(255,195,11,0.3)')
  }
}

export function loadTheme(): Theme {
  try {
    const raw = localStorage.getItem('sparkie_prefs')
    if (raw) {
      const prefs = JSON.parse(raw)
      if (prefs.theme === 'light' || prefs.theme === 'dark') return prefs.theme
    }
  } catch {}
  return 'dark'
}
