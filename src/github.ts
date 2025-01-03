export const reposQuery = `
  query($cursor: String) {
    viewer {
      starredRepositories(first: 20, after: $cursor) {
        totalCount
        pageInfo {
          startCursor
          hasPreviousPage
          endCursor
          hasNextPage
        }
        nodes {
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
              updatedAt
              url
            }
          }
          stargazerCount
          url
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

export const descriptionQuery = `
  query($releaseIds: [ID!]!) {
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

export interface GithubRelease {
  id: string
  isDraft: boolean
  isPrerelease: boolean
  name: string
  publishedAt: string
  updatedAt: string
  url: string
}

export interface GithubRepository {
  description: string
  languages: {
    nodes: Array<{
      id: string
      name: string
    }>
  }
  licenseInfo: {
    spdxId: string
  }
  name: string
  owner: {
    avatarUrl: string
    login: string
    url: string
  }
  primaryLanguage?: {
    id: string
    name: string
  }
  releases: {
    nodes: GithubRelease[]
  }
  stargazerCount: number
  url: string
}

export interface GithubReposResponse {
  viewer: {
    starredRepositories: {
      totalCount: number
      pageInfo: {
        startCursor: string
        hasPreviousPage: string
        endCursor: string
        hasNextPage: boolean
      }
      nodes: GithubRepository[]
    }
  }

  rateLimit: {
    cost: number
    limit: number
    remaining: number
    used: number
    resetAt: string
  }
}

export interface GithubReleaseResponse {
  nodes: Array<{
    id: string
    descriptionHTML: string
    updatedAt: string
  }>

  rateLimit: {
    cost: number
    limit: number
    remaining: number
    used: number
    resetAt: string
  }
}

export type ReleaseObj = GithubRelease & {
  repo: Omit<GithubRepository, 'releases'>
  descriptionHTML?: string
}
