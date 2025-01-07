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
  showLanguages: boolean
  showIgnoredRepos: boolean
  ignoredRepos: Set<string>
} = $state({
  expandDescriptions: false,
  showLanguages: false,
  showIgnoredRepos: false,
  ignoredRepos,
})
