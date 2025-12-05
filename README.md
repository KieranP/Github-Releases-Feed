# Github Releases Feed Viewer

A personalized activity feed of software releases for your starred GitHub repositories.

Designed to help developers keep up with software updates without manually checking repositories or relying on GitHub's broken activity feed.

The Github Releases Feed Viewer is hosted at https://kieranp.github.io/Github-Releases-Feed/ , but you can also run it locally using the commands below.

## Features

- **Personalized Feed**: Fetches releases from your starred repositories via the GitHub GraphQL API.
- **Smart Grouping**: Groups multiple releases from the same repository to reduce clutter.
- **Filtering**: Options to hide pre-releases or ignore specific repositories without unstarring them.
- **Dark Mode**: Full dark mode support based on system preference or user toggle.

## Authentication

This application requires a GitHub Personal Access Token (PAT) to fetch data.

The token and all data fetched via the Github API are stored in your browsers local storage; **NO data ever leaves your computer**!

1. Generate a [Fine-grained Personal Access Token](https://github.com/settings/personal-access-tokens/new?name=Github+Releases+Feed&expires_in=none&starring=read).
2. Enter the token into the application.

## Local Development

```bash
# Running
pnpm install
pnpm dev --open

# Type Checking, Linting, and Formatting
pnpm types
pnpm lint
pnpm format
```

## Production Build

```bash
pnpm install
pnpm build
pnpx serve dist
```

## License

This project is licensed under the GNU General Public License v3.0.

In short, you can use this repository as you see fit, but if you make any changes to the code, please open source them under the same license.

See the [LICENSE](LICENSE) file for more details.
