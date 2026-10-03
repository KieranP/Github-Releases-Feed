import { SvelteSet } from 'svelte/reactivity'

import { applyColorScheme, initialTheme, type Theme } from './theme'

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

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function fetchAsBool(key: string): boolean {
  return localStorage.getItem(key) === 'true'
}

export const settings: {
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
  theme: Theme
} = $state({
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
  theme: initialTheme(),
})

// Applied at module load, before the first paint, to avoid a theme flash.
applyColorScheme(settings.theme)

// Keeps only the token's prefix, so a pasted dump can't leak a usable one.
export function dumpSettings(): object {
  return {
    ...settings,
    githubToken: settings.githubToken?.slice(0, 11),
  }
}

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
