# Github Releases Activity Feed

## Summary

This application shows the user the latest releases for all Github repositories they have starred on Github.

It uses the Github GraphQL API to fetch releases for repositories that the user has starred, and then displays those releases from newest to oldest.

## Prerequisites
- Node.js 22+

## Setup & Development
- Install dependencies with `pnpm install`
- Run development server with `pnpm dev`
- Build for production with `pnpm build`
- Check TypeScript types with `pnpm types:typescript`
- Check Svelte types with `pnpm types:svelte`
- Lint code using ESLint with `pnpm lint`
- Format code using Prettier with `pnpm format`

## Project Structure
- `src/` - Where all source code lives
- `src/main.ts` - Application entry point
- `src/App.svelte` - Main application component
- `src/global.css` - Global styles
- `src/helpers.ts` - Utility functions
- `src/github.ts` - GitHub API types and queries
- `src/db.ts` - Database setup and interaction
- `src/state.svelte.ts` - Global application state
- `src/components/` - Reusable UI components
- `public/` - Where static assets live

## Code Style
- Use TypeScript for all code (using the conventions below)
- Use Svelte for all UI components (using the conventions below)
- Use ESLint for linting code
- Use Prettier for formatting code
- Prioritize code correctness and clarity
- Changes should not introduce any new type or linting errors
- Do not add comments unless the intent is not clear from the code itself
- Use descriptive variable and function names

## TypeScript Conventions
- Include types for all function parameters and return values
- Use `const` for all variables that are not reassigned
- Use `let` for variables that are reassigned
- Use `unknown` instead of `any` for unknown types
- Use `Promise<T>` instead of `Promise<any>` for async functions
- Use `Record<string, unknown>` instead of `object` for objects with unknown values

## Svelte Conventions
- Use Svelte 5 syntax for all components
- Use the `$state` and `$derived` runes from Svelte 5
- Do not use the `$:` syntax from Svelte 4
- Keep CSS scoped to components

## External Libraries
- Use the `@octokit/core` NPM package to make calls to Github's GraphQL API
- Use the `idb` NPM package to cache data in a local IndexedDB storage
