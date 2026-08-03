import { SvelteSet } from 'svelte/reactivity'

function fetchAsSet(key: string): SvelteSet<string> {
  const json = localStorage.getItem(key)
  if (json !== null) {
    try {
      const array = JSON.parse(json) as string[]
      return new SvelteSet(array)
    } catch {
      console.error(`Parsing ${key} failed`)
    }
  }

  return new SvelteSet()
}

export function fetchAsDate(key: string): Date | null {
  const value = localStorage.getItem(key)
  if (value === null) return null
  return new Date(value)
}

function fetchAsBool(key: string): boolean {
  return localStorage.getItem(key) === 'true'
}

// A stored choice wins; the OS preference is only the default. ORing the two
// made dark mode impossible to switch off on a dark-themed system.
function initialDarkMode(): boolean {
  const stored = localStorage.getItem('darkMode')
  if (stored !== null) return stored === 'true'
  return globalThis.matchMedia('(prefers-color-scheme: dark)').matches
}

const darkMode = initialDarkMode()

// Drives light-dark() in CSS; applied immediately to avoid a theme flash.
export function applyColorScheme(dark: boolean): void {
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

applyColorScheme(darkMode)

export const settings: {
  darkMode: boolean
  disableCache: boolean
  expandDescriptions: boolean
  githubToken: string | null
  hidePrereleases: boolean
  hidePreviouslySeen: boolean
  ignoredPrereleases: Set<string>
  ignoredRepos: Set<string>
  lastAccessedAt: Date
  showIgnoredPrereleases: boolean
  showIgnoredRepos: boolean
  showLanguages: boolean
} = $state({
  darkMode,
  disableCache: fetchAsBool('disableCache'),
  expandDescriptions: fetchAsBool('expandDescriptions'),
  githubToken: localStorage.getItem('githubToken'),
  hidePrereleases: fetchAsBool('hidePrereleases'),
  hidePreviouslySeen: fetchAsBool('hidePreviouslySeen'),
  ignoredPrereleases: fetchAsSet('ignoredPrereleases'),
  ignoredRepos: fetchAsSet('ignoredRepos'),
  lastAccessedAt: fetchAsDate('lastAccessedAt') ?? new Date(0),
  showIgnoredPrereleases: fetchAsBool('showIgnoredPrereleases'),
  showIgnoredRepos: fetchAsBool('showIgnoredRepos'),
  showLanguages: fetchAsBool('showLanguages'),
})

// One key per setting, plus the loader's eviction timestamp.
type StorageKey = keyof typeof settings | 'lastEvictedAt'

type StorageValue = boolean | Date | Set<string> | string

function stringify(value: StorageValue): string {
  if (value instanceof Set) return JSON.stringify([...value])
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

// The only writer for persisted state; stringify handles Sets mutated in place.
export function persist(key: StorageKey, value: StorageValue): void {
  localStorage.setItem(key, stringify(value))
}

// Drop one key, restoring its default on the next load.
export function forget(key: StorageKey): void {
  localStorage.removeItem(key)
}
