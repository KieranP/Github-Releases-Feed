# Github Releases Activity Feed

Personalized feed of GitHub releases for starred repos.
**Stack**: Svelte 5 Runes, TypeScript, Vite, `@octokit/core`, `idb`.
**Auth**: PAT in localStorage. No backend — everything runs client-side.
`CLAUDE.md` is a symlink to this file.

## Layout

- `src/App.svelte` — entry: starts the loader on mount, wires login/logout.
- `src/loader.svelte.ts` — façade over the pipeline: `start`/`reset`/
  `clearCachedData` + the `loading`/`progress`/`groups`/`toast` getters.
- Pipeline, flat siblings so none imports back out of a folder (see
  `IMPLEMENTATION.md`): `session.svelte.ts` (octokit + staleness),
  `status.svelte.ts`, `feed.svelte.ts` (releases + `groups`), `repo_sync.ts`
  (manifest + serial refresh chain), `description_sync.ts`, `retry.ts`,
  `cache_eviction.ts`, `release_window.ts`.
- `src/github.ts` — queries + types + `graphqlAllowingPartials`.
- `src/db.ts` — IDB (`github-releases`, v4): `repos` + `descriptions`.
- `src/state.svelte.ts` — settings (localStorage) + color scheme.
- `src/helpers.ts`, `src/models/`, `src/components/`, `src/styles/`,
  `src/types.d.ts`.
- `tests/` — vitest specs + `setup.ts`; the only place that imports `../src`.
- `dist/` — **committed**; the Pages workflow uploads it as-is (see Deploy).

## Coding standards (strict)

- **Svelte 5**: Runes only (`$state`, `$derived`, `$props`). No `$:`/`export let`.
- **Logic** in `.svelte.ts` models, not components.
- **TypeScript**: no `any`; explicit return types; async = `Promise<T>`.
- **Imports**: extensionless; `.svelte.ts` drops the `.ts`. Point at siblings or
  into a folder, never back out with `../` (`tests/` excepted).
- **Styling**: scoped, nested CSS; vars from `src/styles/global.css`.
- **Comments**: max 3 lines before a class, 2 before a function, 1 inside one.
- **`RepoSync`**: methods below `run()` are ordered DFS from it — preserve that.
- **Pipeline deps** arrive as one `…Deps` object (`max-params` caps at 3).

## Commands

`pnpm types` · `pnpm lint` · `pnpm format` · `pnpm test` · `pnpm build` · `pnpm dev --open`

`types` and `lint` each run two tools chained with `;`, so a failure in the
first doesn't stop the second.

## Deploy

`.github/workflows/static.yml` uploads `dist/` to Pages on push to `main` and
does **not** build. Build and commit `dist/` yourself or it ships the old bundle.

## Don't break

- **Refresh batches stay serial** via `RepoSync.refreshChain` — the endpoint that
  hit the secondary rate limit. Manifest pages and description batches run in
  parallel; descriptions serialize next if rate limits return.
- **Re-check `isStale(sessionId)` after every `await`** (23 sites) against the id
  the method was handed. `start`/`reset`/`clearCachedData` bump it via
  `Session.begin()`; `!octokit` alone can't tell a superseded chain from a live
  one after a new token is pasted in. Teardown (`wipeCache`, `clearCachedData`)
  uses `isSuperseded` instead — the token is already cleared there, so `isStale`
  is always true and a logout would abandon its own wipe.
- **`lastAccessedAt` writes only on full success**, in `Loader.completeLoad`.
  Never to in-memory `settings`, or the caught-up divider jumps mid-session.
- **`wipeCache` clears IDB twice**, either side of draining
  `RepoSync.pendingRefresh`, whose queued puts outlive the first clear.
- **`Loader.clearState()` resets all three** of `Status`, `FeedStore`, `RepoSync`.
- **`settings.disableCache` bypasses the `repos` store entirely** — the full
  query makes every node an `isFullRepo`, so no hydration, batches, or writes —
  and `CacheEviction` clears it so an old snapshot can't be served on toggle-off.
- **`FeedStore.descriptionKeys()` is the eviction survivor set**, from the feed,
  not the `repos` store, which is empty on a cache-disabled load.
- **`Repository.updatedAt` likely does NOT bump on release-body edits.**
  Confirmed bumpers: description edits, pushes. If notes go stale, compare
  `releases.nodes[0].updatedAt` in the manifest too.

## Gotchas

- **Dual linter**: oxlint-only rules need `// oxlint-disable-next-line <rule>`;
  a bare `// eslint-disable-next-line` errors as unused.
- **`isolatedDeclarations`**: an exported `const` built from a template literal
  with `${...}` can't be inferred (TS9010) and needs `: string` — which is why
  the query constants are annotated and `no-inferrable-types` is off there.
- **Bare `{const}` in markup is non-reactive** (Svelte 5.56+). Wrap in
  `$derived` — see `visibleReleases` in `src/components/releases.svelte`.
- **`nodes(ids: [...])` returns null** for unresolvable ids, paired with a
  top-level `NOT_FOUND` that makes octokit throw. Batch queries go through
  `graphqlAllowingPartials` to recover the payload; without it one deleted repo
  discards its whole batch of 20.
- **`mergeSorted` sorts its second arg in place.**
- **`src/db.ts` uses a top-level `await`** on the IDB open, capped at 5s.
- **Always reach IDB through the `idb*` wrappers** — each swallows an
  unavailable DB and a failed op, so no caller needs `try`/`catch` and the cache
  can never abort a load.
- **Adding a `GithubRepository` field**: update the shared `repoFields` fragment
  and the TS interface; bump the IDB version (currently 4) to clear cached rows.

## Testing

`pnpm test` runs `vitest` over `tests/`: `helpers.test.ts` and `loader.test.ts`
(`Status`, `Session`, `FeedStore`, plus a `Loader` construction smoke test).
`RepoSync`, `DescriptionSync`, and `CacheEviction` have none — they and the
components are verified manually with a real PAT via `pnpm dev` (Settings →
Debug dumps state to the console).

`tests/setup.ts` stubs `IntersectionObserver`, `localStorage`, and `matchMedia`,
and imports `fake-indexeddb/auto` — jsdom has no IndexedDB, so without it
`db.ts`'s top-level open fails and logs on every run.
