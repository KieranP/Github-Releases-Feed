import { SvelteSet } from 'svelte/reactivity'

import type { ReleaseObj } from './github'

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
  expandDescriptions: boolean
  hidePrereleases: boolean
  hidePreviouslySeen: boolean
  ignoredRepos: Set<string>
  showIgnoredRepos: boolean
  ignoredPrereleases: Set<string>
  showIgnoredPrereleases: boolean
  showLanguages: boolean
} = $state({
  expandDescriptions,
  hidePrereleases,
  hidePreviouslySeen,
  ignoredRepos,
  showIgnoredRepos,
  ignoredPrereleases,
  showIgnoredPrereleases,
  showLanguages,
})

export const appState: {
  firstReleaseBeforeLastSeen?: ReleaseObj | undefined
} = $state({})

const lastSeenPublishedAtString = localStorage.getItem('lastSeenPublishedAt')
export const lastSeenPublishedAt: Date =
  lastSeenPublishedAtString === null
    ? new Date(0) // 1970-01-01
    : new Date(lastSeenPublishedAtString)
