# @tsrx/turbopack-plugin-react

Turbopack integration for compiling `@tsrx/react` `.tsrx` files in Next.js.

## Installation

```bash
pnpm add @tsrx/react react react-dom
pnpm add -D @tsrx/turbopack-plugin-react next
```

## Usage

```ts
import tsrxReactTurbopack from '@tsrx/turbopack-plugin-react';

export default tsrxReactTurbopack({
  reactStrictMode: true,
});
```

The helper installs Turbopack rules that compile `.tsrx` modules with
`@tsrx/react` and return the result as `*.tsx` so Next's React pipeline can finish
the JSX transform. Sibling-scoped `<style>` blocks (each styles its siblings and
everything below them) are emitted through a sibling `?tsrx-css&lang.css` import
and handed back to Turbopack as a CSS module.

It also adds `.tsrx` to `turbopack.resolveExtensions`.

## Options

Pass Next.js config as the first argument. The second argument is optional:

- `runtimeImports`: helper import mode (`'compiler'` by default, or `'direct'` for
  standalone runtime imports).

```ts
export default tsrxReactTurbopack({}, { runtimeImports: 'direct' });
```

When using `runtimeImports: 'direct'`, install the runtime as a direct production
dependency of the package that owns the compiled modules:

```bash
pnpm add @tsrx/react-runtime
```

The helper only emits bare `@tsrx/react-runtime/*` imports and does not provide
the runtime package.
