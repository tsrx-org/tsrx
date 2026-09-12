# `@tsrx/vite-plugin-hono`

Compile `.tsrx` modules with Vite for Hono's server or DOM JSX runtime.

## Setup

Install the compiler, the plugin, and a Hono release in the supported range:

```bash
pnpm add hono@">=4.13.7 <4.14"
pnpm add -D @tsrx/hono @tsrx/vite-plugin-hono
```

Server rendering is the default:

```js
import { defineConfig } from 'vite';
import { tsrxHono } from '@tsrx/vite-plugin-hono';

export default defineConfig({
  plugins: [tsrxHono()],
});
```

Select DOM mode explicitly for browser rendering:

```js
export default defineConfig({
  plugins: [tsrxHono({ mode: 'dom' })],
});
```

One plugin instance processes one mode. Server mode uses `@tsrx/hono` with
`hono/jsx`; DOM mode uses `@tsrx/hono/dom` with `hono/jsx/dom`.

The plugin also preserves TSRX source maps, emits scoped styles as virtual CSS,
and registers `.tsrx` modules with Vite's dependency scanner.

Use a matching TypeScript project: `@tsrx/hono` with `hono/jsx` for server mode,
or `@tsrx/hono/dom` with `hono/jsx/dom` for DOM mode. Hono DOM components render
synchronously; use `use(promise)` under Hono's experimental `Suspense` for pending
work. Locally obvious async components are compiler errors, while imported or
inferred Promise returns are decided by type-aware tooling only when definite.

Hono supplies both renderers. This dedicated target does not route through React
compatibility and does not add HonoX application features. Boundary escaping and
ref behavior follow the supported Hono runtime; see `@tsrx/hono` for the complete
runtime contract.
