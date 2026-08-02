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

// A tab holding an older version open blocks the upgrade indefinitely,
// and this module is initialised with a top-level await — cap the wait.
const OPEN_TIMEOUT_MS = 5000

let db: IDBPDatabase<GithubReleasesDBSchema> | undefined = undefined

// Await the open and store the result. Split out from openDatabase so the
// timeout can win the race while this keeps running.
async function storeDatabase(
  opening: Promise<IDBPDatabase<GithubReleasesDBSchema>>,
): Promise<void> {
  try {
    db = await opening
  } catch (error) {
    console.error('Failed to open the database', error)
  }
}

// Issue the open request. openDB calls indexedDB.open() synchronously and
// that throws outright where storage is unavailable, so it needs guarding.
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

// Open the IDB database, creating/upgrading stores as needed. Leaves `db`
// undefined on failure (e.g. private-mode storage restrictions).
async function openDatabase(): Promise<void> {
  const opening = requestDatabase()
  if (!opening) return

  // storeDatabase keeps running past the timeout, so a slow open still
  // populates `db` — just after the app has started without it.
  await Promise.race([storeDatabase(opening), delay(OPEN_TIMEOUT_MS)])
}

await openDatabase()

// Composite key for the descriptions store: pairs release id with
// updatedAt so edited release notes auto-invalidate.
export function descriptionKey(id: string, updatedAt: string): string {
  return `${id}-${updatedAt}`
}

// Every accessor below is best-effort: an unopened database, a connection
// dropped by another tab's upgrade, or a quota failure all degrade to the
// empty result rather than rejecting. The cache is an optimisation — losing
// it must cost a refetch, never the load.

// Read a whole store. Empty on failure, so callers just get a cache miss.
export async function idbGetAll<
  Name extends StoreNames<GithubReleasesDBSchema>,
>(store: Name): Promise<Array<StoreValue<GithubReleasesDBSchema, Name>>> {
  if (!db) return []

  try {
    return await db.getAll(store)
  } catch (error) {
    console.error(`Failed to read the ${store} store`, error)
    return []
  }
}

// Read every key in a store. Used by the eviction sweeps.
export async function idbGetAllKeys<
  Name extends StoreNames<GithubReleasesDBSchema>,
>(store: Name): Promise<Array<StoreKey<GithubReleasesDBSchema, Name>>> {
  if (!db) return []

  try {
    return await db.getAllKeys(store)
  } catch (error) {
    console.error(`Failed to read the ${store} keys`, error)
    return []
  }
}

// Read one entry. Undefined covers both "not cached" and "read failed".
export async function idbGet<Name extends StoreNames<GithubReleasesDBSchema>>(
  store: Name,
  key: StoreKey<GithubReleasesDBSchema, Name>,
): Promise<StoreValue<GithubReleasesDBSchema, Name> | undefined> {
  if (!db) return undefined

  try {
    return await db.get(store, key)
  } catch (error) {
    console.error(`Failed to read from the ${store} store`, error)
    return undefined
  }
}

// Write one entry. Both stores use out-of-line keys, hence the explicit key.
export async function idbPut<Name extends StoreNames<GithubReleasesDBSchema>>(
  store: Name,
  value: StoreValue<GithubReleasesDBSchema, Name>,
  key: StoreKey<GithubReleasesDBSchema, Name>,
): Promise<void> {
  if (!db) return

  try {
    await db.put(store, value, key)
  } catch (error) {
    console.error(`Failed to write to the ${store} store`, error)
  }
}

// Delete one entry.
export async function idbDelete<
  Name extends StoreNames<GithubReleasesDBSchema>,
>(store: Name, key: StoreKey<GithubReleasesDBSchema, Name>): Promise<void> {
  if (!db) return

  try {
    await db.delete(store, key)
  } catch (error) {
    console.error(`Failed to delete from the ${store} store`, error)
  }
}

// Empty a whole store.
async function idbClear(
  store: StoreNames<GithubReleasesDBSchema>,
): Promise<void> {
  if (!db) return

  try {
    await db.clear(store)
  } catch (error) {
    console.error(`Failed to clear the ${store} store`, error)
  }
}

// Wipe both IDB stores. Used on logout and from the Clear Cache button.
export async function clearCache(): Promise<void> {
  await Promise.all([idbClear('descriptions'), idbClear('repos')])
}

// Wipe just the repos store, leaving cached descriptions in place.
export async function clearRepos(): Promise<void> {
  await idbClear('repos')
}
