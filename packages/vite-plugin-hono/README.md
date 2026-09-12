# `@tsrx/vite-plugin-hono`

Compile `.tsrx` modules with Vite for Hono's server or DOM JSX runtime.

## Setup

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
