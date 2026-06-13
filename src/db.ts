import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

import type { GithubRepository } from './github'

interface GithubReleasesDBSchema extends DBSchema {
  descriptions: {
    key: string
    value: string
  }
  repos: {
    key: string
    value: GithubRepository
  }
}

// Open the IDB database, creating/upgrading stores as needed. Returns
// undefined on failure (e.g. private-mode storage restrictions).
async function openDatabase(): Promise<
  IDBPDatabase<GithubReleasesDBSchema> | undefined
> {
  try {
    return await openDB<GithubReleasesDBSchema>('github-releases', 4, {
      upgrade(idbp, oldVersion): void {
        if (oldVersion < 1) {
          idbp.createObjectStore('descriptions')
        }
        if (oldVersion < 4) {
          // v4: GithubRepository shape changed (added `updatedAt`) — wipe earlier entries.
          if (idbp.objectStoreNames.contains('repos')) {
            idbp.deleteObjectStore('repos')
          }
          idbp.createObjectStore('repos')
        }
      },
    })
  } catch (error) {
    console.error('Failed to open the database', error)
    return undefined
  }
}

export const db: IDBPDatabase<GithubReleasesDBSchema> | undefined =
  await openDatabase()

// The imported `db` is `| undefined` and TS won't narrow it inside async
// closures; callers alias the result to a local const so it narrows there.
export function getDb(): IDBPDatabase<GithubReleasesDBSchema> | undefined {
  return db
}

// Composite key for the descriptions store: pairs release id with
// updatedAt so edited release notes auto-invalidate.
export function descriptionKey(id: string, updatedAt: string): string {
  return `${id}-${updatedAt}`
}

// Wipe both IDB stores. Used on logout and from the Clear Cache button;
// no-op if the database failed to open.
export async function clearCache(): Promise<void> {
  if (!db) return
  await Promise.all([db.clear('descriptions'), db.clear('repos')])
}
