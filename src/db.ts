import {
  type DBSchema,
  type IDBPDatabase,
  type StoreKey,
  type StoreNames,
  type StoreValue,
  openDB,
} from 'idb'

import { delay } from './helpers'

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

// A blocking tab would stall this module's top-level await forever.
const OPEN_TIMEOUT_MS = 5000

let db: IDBPDatabase<GithubReleasesDBSchema> | undefined = undefined

// Split from openDatabase so the timeout can win the race while this runs on.
async function storeDatabase(
  opening: Promise<IDBPDatabase<GithubReleasesDBSchema>>,
): Promise<void> {
  try {
    db = await opening
  } catch (error) {
    console.error('Failed to open the database', error)
  }
}

// openDB calls indexedDB.open() synchronously, which throws outright
// where storage is unavailable.
function requestDatabase():
  | Promise<IDBPDatabase<GithubReleasesDBSchema>>
  | undefined {
  try {
    return openDB<GithubReleasesDBSchema>('github-releases', 4, {
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
      // Another tab wants to upgrade: drop our connection so it isn't blocked.
      blocking(): void {
        db?.close()
        db = undefined
      },
      blocked(): void {
        console.error('Database upgrade blocked by another open tab')
      },
    })
  } catch (error) {
    console.error('Failed to open the database', error)
    return undefined
  }
}

// Leaves `db` undefined on failure (e.g. private-mode storage restrictions).
async function openDatabase(): Promise<void> {
  const opening = requestDatabase()
  if (!opening) return

  // A slow open still populates `db`, just after the app started without it.
  await Promise.race([storeDatabase(opening), delay(OPEN_TIMEOUT_MS)])
}

await openDatabase()

// Pairing in updatedAt makes edited release notes auto-invalidate.
export function descriptionKey(id: string, updatedAt: string): string {
  return `${id}-${updatedAt}`
}

// Every accessor below is a signature over this, so none can throw: no
// database, a dropped connection, and a quota failure all yield `fallback`.
async function withDatabase<T>(
  failure: string,
  fallback: T,
  operation: (database: IDBPDatabase<GithubReleasesDBSchema>) => Promise<T>,
): Promise<T> {
  const database = db
  if (!database) return fallback

  try {
    return await operation(database)
  } catch (error) {
    console.error(failure, error)
    return fallback
  }
}

// Empty on failure, so callers just get a cache miss.
export async function idbGetAll<
  Name extends StoreNames<GithubReleasesDBSchema>,
>(store: Name): Promise<Array<StoreValue<GithubReleasesDBSchema, Name>>> {
  const values = await withDatabase<
    Array<StoreValue<GithubReleasesDBSchema, Name>>
  >(`Failed to read the ${store} store`, [], async (database) => {
    const stored = await database.getAll(store)
    return stored
  })
  return values
}

// Used by the eviction sweeps.
export async function idbGetAllKeys<
  Name extends StoreNames<GithubReleasesDBSchema>,
>(store: Name): Promise<Array<StoreKey<GithubReleasesDBSchema, Name>>> {
  const keys = await withDatabase<
    Array<StoreKey<GithubReleasesDBSchema, Name>>
  >(`Failed to read the ${store} keys`, [], async (database) => {
    const stored = await database.getAllKeys(store)
    return stored
  })
  return keys
}

// Undefined covers both "not cached" and "read failed".
export async function idbGet<Name extends StoreNames<GithubReleasesDBSchema>>(
  store: Name,
  key: StoreKey<GithubReleasesDBSchema, Name>,
): Promise<StoreValue<GithubReleasesDBSchema, Name> | undefined> {
  const value = await withDatabase<
    StoreValue<GithubReleasesDBSchema, Name> | undefined
  >(`Failed to read from the ${store} store`, undefined, async (database) => {
    const stored = await database.get(store, key)
    return stored
  })
  return value
}

// Both stores use out-of-line keys, hence the explicit key.
export async function idbPut<Name extends StoreNames<GithubReleasesDBSchema>>(
  store: Name,
  value: StoreValue<GithubReleasesDBSchema, Name>,
  key: StoreKey<GithubReleasesDBSchema, Name>,
): Promise<void> {
  await withDatabase<undefined>(
    `Failed to write to the ${store} store`,
    undefined,
    async (database): Promise<undefined> => {
      await database.put(store, value, key)
      return undefined
    },
  )
}

export async function idbDelete<
  Name extends StoreNames<GithubReleasesDBSchema>,
>(store: Name, key: StoreKey<GithubReleasesDBSchema, Name>): Promise<void> {
  await withDatabase<undefined>(
    `Failed to delete from the ${store} store`,
    undefined,
    async (database): Promise<undefined> => {
      await database.delete(store, key)
      return undefined
    },
  )
}

async function idbClear(
  store: StoreNames<GithubReleasesDBSchema>,
): Promise<void> {
  await withDatabase<undefined>(
    `Failed to clear the ${store} store`,
    undefined,
    async (database): Promise<undefined> => {
      await database.clear(store)
      return undefined
    },
  )
}

// Used on logout and from the Clear Cache button.
export async function clearCache(): Promise<void> {
  await Promise.all([idbClear('descriptions'), idbClear('repos')])
}

// Leaves cached descriptions in place.
export async function clearRepos(): Promise<void> {
  await idbClear('repos')
}
