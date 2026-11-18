# @tsrx/bun-plugin-vue

Bun plugin for compiling `@tsrx/vue` `.tsrx` files.

## Installation

```bash
pnpm add -D @tsrx/bun-plugin-vue
```

## Usage

```ts
import tsrxVue from '@tsrx/bun-plugin-vue';

await Bun.build({
  entrypoints: ['./src/App.tsrx'],
  outdir: './dist',
  target: 'browser',
  plugins: [tsrxVue()],
});
```

The plugin compiles `.tsrx` modules with `@tsrx/vue`, runs `vue-jsx-vapor`'s
macros and Vapor transform, strips the remaining TypeScript syntax with Bun, and
emits sibling-scoped `<style>` blocks (each styles its siblings and everything
below them) as virtual CSS modules.

For `bun:test`, register it from a preload:

```ts
import tsrxVue from '@tsrx/bun-plugin-vue';

Bun.plugin(tsrxVue());
```

A preload compiles `.tsrx` modules and leaves every other module to Bun. It
doesn't add `vaporInteropPlugin` to `createVaporApp()` calls, as `Bun.build()`
does, so install it yourself where you need it:

```ts
import { createVaporApp, vaporInteropPlugin } from 'vue';

createVaporApp(App).use(vaporInteropPlugin).mount('#app');
```

Preloads cover `.tsrx` modules that export plain values. A component with a
template fails to load under `bun:test`, because Vue 3.6's `node` entry, which
Bun's runtime resolves, has no Vapor APIs such as `template`.

## Options

- `vapor`: options forwarded to `vue-jsx-vapor`. As in the Vite plugin, its macros
  run by default (`macros: false` turns them off), their `include` and `exclude`
  options see a module as `<file>.tsrx.tsx`, and the plugin serves the helper
  modules they import. `defineStyle()` stylesheets must be CSS, since Bun can't
  compile Sass, Less or Stylus.
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
pnpm add @tsrx/vue-runtime
```

Bun may bundle the helpers into its output, but this plugin only emits bare
`@tsrx/vue-runtime/*` imports and does not provide the runtime package.
