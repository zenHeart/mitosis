import { ref, watch } from 'vue'

export type ThemeMode = 'dark' | 'light'

const THEME_KEY = 'mitosis-theme'
const currentTheme = ref<ThemeMode>('dark')

export function useDarkMode() {
  function getSystemPreference(): ThemeMode {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    }
    return 'dark'
  }

  function loadSavedTheme(): ThemeMode {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(THEME_KEY) as ThemeMode | null
      if (saved === 'dark' || saved === 'light') {
        return saved
      }
    }
    return getSystemPreference()
  }

  function applyTheme(theme: ThemeMode) {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme)
      document.body.setAttribute('data-theme', theme)
    }
  }

  function toggle() {
    currentTheme.value = currentTheme.value === 'dark' ? 'light' : 'dark'
  }

  function init() {
    currentTheme.value = loadSavedTheme()
    applyTheme(currentTheme.value)

    if (typeof window !== 'undefined' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem(THEME_KEY)) {
          currentTheme.value = e.matches ? 'dark' : 'light'
          applyTheme(currentTheme.value)
        }
      })
    }
  }

  watch(currentTheme, (newTheme) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(THEME_KEY, newTheme)
    }
    applyTheme(newTheme)
  })

  return {
    theme: currentTheme,
    toggle,
    init,
    isDark: () => currentTheme.value === 'dark',
    isLight: () => currentTheme.value === 'light',
  }
}
