# Implementation

Incremental-sync pipeline. A cheap manifest pass enumerates every
starred repo (id + `updatedAt`); cached repos hydrate from IDB
immediately, only new or `updatedAt`-advanced repos are fetched in
full. `updatedAt` bumps on any repo metadata change — commits,
releases, release-note edits, description — so a single comparison
covers everything we care about.

```mermaid
flowchart TD
  classDef fn fill:#1e3a8a,stroke:#3b82f6,color:#fff
  classDef io fill:#7c2d12,stroke:#ea580c,color:#fff
  classDef state fill:#14532d,stroke:#22c55e,color:#fff
  classDef ext fill:#581c87,stroke:#a855f7,color:#fff
  classDef err fill:#7f1d1d,stroke:#ef4444,color:#fff

  Start([App.svelte]):::ext --> startFn["<b>start()</b>"]:::fn
  startFn --> runFn["<b>run()</b>"]:::fn
  runFn --> idbLoad[("db.getAll('repos')<br/>→ cachedReposIndex")]:::io --> fetchStarredReposPage

  fetchStarredReposPage["<b>fetchStarredReposPage(cursor)</b>"]:::fn --> gqlManifest{{"reposManifestQuery"}}:::ext
  gqlManifest -->|error| handleFetchError
  gqlManifest -->|response| pageLoop["classify cached / changed"]
  pageLoop --> processHydrate["<b>mergeReposIntoFeed</b> (hydrate)"]:::fn
  pageLoop --> enqueueRepoRefresh["<b>enqueueRepoRefresh</b>"]:::fn
  pageLoop --> nextCheck{hasNextPage?}
  nextCheck -->|yes| fetchStarredReposPage
  nextCheck -->|no| finishLoad

  enqueueRepoRefresh --> reposRefreshChain[("reposRefreshChain<br/>serialized")]:::state
  reposRefreshChain --> refreshRepos["<b>refreshRepos</b> retries 3×"]:::fn
  refreshRepos --> gqlBatch{{"reposByIdsQuery"}}:::ext
  gqlBatch -->|401| handleAuthError
  gqlBatch -->|retry| refreshRepos
  gqlBatch -->|response| trimResolved["filter null + trim window"]
  trimResolved --> idbBatchWrite[("put resolved<br/>delete unresolved")]:::io
  idbBatchWrite --> dropReleasesForRepos["<b>dropReleasesForRepos</b>"]:::fn
  dropReleasesForRepos --> processRefresh["<b>mergeReposIntoFeed</b> (refresh)"]:::fn

  processHydrate --> processBody
  processRefresh --> processBody
  processBody["extract → merge → describe"] --> mergeSorted["mergeSorted +<br/><b>releaseSortFn</b>"]:::fn
  mergeSorted --> releasesState[("releases / releasesIndex")]:::state
  processBody --> fetchDescs["<b>fetchReleaseDescriptions</b>"]:::fn
  fetchDescs --> descCache[("db.get / db.put")]:::io
  descCache --> gqlDesc{{"descriptionQuery"}}:::ext
  gqlDesc --> attachDesc["<b>attachReleaseDescription</b>"]:::fn
  descCache --> attachDesc
  attachDesc --> releasesState

  finishLoad["<b>finishLoad()</b>"]:::fn --> staleIdb[("db.delete unstarred")]:::io
  staleIdb --> drain{reposRefreshChain<br/>aborted?}
  drain -->|yes| AbortEnd([Done — aborted]):::err
  drain -->|no| markDone["loading = false<br/>update lastAccessedAt"]
  markDone --> evictStaleData["<b>evictStaleData()</b>"]:::fn --> SuccessEnd([Done])

  handleFetchError["<b>handleFetchError</b>"]:::err -->|retries < 3| fetchStarredReposPage
  handleFetchError --> handleAuthError["<b>handleAuthError</b>"]:::err
  handleAuthError -->|401| resetFn["<b>reset()</b>"]:::fn
```

**Legend**: blue = `Loader` method · orange = IDB · green = in-memory
state · purple = external · red = error.

## Invariants

- **Refresh batches serialized** via `reposRefreshChain` (GitHub secondary rate limit).
- **`refreshRepos` returns abort `boolean`** propagated through the chain;
  abort skips `lastAccessedAt` update + `evictStaleData`.
- **`lastAccessedAt` only bumps on success** — it marks the "all caught up" line.
- **Description cache keyed by `${releaseId}-${updatedAt}`** so edits auto-refresh.
- **Cached `releases.nodes` trimmed to a sliding 1-month window** on every write
  and during `evictStaleData`.
- **`evictStaleData` runs at most once per 24h** (gated by `lastEvictedAt`
  in localStorage) — orphaned description keys may linger that long but
  won't grow unbounded.
