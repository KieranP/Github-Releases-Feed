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

function fetchAsDate(key: string): Date | null {
  const value = localStorage.getItem(key)
  if (value === null) return null
  return new Date(value)
}

function fetchAsBool(key: string): boolean {
  return localStorage.getItem(key) === 'true'
}

const darkModePreferred = globalThis.matchMedia(
  '(prefers-color-scheme: dark)',
).matches
const darkModeRaw = fetchAsBool('darkMode')
const darkMode = darkModePreferred || darkModeRaw

export const settings: {
  darkMode: boolean
  expandDescriptions: boolean
  githubToken: string | null
  hidePrereleases: boolean
  hidePreviouslySeen: boolean
  ignoredPrereleases: Set<string>
  ignoredRepos: Set<string>
  showIgnoredPrereleases: boolean
  showIgnoredRepos: boolean
  showLanguages: boolean
} = $state({
  darkMode,
  expandDescriptions: fetchAsBool('expandDescriptions'),
  githubToken: localStorage.getItem('githubToken'),
  hidePrereleases: fetchAsBool('hidePrereleases'),
  hidePreviouslySeen: fetchAsBool('hidePreviouslySeen'),
  ignoredPrereleases: fetchAsSet('ignoredPrereleases'),
  ignoredRepos: fetchAsSet('ignoredRepos'),
  showIgnoredPrereleases: fetchAsBool('showIgnoredPrereleases'),
  showIgnoredRepos: fetchAsBool('showIgnoredRepos'),
  showLanguages: fetchAsBool('showLanguages'),
})

export const lastAccessedAt: Date = fetchAsDate('lastAccessedAt') ?? new Date(0)
