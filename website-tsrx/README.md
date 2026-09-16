# TSRX website

The site renders with Ripple and uses each target's compiler for the browser
playground's compile API.

From the repository root:

```sh
pnpm --filter tsrx-website dev
pnpm --filter tsrx-website typecheck
pnpm test --project website
pnpm --filter tsrx-website build
```

The website TypeScript/JavaScript check also runs as part of `pnpm typecheck` and
CI, including pull requests that only change website files. Declaration checking
remains enabled.

## Compiler dependencies and types

The playground loads workspace compilers alongside independently released Ripple
and Octane compilers. Its TypeScript configuration resolves `@tsrx/core` and
`@tsrx/core/types` imports to the workspace's common AST declarations so that
multiple core versions do not contribute conflicting global augmentations to one
TypeScript program. These are type-resolution mappings; compiler runtime packages
retain their own dependencies.

The website and the Vue compiler's development environment use the same Vue 3.6
version as the Vue playground, since the Vue JSX Vapor declarations require Vapor
APIs. An explicit catalog `@types/node` dependency keeps the website's Vite peer
resolution aligned with the workspace's Vite instance.

The ES2023 library setting covers the array APIs used by imported compiler code.
Shiki's `HighlighterCore` interface accepts registered custom languages such as
TSRX, alongside its bundled JavaScript, TypeScript, JSX, TSX, and CSS grammars.
