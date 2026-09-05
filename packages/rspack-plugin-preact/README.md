# @tsrx/rspack-plugin-preact

Rspack plugin for compiling `@tsrx/preact` `.tsrx` files.

## Installation

```bash
pnpm add -D @tsrx/rspack-plugin-preact
```

## Usage

```ts
import { TsrxPreactRspackPlugin } from '@tsrx/rspack-plugin-preact';

export default {
  plugins: [new TsrxPreactRspackPlugin()],
};
```

The plugin compiles `.tsrx` modules with `@tsrx/preact`, chains
`builtin:swc-loader` for Preact's automatic JSX runtime, and emits sibling-scoped
`<style>` blocks (each styles its siblings and everything below them) through
Rspack's built-in CSS module type.

It also pushes `.tsrx` into `resolve.extensions` and enables `experiments.css`
when unset.

## Options

- `jsxImportSource`: automatic JSX runtime import source (default: `'preact'`).
- `suspenseSource`: module used by the compiler for Suspense imports (default:
  `'preact/compat'`).
- `runtimeImports`: helper import mode (`'compiler'` by default, or `'direct'` for
  standalone runtime imports).

When using `runtimeImports: 'direct'`, install the runtime as a direct production
dependency of the package that owns the compiled modules:

```bash
pnpm add @tsrx/preact-runtime
```

The plugin only emits bare `@tsrx/preact-runtime/*` imports and does not provide
the runtime package.
