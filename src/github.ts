export const reposManifestQuery = /* GraphQL */ `
  query ($cursor: String) {
    viewer {
      starredRepositories(first: 100, after: $cursor) {
        totalCount
        pageInfo {
          startCursor
          hasPreviousPage
          endCursor
          hasNextPage
        }

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

    rateLimit {
      cost
      limit
      remaining
      used
      resetAt
    }
  }
`

export const reposByIdsQuery = /* GraphQL */ `
  query ($repoIds: [ID!]!) {
    nodes(ids: $repoIds) {
      ... on Repository {
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
            isDraft
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
      }
    }

    rateLimit {
      cost
      limit
      remaining
      used
      resetAt
    }
  }
`

export const descriptionQuery = /* GraphQL */ `
  query ($releaseIds: [ID!]!) {
    nodes(ids: $releaseIds) {
      ... on Release {
        id
        descriptionHTML
        updatedAt
      }
    }

    rateLimit {
      cost
      limit
      remaining
      used
      resetAt
    }
  }
`

interface GithubRelease {
  id: string
  isDraft: boolean
  isPrerelease: boolean
  name: string
  publishedAt: string
  tagName: string
  updatedAt: string
  url: string
}

export interface GithubRepository {
  id: string
  description: string
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
  cost: number
  limit: number
  remaining: number
  used: number
  resetAt: string
}

interface PageInfo {
  startCursor: string
  hasPreviousPage: boolean
  endCursor: string
  hasNextPage: boolean
}

export interface GithubRepoManifestNode {
  id: string
  name: string
  owner: { login: string }
  updatedAt: string
}

export interface GithubReposManifestResponse {
  viewer: {
    starredRepositories: {
      totalCount: number
      pageInfo: PageInfo
      nodes: GithubRepoManifestNode[]
    }
  }
  rateLimit: RateLimit
}

export interface GithubReposByIdsResponse {
  // nodes(ids: ...) returns null at positions where the id can't be
  // resolved (e.g. deleted/transferred/now-private repo).
  nodes: Array<GithubRepository | null>
  rateLimit: RateLimit
}

export interface GithubReleaseResponse {
  nodes: Array<{
    id: string
    descriptionHTML: string
    updatedAt: string
  } | null>
  rateLimit: RateLimit
}

export type ReleaseObj = Omit<GithubRelease, 'publishedAt'> & {
  repo: Omit<GithubRepository, 'releases'> & { fullName: string }
  publishedAt: Date
  descriptionHTML?: string
}
