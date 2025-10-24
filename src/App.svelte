<script lang="ts">
  // https://docs.github.com/en/graphql
  // https://graphql-kit.com/graphql-voyager/
  import { onMount } from 'svelte'
  import { SvelteDate } from 'svelte/reactivity'

  import { Octokit } from '@octokit/core'
  import { GraphqlResponseError } from '@octokit/graphql'
  import { RequestError } from '@octokit/request-error'

  import Login from './components/login.svelte'
  import ProgressBar from './components/progress_bar.svelte'
  import Releases from './components/releases.svelte'
  import Settings from './components/settings.svelte'
  import Toast from './components/toast.svelte'
  import { db } from './db'
  import {
    descriptionQuery,
    type GithubReleaseResponse,
    type GithubRepository,
    type GithubReposResponse,
    type ReleaseObj,
    reposQuery,
  } from './github'
  import { appState, lastSeenPublishedAt, settings } from './state.svelte'

  let githubToken = $state<string | null>(null)
  let octokit = $derived.by((): Octokit | undefined => {
    if (githubToken === null) return undefined
    return new Octokit({ auth: githubToken })
  })

  const allRepos: Record<string, ReleaseObj['repo']> = {}
  let allReleases = $state<ReleaseObj[]>([])

  let loading = $state(false)
  let totalRepos = $state(0)
  let reposProcessed = $state(0)
  let progress = $derived.by((): number => {
    if (totalRepos === 0) return 0
    return reposProcessed / totalRepos
  })

  let retries = $state(0)
  let toast = $state('')

  const now = new SvelteDate()
  const startingDate = new SvelteDate(now)
  startingDate.setMonth(now.getMonth() - 1)

  function fetchGithubToken(): void {
    githubToken = localStorage.getItem('githubToken')
  }

  function saveGithubToken(inputValue: string): void {
    if (!inputValue) return

    localStorage.setItem('githubToken', inputValue)
    githubToken = inputValue
  }

  function clearGithubToken(): void {
    localStorage.removeItem('githubToken')
    githubToken = null
  }

  function onlogin(inputValue: string): void {
    if (!inputValue) return

    saveGithubToken(inputValue)
    void fetchReleases()
  }

  function onlogout(): void {
    clearGithubToken()
    void db?.clear('descriptions')
    allReleases = []
    loading = false
    totalRepos = 0
    reposProcessed = 0
    retries = 0
    toast = ''
  }

  async function fetchReleases(cursor: string | null = null): Promise<void> {
    if (!octokit) return

    loading = true

    try {
      const response = await octokit.graphql<GithubReposResponse | undefined>(
        reposQuery,
        {
          cursor,
        },
      )

      // eslint-disable-next-line
      if (!octokit) return

      if (!response) {
        console.log('Debug: Graphql response is undefined')
        void fetchReleases(cursor)
        return
      }

      const {
        pageInfo,
        totalCount,
        nodes: repoNodes,
      } = response.viewer.starredRepositories
      totalRepos ||= totalCount

      // Reset retries since this request succeeded
      retries = 0

      repoNodes.forEach((node) => {
        handleRepoNode(node)
      })

      if (response.rateLimit.remaining <= 0) {
        toast = 'Error: Reached Github Rate Limit'
        loading = false
      } else if (pageInfo.hasNextPage) {
        void fetchReleases(pageInfo.endCursor)
      } else {
        // All releases have finished loading
        loading = false

        // Save the most recent release publishedAt time so we
        // can show the "You're all caught up" line next time
        if (allReleases[0]) {
          localStorage.setItem(
            'lastSeenPublishedAt',
            allReleases[0].publishedAt.toISOString(),
          )
        }
      }
    } catch (error: unknown) {
      console.log(error)

      if (retries < 3) {
        // Retry the same request up to 3 times
        retries += 1
        console.log(`Retrying Request - Retry #${retries}`)
        void fetchReleases(cursor)
      } else if (error instanceof GraphqlResponseError) {
        toast = error.response.errors[0].message
      } else if (error instanceof RequestError) {
        toast = error.message
      }
    }
  }

  function handleRepoNode(repoNode: GithubRepository): void {
    const { releases, ...repo } = repoNode
    const releaseNodes = releases.nodes

    const fullName = `${repo.owner.login}/${repo.name}`
    allRepos[fullName] = { ...repo, fullName }

    const releaseObjs = releaseNodes.reduce<ReleaseObj[]>(
      (result, releaseNode): ReleaseObj[] => {
        const publishedAt = new Date(releaseNode.publishedAt)
        if (publishedAt >= startingDate) {
          result.push({
            repo: allRepos[fullName],
            ...releaseNode,
            publishedAt,
          } as ReleaseObj)
        }

        return result
      },
      [],
    )

    if (releaseObjs.length > 0) {
      releaseObjs.sort(releaseSortFn)
      allReleases.push(...releaseObjs)
      allReleases.sort(releaseSortFn)

      const firstReleaseBeforeLastSeen = releaseObjs.find(
        (r): boolean => r.publishedAt <= lastSeenPublishedAt,
      )

      if (
        firstReleaseBeforeLastSeen &&
        (!appState.firstReleaseBeforeLastSeen ||
          firstReleaseBeforeLastSeen.publishedAt >
            appState.firstReleaseBeforeLastSeen.publishedAt)
      ) {
        appState.firstReleaseBeforeLastSeen = firstReleaseBeforeLastSeen
      }

      void fetchReleaseDescriptions(releaseObjs)
    }

    reposProcessed += 1
  }

  function releaseSortFn(a: ReleaseObj, b: ReleaseObj): number {
    return b.publishedAt.getTime() - a.publishedAt.getTime()
  }

  async function fetchReleaseDescriptions(
    releaseObjs: ReleaseObj[],
  ): Promise<void> {
    if (!octokit || releaseObjs.length === 0) return

    const uncachedReleaseIds: string[] = []

    await Promise.all(
      releaseObjs.map(async (releaseObj): Promise<void> => {
        const description = await db?.get(
          'descriptions',
          `${releaseObj.id}-${releaseObj.updatedAt}`,
        )

        if (description === undefined) {
          uncachedReleaseIds.push(releaseObj.id)
        } else {
          attachReleaseDescription(releaseObj.id, description)
        }
      }),
    )

    if (uncachedReleaseIds.length === 0) return

    const response = await octokit.graphql<GithubReleaseResponse | undefined>(
      descriptionQuery,
      { releaseIds: uncachedReleaseIds },
    )

    if (!response) return

    response.nodes.forEach((releaseNode): void => {
      void db?.put(
        'descriptions',
        releaseNode.descriptionHTML,
        `${releaseNode.id}-${releaseNode.updatedAt}`,
      )

      attachReleaseDescription(releaseNode.id, releaseNode.descriptionHTML)
    })
  }

  function attachReleaseDescription(
    releaseId: string,
    description: string,
  ): void {
    const releaseObj = allReleases.find(
      (release): boolean => release.id === releaseId,
    )

    if (releaseObj) {
      releaseObj.descriptionHTML = description
    }
  }

  onMount((): void => {
    if (settings.darkMode) {
      document.body.classList.add('dark-mode')
    }

    fetchGithubToken()
    void fetchReleases()
  })
</script>

<Settings
  {githubToken}
  {onlogout}
/>

{#if githubToken}
  <ProgressBar
    {loading}
    {progress}
  />

  <Releases {allReleases} />
{:else}
  <Login {onlogin} />
{/if}

<Toast {toast} />
