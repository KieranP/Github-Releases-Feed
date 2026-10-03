import themeAutoSvg from './assets/theme-auto.svg?raw'
import themeDarkSvg from './assets/theme-dark.svg?raw'
import themeLightSvg from './assets/theme-light.svg?raw'

export type Theme = 'auto' | 'light' | 'dark'

const THEMES: readonly Theme[] = ['auto', 'light', 'dark']

const THEME_NAMES: Record<Theme, string> = {
  auto: 'Auto',
  light: 'Light',
  dark: 'Dark',
}

export const THEME_ICONS: Record<Theme, string> = {
  auto: themeAutoSvg,
  light: themeLightSvg,
  dark: themeDarkSvg,
}

function isTheme(value: string | null): value is Theme {
  return THEMES.includes(value as Theme)
}

export function initialTheme(): Theme {
  const stored = localStorage.getItem('theme')
  return isTheme(stored) ? stored : 'auto'
}

export function nextTheme(theme: Theme): Theme {
  return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length] ?? 'auto'
}

export function themeLabel(theme: Theme): string {
  return `Theme: ${THEME_NAMES[theme]} (switch to ${THEME_NAMES[nextTheme(theme)]})`
}

// Drives light-dark() in CSS. Auto drops the pin so the stylesheet's
// `light dark` tracks the OS live.
export function applyColorScheme(theme: Theme): void {
  document.documentElement.style.colorScheme = theme === 'auto' ? '' : theme
}
