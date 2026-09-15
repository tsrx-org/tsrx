# @tsrx/bun-plugin-hono

Bun plugin for compiling `@tsrx/hono` `.tsrx` files.

## Installation

```bash
pnpm add hono @tsrx/hono
pnpm add -D @tsrx/bun-plugin-hono
```

Install `@tsrx/hono` directly so the TSRX TypeScript plugin can discover the
compiler from the application workspace under strict package managers.

## Usage

```ts
import tsrxHono from '@tsrx/bun-plugin-hono';

await Bun.build({
  entrypoints: ['./src/App.tsrx'],
  outdir: './dist',
  plugins: [tsrxHono()],
});
```

The default `server` mode targets `hono/jsx`. Use `tsrxHono({ mode: 'dom' })` for
browser builds targeting `hono/jsx/dom`. The plugin runs Bun's automatic JSX
transform and emits TSRX `<style>` blocks as virtual CSS modules.

To build server and browser entrypoints from one script, run two Bun builds and
share only the options that are independent of the Hono runtime:

```ts
const common = {
  splitting: true,
  sourcemap: 'external',
};

for (const target of [
  { mode: 'dom', entrypoint: './src/client-entry.tsrx', outdir: './dist/client' },
  {
    mode: 'server',
    entrypoint: './src/server-entry.tsrx',
    outdir: './dist/server',
  },
] as const) {
  const result = await Bun.build({
    ...common,
    entrypoints: [target.entrypoint],
    outdir: target.outdir,
    plugins: [tsrxHono({ mode: target.mode })],
  });

  if (!result.success) throw new Error(`Bun build failed: ${target.mode}`);
}
```

One plugin instance and one Bun build use one Hono mode. A `.tsrx` module used by
both entrypoint graphs is compiled separately in each build and must be valid for
both runtimes.

For `bun:test`, register the plugin from a preload:

```ts
import tsrxHono from '@tsrx/bun-plugin-hono';

Bun.plugin(tsrxHono());
```

Options are `mode`, `runtimeImports`, `platform`, and `emitCss`.

The plugin reads `tsrx.platform` (`web`, `ios`, or `android`) from the active
build tsconfig and specializes `import.meta.env.platform.*` at compile time.
`platform` is an optional explicit override and is independent of the Hono
`server`/`dom` mode.

`runtimeImports: 'direct'` is a limited helper-import mode for Hono: shared
helpers use `@tsrx/core/runtime/*`, while Hono-specific adapters still use
`@tsrx/hono/*` because Hono has no separate standalone runtime package. If the
compiled modules are published or built with direct imports, declare both packages
directly:

```bash
pnpm add @tsrx/core @tsrx/hono hono
```
