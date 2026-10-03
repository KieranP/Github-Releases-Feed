import { afterEach, describe, expect, it } from 'vitest'

import {
  applyColorScheme,
  initialTheme,
  nextTheme,
  themeLabel,
} from '../src/theme'

describe('initialTheme', () => {
  afterEach((): void => {
    localStorage.removeItem('theme')
  })

  it('defaults to auto', () => {
    expect(initialTheme()).toBe('auto')
  })

  it.each(['auto', 'light', 'dark'])('reads a stored %s', (theme) => {
    localStorage.setItem('theme', theme)

    expect(initialTheme()).toBe(theme)
  })

  it('falls back to auto for a corrupt value', () => {
    localStorage.setItem('theme', 'sepia')

    expect(initialTheme()).toBe('auto')
  })
})

describe('nextTheme', () => {
  it.each([
    ['auto', 'light'],
    ['light', 'dark'],
    ['dark', 'auto'],
  ] as const)('steps from %s to %s', (from, to) => {
    expect(nextTheme(from)).toBe(to)
  })
})

describe('themeLabel', () => {
  it('names the current theme and the next', () => {
    expect(themeLabel('dark')).toBe('Theme: Dark (switch to Auto)')
  })
})

describe('applyColorScheme', () => {
  it.each(['light', 'dark'] as const)('pins %s', (theme) => {
    applyColorScheme(theme)

    expect(document.documentElement.style.colorScheme).toBe(theme)
  })

  it('clears the pin on auto so the stylesheet follows the OS', () => {
    applyColorScheme('dark')
    applyColorScheme('auto')

    expect(document.documentElement.style.colorScheme).toBe('')
  })
})
