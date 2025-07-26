import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

interface GithubReleasesDBSchema extends DBSchema {
  descriptions: {
    key: string
    value: string
  }
}

let db: IDBPDatabase<GithubReleasesDBSchema> | undefined = undefined
try {
  db = await openDB<GithubReleasesDBSchema>('github-releases', 1, {
    upgrade(idbp): void {
      idbp.createObjectStore('descriptions')
    },
  })
} catch (error) {
  console.error('Failed to open the database', error)
}

export { db }
