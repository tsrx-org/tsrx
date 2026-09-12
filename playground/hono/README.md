# Hono DOM Playground

This is the maintained interactive example for TSRX's explicit Hono DOM mode. It
compiles `.tsrx` with `@tsrx/hono/dom`, transforms it with
`@tsrx/vite-plugin-hono` in `{ mode: 'dom' }`, and renders through `hono/jsx/dom`.
It demonstrates state, TSRX control flow, sibling-scoped styles, Hono's
experimental `Suspense` plus `use(promise)`, and an object ref.

```bash
pnpm --filter @tsrx/hono-playground dev
pnpm --filter @tsrx/hono-playground typecheck
pnpm --filter @tsrx/hono-playground build
```

Server mode is documented and covered by focused tests instead of a second
playground. It uses the default `@tsrx/hono` entry and `hono/jsx` runtime. TSRX
does not provide a renderer or HonoX application features.
