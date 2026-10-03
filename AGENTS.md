# Github Releases Activity Feed

Personalized feed of GitHub releases for starred repos.

- **Stack**: Svelte 5 Runes, TypeScript, Vite, `@octokit/core`, `idb`,
  `devalue`.
- **Auth**: PAT in localStorage. No backend — everything runs client-side.
- `CLAUDE.md` is a symlink to this file.

## Layout

- `src/App.svelte` — entry: starts the loader on mount, and the only place that
  touches the `loader` singleton — every component below takes callback props.
- `src/loader.svelte.ts` — façade over the pipeline: `start`/`reset`/
  `clearCachedData`/`loadDescription`/`dismissToast`/`clearToasts`/`dump` + the
  `loading`/`progress`/`groups`/`toasts`/`isEmpty` getters.
- Pipeline, flat siblings so none imports back out of a folder (see
  `IMPLEMENTATION.md`): `session.svelte.ts` (octokit + staleness),
  `status.svelte.ts`, `feed.svelte.ts` (releases + `groups`), `repo_sync.ts`
  (manifest + serial refresh chain), `description_sync.ts`, `retry.ts`,
  `cache_eviction.ts`, `release_window.ts`.
- `src/github.ts` — queries + types + `graphqlAllowingPartials`.
- `src/db.ts` — IDB (`github-releases`, v4): `repos` + `descriptions`.
- `src/state.svelte.ts` — settings (localStorage).
- `src/theme.ts` — Auto/Light/Dark: the stored choice, the cycle, the button's
  icon and label, and the `color-scheme` it pins.
- `src/navigation.svelte.ts` — the arrow-key cursor over `groups`, held as a
  group key. Owns the keydown guards, the on-screen scan that decides where a
  press enters, and the scroll; `releases.svelte` only wires it.
- `src/helpers.ts`, `src/models/`, `src/components/`, `src/styles/`,
  `src/types.d.ts`.
- `tests/` — vitest specs + `setup.ts` + `fixtures.ts` (shared repo fixture and
  session stub); the only place that imports `../src`.
- `dist/` — **committed**; the Pages workflow uploads it as-is (see Deploy).

## Coding standards (strict)

- **Svelte 5**: Runes only (`$state`, `$derived`, `$props`). No
  `$:`/`export let`.
- **Logic** in `.svelte.ts` models, not components.
- **TypeScript**: no `any`; explicit return types; async = `Promise<T>`.
- **Imports**: extensionless; `.svelte.ts` drops the `.ts`. Point at siblings or
  into a folder, never back out with `../` (`tests/` excepted).
- **Styling**: scoped, nested CSS; vars from `src/styles/global.css`.
- **Comments**: max 3 lines before a class, 2 before a function, 1 inside one.
- **`RepoSync`**: methods below `run()` are ordered DFS from it — preserve that.
- **Pipeline deps** arrive as one `…Deps` object (`max-params` caps at 3).

## Commands

`pnpm types` · `pnpm lint` · `pnpm format` · `pnpm test` · `pnpm build` ·
`pnpm dev --open`

`types` and `lint` each run their two `types:*`/`lint:*` tools in parallel with
`--no-bail`: both finish, and either failing fails the script. Chaining with `;`
kept only the second tool's exit code. `pnpm-workspace.yaml` sets
`shellEmulator: true`, so the `**` globs in scripts expand recursively; `sh -c`
can't reproduce them.

## Deploy

`.github/workflows/static.yml` uploads `dist/` to Pages on push to `main` and
does **not** build. Build and commit `dist/` yourself or it ships the old
bundle.

## Don't break

- **Refresh batches stay serial** via `RepoSync.refreshChain` — the endpoint
  that hit the secondary rate limit. Manifest pages and description batches run
  in parallel; descriptions serialize next if rate limits return.
- **Release notes are only prefetched for cards that will render.**
  `RepoSync.mergeIntoFeed` filters on `isDisplayable`; hidden and ignored ones
  fetch from `release.svelte`'s intersect handler if a setting reveals them.
  `DescriptionSync.enqueue` coalesces those on a microtask, since one
  IntersectionObserver callback delivers a screenful and a request per card
  trips the rate limit. `Release.descriptionRequested`, claimed before the first
  `await` in `fetchAll`, stops both paths fetching the first screenful.
- **A failed or partial description batch blanks its cards.** Once retries are
  spent, or a node comes back null, `fetchBatch` sets `''` on every release
  still unset, else the spinner never clears and `descriptionRequested` blocks a
  retry. It re-checks `isStale` first: a newer session's feed can hold the same
  ids.
- **Re-check `isStale(sessionId)` after every `await`** (26 sites) against the
  id the method was handed. `start`/`reset`/`clearCachedData` bump it via
  `Session.begin()`; `!octokit` alone can't tell a superseded chain from a live
  one after a new token is pasted in. Teardown (`wipeCache`, `clearCachedData`)
  uses `isSuperseded` instead — the token is already cleared there, so `isStale`
  is always true and a logout would abandon its own wipe.
- **`Session.begin()` also aborts.** It swaps in a fresh `AbortController`, and
  `octokit` derives off it, so every client carries the signal for the session
  that built it. The id checks still do the work of rejecting late results; the
  signal is what stops a superseded load from billing its requests against the
  rate limit anyway. The abort surfaces as a rejection inside `RetryRunner.run`,
  which bails on `isStale` **before** logging — else every logout spams
  AbortErrors that read like failures.
