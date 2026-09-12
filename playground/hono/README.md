# Hono Playground

This playground exercises the Hono JSX DOM target through Vite. It is
intentionally DOM-only, so its Vite config selects `mode: 'dom'` explicitly.

## Run

```bash
pnpm install
pnpm run dev
```

The source uses `@tsrx/hono/dom` in `tsconfig.json` so the TypeScript plugin and
Vite transform select the same target.

## Using server and DOM targets in one project

For an application that has both server-rendered and browser code, keep one Vite
config but run two builds. Map Vite's explicit `client` mode to the Hono DOM
compiler and use the default build for the server compiler:

```js
import { defineConfig } from 'vite';
import tsrxHono from '@tsrx/vite-plugin-hono';

export default defineConfig(({ mode }) => ({
  plugins: [
    tsrxHono({
      mode: mode === 'client' ? 'dom' : 'server',
    }),
  ],
}));
```

Run the builds separately, using the entrypoint and output settings required by
the application:

```json
{
  "scripts": {
    "build:client": "vite build --mode client",
    "build:server": "vite build",
    "build": "pnpm build:client && pnpm build:server"
  }
}
```

Each build has one Hono mode. Do not split server and DOM compilation by file path
with `include` or `exclude`; a module shared by both entrypoint graphs is compiled
once per build and must be valid for both runtimes.
