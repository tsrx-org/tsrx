# @tsrx/hono

Compile TSRX to Hono JSX for server rendering or the browser DOM renderer.

```sh
pnpm add hono @tsrx/hono
```

## Choose a compiler mode

| Mode   | Compiler         | JSX import source |
| ------ | ---------------- | ----------------- |
| Server | `@tsrx/hono`     | `hono/jsx`        |
| DOM    | `@tsrx/hono/dom` | `hono/jsx/dom`    |

Both modes support TSRX template blocks, conditional and list rendering, switch
statements, dynamic tags, sibling-scoped styles, themes, and error boundaries.
Hono handles rendering, hooks, context, and Suspense through its own runtime APIs.
Authored `class` attributes are preserved.

Server components may be async and use `await` in setup code and in `@for`,
`@empty`, `@switch`, and `@if` bodies; a loop body finishes one item before it
starts the next. DOM components must be synchronous; use Hono's `use(promise)`
with a pending boundary for asynchronous work. `@catch (error)` is supported, but
Hono does not provide the reset callback used by some other targets.

```tsx
import { use } from 'hono/jsx';

const profilePromise = Promise.resolve({ name: 'Ada' });

function Profile() @{
  const profile = use(profilePromise);
  <p>Hello, {profile.name}!</p>
}

export function App() @{
  @try {
    <Profile />
  } @pending {
    <p>Loading profile...</p>
  }
}
```

The DOM validator diagnoses explicit async component references that it can
resolve statically within the module. It does not infer arbitrary Promise returns,
inter-module values, or object members that may have been overwritten by unknown
spreads or computed properties.

## Build integrations

Use [@tsrx/vite-plugin-hono](../vite-plugin-hono/README.md) or
[@tsrx/bun-plugin-hono](../bun-plugin-hono/README.md) with an explicit
`mode: 'server'` or `mode: 'dom'`. Separate server and browser build graphs rather
than selecting modes per file. The Hono mode is independent of `tsrx.platform`.

For editor diagnostics in DOM projects, set
`"tsrx": { "compiler": "@tsrx/hono/dom" }` in `tsconfig.json`.

## Compiler API

```js
import { compile } from '@tsrx/hono/dom';

const { code, css, map } = compile(source, 'App.tsrx');
```

The compiler returns TSX plus extracted CSS and a source map. A subsequent JSX
transform must use the import source matching the selected mode. The build plugins
perform that transform and integrate extracted CSS.

Try both modes and the supported language examples in the
[TSRX playground](https://tsrx.dev/playground).
