import { SvelteDate, SvelteSet } from 'svelte/reactivity'

import type { ReleaseObj } from './github'

const darkModePreferred = globalThis.matchMedia(
  '(prefers-color-scheme: dark)',
).matches

const darkModeRaw = localStorage.getItem('darkMode')
const darkMode = darkModePreferred || darkModeRaw === 'true'

const expandDescriptions = localStorage.getItem('expandDescriptions') === 'true'
const hidePrereleases = localStorage.getItem('hidePrereleases') === 'true'
const hidePreviouslySeen = localStorage.getItem('hidePreviouslySeen') === 'true'
const showIgnoredRepos = localStorage.getItem('showIgnoredRepos') === 'true'
const showIgnoredPrereleases =
  localStorage.getItem('showIgnoredPrereleases') === 'true'
const showLanguages = localStorage.getItem('showLanguages') === 'true'

let ignoredRepos = new SvelteSet<string>()
const ignoredReposRaw = localStorage.getItem('ignoredRepos')
if (ignoredReposRaw !== null) {
  try {
    const ignoredReposArray = JSON.parse(ignoredReposRaw) as string[]
    ignoredRepos = new SvelteSet(ignoredReposArray)
  } catch {
    console.error('Parsing ignoredRepos failed')
  }
}

let ignoredPrereleases = new SvelteSet<string>()
const ignoredPrereleasesRaw = localStorage.getItem('ignoredPrereleases')
if (ignoredPrereleasesRaw !== null) {
  try {
    const ignoredPrereleasesArray = JSON.parse(
      ignoredPrereleasesRaw,
    ) as string[]
    ignoredPrereleases = new SvelteSet(ignoredPrereleasesArray)
  } catch {
    console.error('Parsing ignoredPrereleases failed')
  }
}

export const settings: {
  darkMode: boolean
  expandDescriptions: boolean
  hidePrereleases: boolean
  hidePreviouslySeen: boolean
  ignoredPrereleases: Set<string>
  ignoredRepos: Set<string>
  showIgnoredPrereleases: boolean
  showIgnoredRepos: boolean
  showLanguages: boolean
} = $state({
  darkMode,
  expandDescriptions,
  hidePrereleases,
  hidePreviouslySeen,
  ignoredPrereleases,
  ignoredRepos,
  showIgnoredPrereleases,
  showIgnoredRepos,
  showLanguages,
})

export const appState: {
  firstReleaseBeforeLastSeen?: ReleaseObj | undefined
} = $state({})

const lastSeenPublishedAtString = localStorage.getItem('lastSeenPublishedAt')
export const lastSeenPublishedAt: Date =
  lastSeenPublishedAtString === null
    ? new SvelteDate(0) // 1970-01-01
    : new SvelteDate(lastSeenPublishedAtString)
