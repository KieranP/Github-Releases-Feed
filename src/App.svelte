<script lang="ts">
  // https://docs.github.com/en/graphql
  // https://graphql-kit.com/graphql-voyager/

  import { onMount } from 'svelte'

  import { Octokit } from '@octokit/core'
  import { GraphqlResponseError } from '@octokit/graphql'
  import { RequestError } from '@octokit/request-error'

  import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

  import { appState } from './state.svelte'

  import {
    reposQuery,
    descriptionQuery,
    type GithubRepository,
    type GithubReposResponse,
    type GithubReleaseResponse,
    type ReleaseObj,
  } from './github'

  import Login from './components/login.svelte'
  import Settings from './components/settings.svelte'
  import ProgressBar from './components/progress_bar.svelte'
  import Releases from './components/releases.svelte'
  import Toast from './components/toast.svelte'

  let githubToken = $state<string | null>(null)
  let octokit = $derived.by(() => {
    if (githubToken === null) return undefined
    return new Octokit({ auth: githubToken })
  })

  let allReleases = $state<ReleaseObj[]>([])

  let loading = $state(false)
  let totalRepos = $state(0)
  let reposProcessed = $state(0)
  let progress = $derived.by(() => {
    if (totalRepos === 0) return 0
    return reposProcessed / totalRepos
  })

  let retries = $state(0)
  let toast = $state('')

  const lastSeenPublishedAt = localStorage.getItem('lastSeenPublishedAt')

  const now = new Date()
  const startingDate = new Date(now)
  startingDate.setMonth(now.getMonth() - 3)

  let db: IDBPDatabase<GithubReleasesDBSchema> | undefined
  interface GithubReleasesDBSchema extends DBSchema {
    descriptions: {
      key: string
      value: string
    }
  }

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

  function login(inputValue: string): void {
    if (!inputValue) return

    saveGithubToken(inputValue)
    void fetchReleases()
  }

  function logout(): void {
    clearGithubToken()
    allReleases = []
    loading = false
    totalRepos = 0
    reposProcessed = 0
    retries = 0
    toast = ''
  }

  async function initIndexedDB(): Promise<void> {
    try {
      db = await openDB<GithubReleasesDBSchema>('github-releases', 1, {
        upgrade(idbp) {
          idbp.createObjectStore('descriptions')
        },
      })
    } catch (error) {
      console.log(error)
    }
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

      repoNodes.forEach(handleRepoNode)

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
        localStorage.setItem(
          'lastSeenPublishedAt',
          allReleases[0]?.publishedAt ?? '',
        )
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

    const releaseObjs = releaseNodes
      .map((releaseNode) => {
        const publishedAt = new Date(releaseNode.publishedAt)
        if (publishedAt < startingDate) return null
        return { repo, ...releaseNode } as ReleaseObj
      })
      .filter((v) => v !== null)

    if (releaseObjs.length) {
      // TODO: Is there a faster way to insert new releases at the position
      // they should be rather than concatting and resorting the whole array
      // each time?
      allReleases.push(...releaseObjs)
      allReleases.sort((a, b) => {
        return b.publishedAt.localeCompare(a.publishedAt)
      })

      if (lastSeenPublishedAt !== null) {
        releaseObjs.sort((a, b) => {
          return b.publishedAt.localeCompare(a.publishedAt)
        })

        const firstReleaseBeforeLastSeen = releaseObjs.find(
          (r: ReleaseObj) => r.publishedAt <= lastSeenPublishedAt,
        )

        if (
          firstReleaseBeforeLastSeen &&
          (!appState.firstReleaseBeforeLastSeen ||
            firstReleaseBeforeLastSeen.publishedAt >
              appState.firstReleaseBeforeLastSeen.publishedAt)
        ) {
          appState.firstReleaseBeforeLastSeen = firstReleaseBeforeLastSeen
        }
      }

      void fetchReleaseDescriptions(releaseObjs)
    }

    reposProcessed += 1
  }

  async function fetchReleaseDescriptions(
    releaseObjs: ReleaseObj[],
  ): Promise<void> {
    if (!octokit || releaseObjs.length === 0) return

    const uncachedReleaseIds: string[] = []

    await Promise.all(
      releaseObjs.map(async (releaseObj) => {
        const description = db
          ? await db.get(
              'descriptions',
              `${releaseObj.id}-${releaseObj.updatedAt}`,
            )
          : undefined

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

    response.nodes.forEach((releaseNode) => {
      void db?.put(
        'descriptions',
        releaseNode.descriptionHTML,
        `${releaseNode.id}-${releaseNode.updatedAt}`,
      )

      attachReleaseDescription(releaseNode.id, releaseNode.descriptionHTML)
    })

    return
  }

  function attachReleaseDescription(
    releaseId: string,
    description: string,
  ): void {
    const releaseObj = allReleases.find((release) => release.id === releaseId)

    if (releaseObj) {
      releaseObj.descriptionHTML = description
    }
  }

  onMount(async () => {
    await initIndexedDB()
    fetchGithubToken()
    void fetchReleases()
  })
</script>

<Settings
  {githubToken}
  {logout}
/>

{#if githubToken}
  <ProgressBar
    {loading}
    {progress}
  />

  <Releases {allReleases} />
{:else}
  <Login {login} />
{/if}

<Toast {toast} />
