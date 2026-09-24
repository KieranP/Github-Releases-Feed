import { vi } from 'vitest'

import { Session } from '../src/session.svelte'

import type { Octokit } from '@octokit/core'

import type { GithubRepository } from '../src/github'

const DAY_MS = 24 * 60 * 60 * 1000

export const IN_WINDOW: Date = new Date(Date.now() - DAY_MS)
export const OUT_OF_WINDOW: Date = new Date(Date.now() - 90 * DAY_MS)

export const RATE_LIMIT: { remaining: number; resetAt: string } = {
  remaining: 5000,
  resetAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
}

export function repoFixture(
  id: string,
  publishedAt: Date = IN_WINDOW,
): GithubRepository {
  return {
    id,
    description: 'desc',
    languages: { nodes: [] },
    name: id,
    owner: { avatarUrl: '', login: 'owner', url: '' },
    releases: {
      nodes: [
        {
          id: `${id}-rel`,
          isPrerelease: false,
          name: 'v1',
          publishedAt: publishedAt.toISOString(),
          tagName: 'v1',
          updatedAt: publishedAt.toISOString(),
          url: '',
        },
      ],
    },
    stargazerCount: 1,
    updatedAt: publishedAt.toISOString(),
    url: '',
  }
}

export type GraphqlStub = ReturnType<
  typeof vi.fn<(query: string, variables: Record<string, unknown>) => unknown>
>

export interface LiveSession {
  session: Session
  graphql: GraphqlStub
  goStale: () => void
}

// The token is a module singleton, so setting one would leak into every spec;
// stubbing isStale and the octokit getter keeps each session local.
export function liveSession(): LiveSession {
  let stale = false

  const session = new Session()
  vi.spyOn(session, 'isStale').mockImplementation((): boolean => stale)

  const graphql: GraphqlStub = vi.fn()
  vi.spyOn(session, 'octokit', 'get').mockReturnValue({
    graphql,
  } as unknown as Octokit)

  return {
    session,
    graphql,
    goStale: (): void => {
      stale = true
    },
  }
}

export function noop(): void {
  // Every failure path logs; the expected noise stays out of the run.
}
