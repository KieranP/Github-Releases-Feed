import { SvelteSet } from 'svelte/reactivity'

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
  ignoredRepos: Set<string>
  showIgnoredRepos: boolean
  showLanguages: boolean
} = $state({
  expandDescriptions: false,
  hidePrereleases: false,
  ignoredRepos,
  showIgnoredRepos: false,
  showLanguages: false,
})
