import { SvelteSet } from 'svelte/reactivity'

const expandDescriptions = localStorage.getItem('expandDescriptions') === 'true'
const hidePrereleases = localStorage.getItem('hidePrereleases') === 'true'
const hidePreviouslySeen = localStorage.getItem('hidePreviouslySeen') === 'true'
const showIgnoredRepos = localStorage.getItem('showIgnoredRepos') === 'true'
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

export const settings: {
  expandDescriptions: boolean
  hidePrereleases: boolean
  hidePreviouslySeen: boolean
  ignoredRepos: Set<string>
  showIgnoredRepos: boolean
  showLanguages: boolean
} = $state({
  expandDescriptions,
  hidePrereleases,
  hidePreviouslySeen,
  ignoredRepos,
  showIgnoredRepos,
  showLanguages,
})
