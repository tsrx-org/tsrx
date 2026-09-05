# @tsrx/rspack-plugin-solid

Rspack plugin for compiling `@tsrx/solid` `.tsrx` files.

## Installation

```bash
pnpm add @tsrx/solid solid-js @solidjs/web
pnpm add -D @tsrx/rspack-plugin-solid
```

## Usage

```ts
import { TsrxSolidRspackPlugin } from '@tsrx/rspack-plugin-solid';

export default {
  plugins: [new TsrxSolidRspackPlugin()],
};
```

The plugin compiles `.tsrx` modules with `@tsrx/solid`, runs the final TypeScript
and Solid JSX transform through `babel-loader` with `@babel/preset-typescript` and
`babel-preset-solid`, and emits sibling-scoped `<style>` blocks (each styles its
siblings and everything below them) through Rspack's built-in CSS module type.

It also pushes `.tsrx` into `resolve.extensions` and enables `experiments.css`
when unset. In development mode it adds `solid-refresh/babel` unless you pass
`hot: false`.

## Options

- `hot`: whether to add `solid-refresh/babel` to the Babel pipeline. Defaults to
  `true` unless Rspack is running in production mode.
- `runtimeImports`: helper import mode (`'compiler'` by default, or `'direct'` for
  standalone runtime imports).

When using `runtimeImports: 'direct'`, install the runtime as a direct production
dependency of the package that owns the compiled modules:

```bash
pnpm add @tsrx/solid-runtime
```

The plugin only emits bare `@tsrx/solid-runtime/*` imports and does not provide
the runtime package.
