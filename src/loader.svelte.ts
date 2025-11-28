/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable svelte/prefer-destructured-store-props */
// https://docs.github.com/en/graphql
// https://graphql-kit.com/graphql-voyager/
import { Octokit } from '@octokit/core'

import { db } from './db'
import {
  descriptionQuery,
  type GithubReleaseResponse,
  type GithubRepository,
  type GithubReposResponse,
  reposQuery,
} from './github'
import { Release } from './models/release.svelte'
import { ReleaseGroup } from './models/release_group.svelte'
import { lastAccessedAt, settings } from './state.svelte'

const now = new Date()
const startingDate = new Date(now)
startingDate.setMonth(now.getMonth() - 1)

class Loader {
  public loading: boolean = $state(false)
  public toast: string = $state('')
  private retries = $state(0)

  private totalRepos = $state(0)
  private reposProcessed = $state(0)
  public progress: number = $derived.by(() => {
    if (this.totalRepos === 0) return 0
    return this.reposProcessed / this.totalRepos
  })

  private readonly octokit: Octokit | undefined = $derived.by(() => {
    if (settings.githubToken === null) return undefined
    return new Octokit({ auth: settings.githubToken })
  })

  private firstReleaseBeforeLastAccessed: Release | undefined = undefined

  private releases = $state<Release[]>([])

  public groups: ReleaseGroup[] = $derived.by(() => {
    const groups: ReleaseGroup[] = []
    let currentGroup: ReleaseGroup | null = null
    const lastSeenId = this.firstReleaseBeforeLastAccessed?.data.id

    for (const release of this.releases) {
      const repo = release.data.repo.fullName

      if (currentGroup && currentGroup.repo !== repo) {
        currentGroup.showCaughtUp = currentGroup.releases.some(
          (r) => lastSeenId === r.data.id,
        )

        groups.push(currentGroup)
        currentGroup = new ReleaseGroup(repo)
      }

      currentGroup ??= new ReleaseGroup(repo)
      currentGroup.releases.push(release)
    }

    if (currentGroup) {
      currentGroup.showCaughtUp = currentGroup.releases.some(
        (r) => lastSeenId === r.data.id,
      )

      groups.push(currentGroup)
    }

    return groups
  })

  public start(): void {
    if (!this.octokit) return

    this.loading = true

    void this.fetchReleases()
  }

  public reset(): void {
    void db?.clear('descriptions')

    this.loading = false
    this.toast = ''
    this.retries = 0

    this.totalRepos = 0
    this.reposProcessed = 0
    this.releases = []
  }

  private async fetchReleases(cursor: string | null = null): Promise<void> {
    if (!this.octokit) {
      console.log('ERROR: Missing Github API Token. Aborting...')
      return
    }

    try {
      const response = await this.octokit.graphql<
        GithubReposResponse | undefined
      >(reposQuery, {
        cursor,
      })

      // eslint-disable-next-line
      if (!this.octokit) {
        console.log('ERROR: Missing Github API Token. Aborting...')
        return
      }

      if (!response) {
        console.log('ERROR: Invalid GraphQL Response. Retrying...')
        void this.fetchReleases(cursor)
        return
      }

      const {
        pageInfo,
        totalCount,
        nodes: repoNodes,
      } = response.viewer.starredRepositories

      this.totalRepos ||= totalCount

      // Since the request succeeded, reset the
      // retries count and toast message
      this.retries = 0
      this.toast = ''

      repoNodes.forEach((node) => {
        this.handleRepoNode(node)
      })

      if (response.rateLimit.remaining <= 0) {
        this.toast = 'ERROR: Reached Github Rate Limit'
        this.loading = false
      } else if (pageInfo.hasNextPage) {
        void this.fetchReleases(pageInfo.endCursor)
      } else {
        // All releases have finished loading
        this.loading = false

        // Save the current time so we can show the
        // "You're all caught up" line next time
        localStorage.setItem('lastAccessedAt', new Date().toISOString())
      }
    } catch (error: unknown) {
      console.log(error)

      if (this.retries < 3) {
        // Retry the same request up to 3 times
        this.retries += 1
        const message = `ERROR: Request Failed - Retry #${this.retries}`
        this.toast = message
        console.log(message)
        void this.fetchReleases(cursor)
      } else {
        // Too many failed requests, stop processing
        this.toast = 'ERROR: Repeated Request Failures - Aborting'
        this.loading = false
      }
    }
  }

  private handleRepoNode(repoNode: GithubRepository): void {
    const { releases: releaseData, ...repoData } = repoNode
    const releaseNodes = releaseData.nodes

    const fullName = `${repoData.owner.login}/${repoData.name}`
    const repo = { ...repoData, fullName }

    const releases = releaseNodes.reduce<Release[]>((result, releaseNode) => {
      const publishedAt = new Date(releaseNode.publishedAt)
      if (publishedAt >= startingDate) {
        const release = new Release({
          repo,
          ...releaseNode,
          publishedAt,
        })

        result.push(release)
      }

      return result
    }, [])

    if (releases.length > 0) {
      this.releases.push(...releases)
      this.releases.sort(this.releaseSortFn)

      this.firstReleaseBeforeLastAccessed = this.releases.find(
        (r): boolean => r.data.publishedAt <= lastAccessedAt,
      )

      void this.fetchReleaseDescriptions(releases)
    }

    this.reposProcessed += 1
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  private releaseSortFn(a: Release, b: Release): number {
    return b.data.publishedAt.getTime() - a.data.publishedAt.getTime()
  }

  private async fetchReleaseDescriptions(releases: Release[]): Promise<void> {
    if (!this.octokit || releases.length === 0) return

    const uncachedReleaseIds: string[] = []

    await Promise.all(
      releases.map(async (release): Promise<void> => {
        const description = await db?.get(
          'descriptions',
          `${release.data.id}-${release.data.updatedAt}`,
        )

        if (description === undefined) {
          uncachedReleaseIds.push(release.data.id)
        } else {
          this.attachReleaseDescription(release.data.id, description)
        }
      }),
    )

    if (uncachedReleaseIds.length === 0) return

    const response = await this.octokit.graphql<
      GithubReleaseResponse | undefined
    >(descriptionQuery, { releaseIds: uncachedReleaseIds })

    if (!response) return

    response.nodes.forEach((releaseNode): void => {
      void db?.put(
        'descriptions',
        releaseNode.descriptionHTML,
        `${releaseNode.id}-${releaseNode.updatedAt}`,
      )

      this.attachReleaseDescription(releaseNode.id, releaseNode.descriptionHTML)
    })
  }

  private attachReleaseDescription(
    releaseId: string,
    description: string,
  ): void {
    const release = this.releases.find((r): boolean => r.data.id === releaseId)

    if (release) {
      release.data.descriptionHTML = description
    }
  }
}

const loader: Loader = new Loader()
export { loader }
