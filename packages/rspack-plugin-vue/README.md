# @tsrx/rspack-plugin-vue

Rspack plugin for compiling `@tsrx/vue` `.tsrx` files.

## Installation

```bash
pnpm add @tsrx/vue vue vue-jsx-vapor
pnpm add -D @tsrx/rspack-plugin-vue
```

## Usage

```ts
import { TsrxVueRspackPlugin } from '@tsrx/rspack-plugin-vue';

export default {
  plugins: [new TsrxVueRspackPlugin()],
};
```

The plugin compiles `.tsrx` modules with `@tsrx/vue`, runs the result through
`vue-jsx-vapor`, strips the remaining TypeScript syntax with `builtin:swc-loader`,
and emits sibling-scoped `<style>` blocks (each styles its siblings and everything
below them) through Rspack's built-in CSS module type.

It also pushes `.tsrx` into `resolve.extensions` and enables `experiments.css`
when unset. Editor typechecking should set `jsxImportSource: 'vue-jsx-vapor'`.

## Options

- `vapor`: options forwarded to `vue-jsx-vapor`. By default the plugin enables
  macros and uses `runtimeModuleName: 'vue-jsx-vapor'`.
- `runtimeImports`: helper import mode (`'compiler'` by default, or `'direct'` for
  standalone runtime imports).

When using `runtimeImports: 'direct'`, install the runtime as a direct production
dependency of the package that owns the compiled modules:

```bash
pnpm add @tsrx/vue-runtime
```

The plugin only emits bare `@tsrx/vue-runtime/*` imports and does not provide the
runtime package.
