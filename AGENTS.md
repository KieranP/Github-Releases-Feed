# Github Releases Activity Feed

## Overview

Personalized feed of GitHub releases for starred repos.
**Stack**: Svelte 5 (Runes), TypeScript, Vite, `@octokit/core`, `idb`.
**Auth**: Github Personal Access Token in localStorage.
**Data**: GraphQL API, IndexedDB cache.

## Architecture

- **`src/loader.svelte.ts`**: Fetches data, builds `Release` objects, computes `ReleaseGroup`s.
- **`src/state.svelte.ts`**: Global settings (dark mode, filters), persists to localStorage.
- **Data Flow**: Fetch repos -> Flatten & Sort -> Group by Repo -> Lazy fetch HTML descriptions (cached in IDB).

## Coding Standards (STRICT)

- **Svelte 5**: MUST use Runes (`$state`, `$derived`, `$props`). NO legacy (`$:`, `export let`).
- **Logic**: Business logic in `.svelte.ts` models, not components.
- **TypeScript**: No `any`. Explicit return types required. Async = `Promise<T>`. Imports must have extensions.
- **Styling**: Scoped CSS. Use vars from `src/global.css`.

## Verification & Commands

- **Type Check**: `pnpm types:typescript` (TS) & `pnpm types:svelte` (Svelte).
- **Lint**: `pnpm lint:oxlint` & `pnpm lint:eslint`.
- **Format**: `pnpm format`.
- **Build**: `pnpm build`.

## Implementation Details

- **Lazy Loading**: `Release.svelte` uses `{@attach ...}` + `IntersectionObserver` (`src/helpers.ts`) for descriptions.
- **Caching**: `idb` stores HTML descriptions. Key: `${releaseId}-${updatedAt}`.
