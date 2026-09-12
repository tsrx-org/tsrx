# @tsrx/bun-plugin-hono

Bun plugin for compiling `.tsrx` files for Hono's JSX runtimes. It defaults to
Hono's server renderer; browser builds must select DOM mode explicitly.

## Installation

Install the plugin with the Hono compiler and a supported Hono release:

```bash
pnpm add @tsrx/hono hono@">=4.13.7 <4.14"
pnpm add -D @tsrx/bun-plugin-hono
```

## Server mode

```ts
import tsrxHono from '@tsrx/bun-plugin-hono';

await Bun.build({
  entrypoints: ['./src/App.tsrx'],
  outdir: './dist',
  target: 'bun',
  plugins: [tsrxHono()],
});
```

The default mode compiles with `@tsrx/hono` and transforms JSX through `hono/jsx`.
Hono-supported asynchronous server components remain valid.

## DOM mode

```ts
import tsrxHono from '@tsrx/bun-plugin-hono';

await Bun.build({
  entrypoints: ['./src/App.tsrx'],
  outdir: './dist',
  target: 'browser',
  plugins: [tsrxHono({ mode: 'dom' })],
});
```

DOM mode compiles with `@tsrx/hono/dom` and transforms JSX through `hono/jsx/dom`.
Hono DOM components render synchronously; use Hono's `use(promise)` inside the
experimental `Suspense` API for pending browser work. Locally obvious async
components are compiler errors; imported and inferred Promise returns are left to
type-aware tooling and reported only when definitely Promise-like.

The plugin emits sibling-scoped `<style>` blocks as owned virtual CSS modules.
When source maps are enabled in `Bun.build`, Bun emits maps for the generated
JavaScript and CSS outputs.

For `bun:test`, register one mode from a preload:

```ts
import tsrxHono from '@tsrx/bun-plugin-hono';

Bun.plugin(tsrxHono({ mode: 'dom' }));
```

## Options

- `mode`: `'server'` (default) or `'dom'`.
- `runtimeImports`: helper import mode (`'compiler'` by default, or `'direct'`).
- `platform`: optional compile-time platform override. Normally the plugin reads
  `tsrx.platform` from Bun's selected or nearest tsconfig. An override must agree
  with tsconfig; `Bun.build` receives all three exact platform definitions.
- `emitCss`: whether to emit virtual CSS imports (default: `true`).
- `include`, `exclude`: regular-expression filters for source files.

With `runtimeImports: 'direct'`, add `@tsrx/core` as a direct production
dependency because compiled modules import its runtime helpers.

This package selects Hono's JSX runtime; it does not provide a renderer or add
HonoX application features. It is a dedicated Hono target rather than a React
compatibility mode. Hono owns boundary escaping and DOM ref behavior; see
`@tsrx/hono` for the complete supported runtime contract.
