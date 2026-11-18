# @tsrx/bun-plugin-preact

Bun plugin for compiling `@tsrx/preact` `.tsrx` files.

## Installation

```bash
pnpm add -D @tsrx/bun-plugin-preact
```

## Usage

```ts
import tsrxPreact from '@tsrx/bun-plugin-preact';

await Bun.build({
  entrypoints: ['./src/App.tsrx'],
  outdir: './dist',
  target: 'browser',
  plugins: [tsrxPreact()],
});
```

The plugin compiles `.tsrx` modules with `@tsrx/preact`, runs Bun's TSX transform
for Preact's automatic JSX runtime, and emits sibling-scoped `<style>` blocks
(each styles its siblings and everything below them) as virtual CSS modules.

Bun selects the development or production JSX runtime for each build, as it does
for `.tsx` files. The production runtime needs an automatic JSX setting such as
`"jsx": "react-jsx"` in the tsconfig Bun applies: the nearest one for `Bun.build`,
the working directory's for `Bun.plugin()`. Under the classic `"jsx": "react"`,
the plugin keeps the automatic runtime, but Bun then always uses
`preact/jsx-dev-runtime`.

For `bun:test`, register it from a preload:

```ts
import tsrxPreact from '@tsrx/bun-plugin-preact';

Bun.plugin(tsrxPreact());
```

## Options

- `jsxImportSource`: automatic JSX runtime import source (default: `'preact'`).
- `suspenseSource`: module used by the compiler for Suspense imports.
- `runtimeImports`: helper import mode (`'compiler'` by default, or `'direct'` for
  standalone runtime imports).
- `platform`: optional override/fallback for the compile-time platform. Normally
  the plugin reads `tsrx.platform` from Bun's selected/nearest tsconfig, including
  `extends`. An override must match tsconfig. For `Bun.build`, all three exact
  flags are defined and conflicting definitions are rejected. With `Bun.plugin()`,
  including `bun:test` preloads, flags left in compiled `.tsrx` output are
  replaced with their values.
- `emitCss`: whether to emit virtual CSS imports (default: `true`).
- `include`, `exclude`: regex filters for source files. Under `Bun.plugin()`, an
  instance hands a `.tsrx` file it leaves out to the first registered TSRX plugin
  instance that includes it. When no instance includes the file, Bun loads it as
  it would without a plugin.

When using `runtimeImports: 'direct'`, install the runtime as a direct production
dependency of the package that owns the compiled modules:

```bash
pnpm add @tsrx/preact-runtime
```

Bun may bundle the helpers into its output, but this plugin only emits bare
`@tsrx/preact-runtime/*` imports and does not provide the runtime package.