- **`lastAccessedAt` writes only on full success**, in `Loader.completeLoad`.
  Never to in-memory `settings`, or the caught-up divider jumps mid-session.
- **`wipeCache` clears IDB twice**, either side of draining
  `RepoSync.pendingRefresh`, whose queued puts outlive the first clear.
- **A cursor scrolled out of the viewport counts as no cursor.**
  `Navigation.cursorIndex` returns -1 for it, so the press re-enters beside what
  the reader is looking at. It needs a measurable element to decide that: with
  no rendered list the key stands, or every keyboard-only test re-enters at the
  top forever.
- **`Navigation` scrolls from `select()`, never from an attachment.** An
  attachment on the group re-runs every time `groups` re-derives, so each batch
  landing mid-load dragged the page back to the cursor. `select()` fires exactly
  once per key press.
- **`Loader.clearState()` resets all three** of `Status`, `FeedStore`,
  `RepoSync`.
- **`settings.disableCache` bypasses the `repos` store entirely** — the full
  query makes every node an `isFullRepo`, so no hydration, batches, or writes —
  and `CacheEviction` clears it so an old snapshot can't be served on
  toggle-off.
- **`FeedStore.descriptionKeys()` is the eviction survivor set**, from the feed,
  not the `repos` store, which is empty on a cache-disabled load.
- **`Repository.updatedAt` likely does NOT bump on release-body edits.**
  Confirmed bumpers: description edits, pushes. If notes go stale, compare
  `releases.nodes[0].updatedAt` in the manifest too.
- **Toasts are keyed, and only their own key may clear them.** `Status.notify`
  replaces the entry for a key so a retry ladder reads as one changing message;
  `dismiss(key)` retracts exactly one source. Never clear the lot on a success —
  that was how a non-fatal description failure got wiped by an unrelated page
  landing, and how it then stuck around forever once pages stopped arriving.
  `clearToasts()` is teardown only (logout, and login under a new token).
- **One retry policy per concurrent source.** The manifest pass and the refresh
  chain run at the same time, so they hold `MANIFEST_RETRY_POLICY` and
  `REFRESH_RETRY_POLICY` separately — sharing a key meant a landing page
  retracting a batch's live retry warning, the same bug one level down. Manifest
  pages do share a key with each other, which is intended: they're one source,
  and the ladder should read as one message.
- **The fire-and-forget chains catch their own throws.** `run()` and the
  pagination recursion are entered with `void`, so a throw escaping
  `processStarredReposPage` or `runRefreshBatch` would be an unhandled
  rejection: no toast, no log, spinner up forever. Both funnel into
  `RepoSync.abortLoad`.

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
- **GraphQL nullability is declared, so lint forces you to handle it**: a repo
  `description`, and a release `name` and `publishedAt`, are all nullable.
  `isReleaseInWindow` is a type guard that drops the null (draft) date, which is
  what lets `extractReleases` build a non-null `ReleaseObj.publishedAt`.
- **Retries honour GitHub's own backoff** — `retry-after`, or
  `x-ratelimit-reset` once `x-ratelimit-remaining` is `0` — in place of the
  exponential ladder, which otherwise spends every attempt inside the window. A
  wait past `MAX_RATE_LIMIT_WAIT_MS` gives up and names the time instead.

## Testing

`pnpm test` runs `vitest` over `tests/`: `helpers.test.ts` (`mergeSorted`,
`chunk`, `formatRelativeTime`), `loader.test.ts` (the `idb*` wrappers, `Status`,
`Session`, `FeedStore`, plus a `Loader` construction smoke test and the debug
dump), `retry.test.ts` (backoff, the rate-limit headers, toast keying, 401
teardown), `navigation.test.ts` (entry, stepping, clamping, unrenderable groups,
the `handleKey` guards, and the scroll), `state.test.ts` (`fetchAsDate`,
`dumpSettings`), `theme.test.ts` (the stored choice, the cycle, the scheme),
`github.test.ts` (`stabiliseAssetUrls`), `repo_sync.test.ts` (selective refresh,
pruning, unresolvable ids, the serial chain, abort, rate-limit stop, a stale
refresh, the completion flag), `description_sync.test.ts` (cache, claim,
coalescing, blanking on failure, a stale cache read), and
`cache_eviction.test.ts` (the daily gate, both sweeps, and the cache-disabled
clear). The components are verified manually with a real PAT via `pnpm dev`
(Settings → Debug dumps state to the console).

Specs stub `Session.isStale` rather than setting a token, and the pipeline specs
stub the `octokit` getter too (`liveSession` in `tests/fixtures.ts`): the token
is a module singleton, so a test that sets it would leak into every other spec
in the file. The `RepoSync` specs route the stub `graphql` by query string to a
fake GitHub. Specs that touch IDB fake only `setTimeout`, so fake-indexeddb's
`setImmediate` still runs, and must not `await` `RepoSync.run` before advancing
the timers: a single-page load awaits the refresh chain inside it.

`tests/setup.ts` stubs `IntersectionObserver` and `localStorage`, and imports
`fake-indexeddb/auto` — jsdom has no IndexedDB, so without it `db.ts`'s
top-level open fails and logs on every run.
