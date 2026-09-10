# Github Releases Feed Viewer

A personalized activity feed of releases from your starred GitHub repositories — a way to keep up with software updates without checking repos by hand or fighting GitHub's activity feed.

Hosted at https://kieranp.github.io/Github-Releases-Feed/, or run it locally with the commands below.

## Features

- **Personalized feed** — releases from the last four weeks across your starred repos, via the GitHub GraphQL API.
- **Incremental sync** — repos are cached locally and only refetched when they've actually changed, so later loads are much cheaper than the first.
- **Grouping** — multiple releases from one repo are collapsed together, with a "You're All Caught Up" divider marking where you left off.
- **Filtering** — hide pre-releases, hide releases you've seen, or ignore specific repos (or just their pre-releases) without unstarring them.
- **Keyboard navigation** — up and down arrows move a cursor between release groups, scrolling each to the top. Scroll away with the mouse and the next press picks up from what's on screen.
- **Release notes** — rendered inline, collapsed by default, expandable per release or globally.
- **Dark mode** — follows system preference, with a manual toggle.
- **Reduced motion** — follows system preference: scrolling settles instantly, and the loading spinner fades instead of bouncing.

## Authentication

You need a GitHub Personal Access Token:

1. Generate a [fine-grained PAT](https://github.com/settings/personal-access-tokens/new?name=Github+Releases+Feed&expires_in=none&starring=read).
2. Enter it into the application.

The token and settings live in local storage, cached repository data in IndexedDB — **no data ever leaves your computer**.

Settings popover controls:

- **Clear Cache** — wipe the local caches and reload from GitHub.
- **Logout** — the same, plus removing the token.
- **Disable Repo Cache** — skip the incremental sync and refetch every starred repo in full on each load. Slower and far heavier on your rate limit, but useful if you suspect the cache is stale. Descriptions stay cached either way.

## Development

```bash
pnpm install
pnpm dev --open

pnpm types    # tsc + svelte-check
pnpm lint     # oxlint + eslint
pnpm format
pnpm test
```

## Production build

```bash
pnpm build
pnpx serve dist
```

`dist/` is committed — the GitHub Pages workflow deploys it as-is rather than building, so run `pnpm build` and commit the result before pushing to `main`.

## License

GNU General Public License v3.0 — use this repository as you see fit, but open source any changes under the same license. See [LICENSE](LICENSE) for details.
