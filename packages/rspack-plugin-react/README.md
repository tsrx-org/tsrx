# @tsrx/rspack-plugin-react

Rspack plugin for compiling `@tsrx/react` `.tsrx` files.

## Installation

```bash
pnpm add -D @tsrx/rspack-plugin-react
```

## Usage

```ts
import { TsrxReactRspackPlugin } from '@tsrx/rspack-plugin-react';

export default {
  plugins: [new TsrxReactRspackPlugin()],
};
```

The plugin compiles `.tsrx` modules with `@tsrx/react`, chains
`builtin:swc-loader` for React's automatic JSX runtime, and emits sibling-scoped
`<style>` blocks (each styles its siblings and everything below them) through
Rspack's built-in CSS module type.

It also pushes `.tsrx` into `resolve.extensions` and enables `experiments.css`
when unset.

## Options

- `jsxImportSource`: automatic JSX runtime import source (default: `'react'`).
- `runtimeImports`: helper import mode (`'compiler'` by default, or `'direct'` for
  standalone runtime imports).

When using `runtimeImports: 'direct'`, install the runtime as a direct production
dependency of the package that owns the compiled modules:

```bash
pnpm add @tsrx/react-runtime
```

The plugin only emits bare `@tsrx/react-runtime/*` imports and does not provide
the runtime package.
