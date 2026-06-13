# Github Releases Activity Feed

Personalized feed of GitHub releases for starred repos.
**Stack**: Svelte 5 Runes, TypeScript, Vite, `@octokit/core`, `idb`.
**Auth**: PAT in localStorage.

## Layout

- `src/loader.svelte.ts` — incremental-sync pipeline. See `IMPLEMENTATION.md`.
- `src/github.ts` — GraphQL queries + types.
- `src/db.ts` — IDB: `repos` + `descriptions`.
- `src/state.svelte.ts` — settings (localStorage).

## Coding standards (strict)

- **Svelte 5**: MUST use Runes (`$state`, `$derived`, `$props`). NO legacy (`$:`, `export let`).
- **Logic**: Business logic in `.svelte.ts` models, not components.
- **TypeScript**: No `any`. Explicit return types required. Async = `Promise<T>`. Imports must have extensions.
- **Styling**: Scoped CSS. Use vars from `src/global.css`.
- **Comments**: Keep them short. Max 2 lines before a function/declaration; max 1 line inside a function.
- **Loader**: Methods are ordered DFS from `start()` — preserve that.

## Commands

`pnpm types` · `pnpm lint` · `pnpm format` · `pnpm test` · `pnpm build` · `pnpm dev --open`

## Don't break

- **Refresh batches must stay serial** via `reposRefreshChain` — this is
  the heaviest endpoint and the one that hit the secondary rate limit.
  Manifest pages and description batches currently run in parallel; the
  manifest is cheap (id + updatedAt only) but description batches are
  the next thing to serialize if rate limits return.
- **Post-`await` `if (!this.octokit) return` re-checks** in all three
  GitHub call sites close the logout-mid-fetch race. The
  `// eslint-disable-next-line` is intentional.
- **`lastAccessedAt` updates only on full success.** Don't bump it on
  abort paths.
- **`Repository.updatedAt` likely does NOT bump on release-body edits.**
  Only GitHub-staff-confirmed bumpers are description edits and pushes.
  If users report stale release notes, add a fallback (e.g. compare
  `releases.nodes[0].updatedAt` in the manifest too).

## Gotchas

- **Dual linter**: oxlint-only rules need `// oxlint-disable-next-line <rule>`;
  bare `// eslint-disable-next-line` errors as "unused" when only oxlint flagged.
- **`isolatedDeclarations`**: exported `const` from a template literal
  with `${...}` needs `: string`. Plain template literals infer — prefer
  inlining over interpolation.
- **`nodes(ids: [...])` returns null** for unresolvable ids; both
  response types are `Array<T | null>` and filtered.
- **`mergeSorted` sorts its second arg in place.**
- **Adding a `GithubRepository` field**: update both `reposByIdsQuery` and
  the TS interface. Bump the IDB version in `src/db.ts` if you need
  cached entries cleared.

## Testing

`pnpm test` runs `vitest` (only `helpers.test.ts`). The loader is verified
manually with a real PAT via `pnpm dev`.
