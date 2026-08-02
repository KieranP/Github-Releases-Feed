# Github Releases Activity Feed

Personalized feed of GitHub releases for starred repos.
**Stack**: Svelte 5 Runes, TypeScript, Vite, `@octokit/core`, `idb`.
**Auth**: PAT in localStorage. No backend — everything runs client-side.
`CLAUDE.md` is a symlink to this file.

## Layout

- `src/App.svelte` — entry: starts the loader on mount, wires login/logout.
- `src/loader.svelte.ts` — sync pipeline: incremental by default, full
  refetch when Disable Repo Cache is on. See `IMPLEMENTATION.md`.
- `src/github.ts` — GraphQL queries + types, and `graphqlAllowingPartials`.
- `src/db.ts` — IDB (`github-releases`, v4): `repos` + `descriptions`.
- `src/state.svelte.ts` — settings (localStorage) + color scheme.
- `src/helpers.ts` — formatters, `delay`, `chunk`, `mergeSorted`.
- `src/models/` — `Release`, `ReleaseGroup` (display logic + `dump()` for Debug).
- `src/components/` — login, settings, releases, release, progress bar, toast.
- `src/types.d.ts` — `KeysWithValsOfType` + the `onintersect` custom event.
- `dist/` — **committed**; the Pages workflow uploads it as-is (see Deploy).

## Coding standards (strict)

- **Svelte 5**: MUST use Runes (`$state`, `$derived`, `$props`). NO legacy (`$:`, `export let`).
- **Logic**: Business logic in `.svelte.ts` models, not components.
- **TypeScript**: No `any`. Explicit return types required. Async = `Promise<T>`.
- **Imports**: extensionless (`moduleResolution: bundler`). A `.svelte.ts`
  module is imported without the `.ts` — `from './loader.svelte'`.
- **Styling**: Scoped CSS, nested. Use vars from `src/global.css`.
- **Comments**: Keep them short. Max 2 lines before a function/declaration;
  max 1 line inside a function.
- **Loader**: Methods are ordered DFS from `start()` — preserve that.
  (`@typescript-eslint/member-ordering` is disabled at the top of the file
  for exactly this reason.)

## Commands

`pnpm types` · `pnpm lint` · `pnpm format` · `pnpm test` · `pnpm build` · `pnpm dev --open`

`types` and `lint` each run two tools (`tsc` + `svelte-check`, `oxlint` +
`eslint`) chained with `;`, so a failure in the first does not stop the second.

## Deploy

`.github/workflows/static.yml` deploys `dist/` to GitHub Pages on push to
`main` — it does **not** run `pnpm build`. Run the build and commit `dist/`
yourself, or the deploy ships the previous bundle.

## Don't break

- **Refresh batches must stay serial** via `reposRefreshChain` — the heaviest
  endpoint, and the one that hit the secondary rate limit. Manifest pages and
  description batches run in parallel; descriptions are the next to serialize
  if rate limits return.
- **Every continuation after an `await` must re-check `isStale(session)`.**
  `start()`, `reset()`, and `clearCachedData()` bump `session`; a bare
  `!this.octokit` check can't tell a superseded chain from a live one once a
  new token has been pasted in. Covers `finishLoad`/`evictStaleData` too.
- **`lastAccessedAt` updates only on full success.** Never on abort paths,
  never to in-memory `settings` — the caught-up divider would jump
  mid-session.
- **`wipeCache` clears IDB twice**, before and after draining the in-flight
  refresh batch, whose queued puts would outlive the first wipe.
- **`settings.disableCache` bypasses the `repos` store entirely** — no
  hydration, no refresh batches, no writes — and `evictStaleData` clears the
  store so an older snapshot can't be served once the toggle goes back off.
- **`evictStaleDescriptions` takes survivors from the loaded feed**, not the
  `repos` store, which is empty on a cache-disabled load and would evict
  every description that load just cached.
- **`Repository.updatedAt` likely does NOT bump on release-body edits.**
  Confirmed bumpers are description edits and pushes. If release notes go
  stale, compare `releases.nodes[0].updatedAt` in the manifest too.

## Gotchas

- **Dual linter**: oxlint-only rules need `// oxlint-disable-next-line <rule>`;
  bare `// eslint-disable-next-line` errors as "unused" when only oxlint flagged.
- **`isolatedDeclarations`**: exported `const` from a template literal
  with `${...}` needs `: string`. Plain template literals infer — prefer
  inlining over interpolation.
- **Bare `{const}` in markup is non-reactive** in Svelte 5.56+. Wrap in
  `$derived` when the value depends on reactive state — see
  `visibleReleases` in `src/components/releases.svelte`.
- **`nodes(ids: [...])` returns null** for unresolvable ids; both
  response types are `Array<T | null>` and filtered. GitHub pairs those
  nulls with a top-level `NOT_FOUND`, and octokit throws on any `errors`
  entry — so the batch queries go through `graphqlAllowingPartials`, which
  recovers the payload from `GraphqlResponseError.data`. Without it one
  deleted repo discards its whole batch of 20.
- **`mergeSorted` sorts its second arg in place.**
- **`src/db.ts` uses a top-level `await`** on the IDB open, capped at 5s so
  a tab blocking an upgrade can't hang app start.
- **Always reach IDB through the `idb*` wrappers in `src/db.ts`** — never the
  raw connection. Each one swallows an unavailable database and a failed
  operation, returning `[]`/`undefined`/void, so callers need no `try`/`catch`
  and the cache can never abort a load.
- **Adding a `GithubRepository` field**: update `reposByIdsQuery`,
  `reposFullQuery`, and the TS interface. Bump the IDB version in
  `src/db.ts` (currently 4) if you need cached entries cleared.

## Testing

`pnpm test` runs `vitest` (only `helpers.test.ts`, covering `mergeSorted`,
`chunk`, and `formatRelativeTime`). The loader and components are verified
manually with a real PAT via `pnpm dev`; the Settings popover has a Debug
button that dumps loader + settings state to the console.
