import { GraphqlResponseError } from '@octokit/graphql'

import type { Octokit } from '@octokit/core'

// octokit throws whenever a payload carries `errors`, even when usable data
// came with them — one unresolvable id would discard its whole batch.
export async function graphqlAllowingPartials<T>(
  octokit: Octokit,
  query: string,
  variables: Record<string, unknown>,
): Promise<T | undefined> {
  try {
    return await octokit.graphql<T | undefined>(query, variables)
  } catch (error) {
    if (!(error instanceof GraphqlResponseError)) throw error

    // Anything but an unresolvable id may be transient — let the caller retry.
    const { errors } = error
    if (errors === undefined) throw error
    if (!errors.every((e): boolean => e.type === 'NOT_FOUND')) throw error

    const data = error.data as T | null | undefined
    if (data === null || data === undefined) throw error

    console.warn('Partial GraphQL response', error.errors)
    return data
  }
}

// Shared by reposFullQuery and reposByIdsQuery. Keep GithubRepository in sync.
const repoFields = /* GraphQL */ `
  id
  description
  languages(first: 100) {
    nodes {
      id
      name
    }
  }
  licenseInfo {
    spdxId
  }
  name
  owner {
    avatarUrl
    login
    url
  }
  primaryLanguage {
    id
    name
  }
  releases(first: 100, orderBy: { field: CREATED_AT, direction: DESC }) {
    nodes {
      id
      isPrerelease
      name
      publishedAt
      tagName
      updatedAt
      url
    }
  }
  stargazerCount
  updatedAt
  url
`

// `resetAt` only ever reaches the toast that reports the limit was hit.
const rateLimitFields = /* GraphQL */ `
  rateLimit {
    remaining
    resetAt
  }
`

// Pagination walks forwards only.
const pageInfoFields = /* GraphQL */ `
  pageInfo {
    endCursor
    hasNextPage
  }
`

// isolatedDeclarations (TS9010) can't infer through the interpolations, so
// the `: string` below is required — and no-inferrable-types objects to it.
/* eslint-disable @typescript-eslint/no-inferrable-types */

// Cache-disabled loads: whole repos, 20 a page, no manifest pass.
export const reposFullQuery: string = /* GraphQL */ `
  query ($cursor: String) {
    viewer {
      starredRepositories(first: 20, after: $cursor) {
        totalCount
        ${pageInfoFields}

        nodes {
          ${repoFields}
        }
      }
    }

    ${rateLimitFields}
  }
`

// Cache-enabled loads: repos manifest, 100 a page.
export const reposManifestQuery: string = /* GraphQL */ `
  query ($cursor: String) {
    viewer {
      starredRepositories(first: 100, after: $cursor) {
        totalCount
        ${pageInfoFields}

        nodes {
          id
          name
          owner {
            login
          }
          updatedAt
        }
      }
    }

    ${rateLimitFields}
  }
`

export const reposByIdsQuery: string = /* GraphQL */ `
  query ($repoIds: [ID!]!) {
    nodes(ids: $repoIds) {
      ... on Repository {
        ${repoFields}
      }
    }

    ${rateLimitFields}
  }
`

export const descriptionQuery: string = /* GraphQL */ `
  query ($releaseIds: [ID!]!) {
    nodes(ids: $releaseIds) {
      ... on Release {
        id
        descriptionHTML
      }
    }

    ${rateLimitFields}
  }
`

/* eslint-enable @typescript-eslint/no-inferrable-types */

// The signed filename is `<numeric id>-<asset uuid>.<ext>`, and that uuid is
// the permanent asset's own — so the stable URL rebuilds from the expiring one.
const SIGNED_ASSET_URL =
  /https:\/\/private-user-images\.githubusercontent\.com\/\d+\/\d+-(?<assetId>[0-9a-f-]{36})\.\w+\?jwt=[\w.-]+/gu

// `descriptionHTML` renders attachments as URLs that expire in five minutes,
// which outlive neither the cache nor a card left unread. Swap in the redirect.
export function stabiliseAssetUrls(html: string): string {
  return html.replace(
    SIGNED_ASSET_URL,
    'https://github.com/user-attachments/assets/$<assetId>',
  )
}

// An unnamed release falls back to its tag; a draft has no publish date.
interface GithubRelease {
  id: string
  isPrerelease: boolean
  name: string | null
  publishedAt: string | null
  tagName: string
  updatedAt: string
  url: string
}

export interface GithubRepository {
  id: string
  description: string | null
  languages: {
    nodes: Array<{
      id: string
      name: string
    }>
  }
  licenseInfo?: {
    spdxId: string
  } | null
  name: string
  owner: {
    avatarUrl: string
    login: string
    url: string
  }
  primaryLanguage?: {
    id: string
    name: string
  } | null
  releases: {
    nodes: GithubRelease[]
  }
  stargazerCount: number
  updatedAt: string
  url: string
}

interface RateLimit {
  remaining: number
  resetAt: string
}

interface PageInfo {
  endCursor: string
  hasNextPage: boolean
}

export interface GithubRepoManifestNode {
  id: string
  name: string
  owner: { login: string }
  updatedAt: string
}

// Shared by both starred-repo queries; only the node shape differs.
export interface GithubStarredReposResponse {
  viewer: {
    starredRepositories: {
      totalCount: number
      pageInfo: PageInfo
      nodes: Array<GithubRepoManifestNode | GithubRepository>
    }
  }
  rateLimit: RateLimit
}

export interface GithubReposByIdsResponse {
  // Null wherever an id won't resolve: deleted, transferred, or now private.
  nodes: Array<GithubRepository | null>
  rateLimit: RateLimit
}

export interface GithubReleaseResponse {
  nodes: Array<{
    id: string
    descriptionHTML: string
  } | null>
  rateLimit: RateLimit
}

export type ReleaseObj = Omit<GithubRelease, 'publishedAt'> & {
  repo: Omit<GithubRepository, 'releases'> & { fullName: string }
  publishedAt: Date
  descriptionHTML?: string
}
