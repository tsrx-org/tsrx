# @tsrx/hono

Compile TSRX components for Hono's JSX runtimes. The package delegates rendering
to Hono; it does not ship a renderer or add HonoX application features.

## Installation

Install `@tsrx/hono` with Hono `>=4.13.7 <4.14`. The minimum includes Hono's fixes
for escaping plain strings in JSX boundary and context paths. Releases outside
that bounded range are not part of the current compatibility claim.

```bash
pnpm add hono@">=4.13.7 <4.14"
pnpm add -D @tsrx/hono
```

This is a dedicated Hono target, not a React-compatibility configuration.

## Server mode (default)

Use the package root for server rendering:

```js
import { compile } from '@tsrx/hono';
```

For Vite, install `@tsrx/vite-plugin-hono` and use `tsrxHono()` with no mode. For
Bun, install `@tsrx/bun-plugin-hono` and likewise use `tsrxHono()`. Both compile
to `hono/jsx` by default. Hono-supported asynchronous server components remain
valid.

## DOM mode

Use the explicit DOM entry for browser rendering:

```js
import { compile } from '@tsrx/hono/dom';
```

Automatic target discovery selects the server entry. DOM builds must select
`@tsrx/hono/dom` explicitly. Build integrations can import `honoTarget` or
`resolveHonoTarget` from `@tsrx/hono/target` to share the same closed
mode-to-runtime mapping.

DOM output targets `hono/jsx/dom`; components must render synchronously. For
pending browser work, call Hono's `use(promise)` from a synchronous component
under `Suspense`:

```tsrx
import { Suspense, use } from 'hono/jsx/dom';

const profile = fetch('/api/profile').then((response) => response.json());

function Profile() @{
  const data = use(profile);
  <p>{data.name}</p>
}

export function App() @{
  <Suspense fallback={<p>Loading…</p>}>
    <Profile />
  </Suspense>
}
```

The compiler reports rendered, same-file `async` components and component-scope
`await` because those cases are conclusive from source syntax. Imported, inferred,
aliased, generic, overloaded, member-expression, or mixed-return cases are left to
TypeScript. The type-aware tooling reports a rendered tag only when the project
types prove its result is definitely Promise-like.

## Boundaries, escaping, and refs

TSRX `@catch (error)` lowers to Hono's experimental `ErrorBoundary` and its
one-argument `fallbackRender(error)` contract. Hono does not provide TSRX's reset
callback shape, so `@catch (error, reset)` is a compiler error. Boundary children
and fallbacks remain ordinary Hono JSX values so Hono performs its normal
escaping. Hono's `Suspense`, `ErrorBoundary`, and streaming-related boundary APIs
are experimental and may change; the declared peer range is the tested boundary.

Multiple element refs are combined without discarding callback cleanup functions
or object-ref clearing. When Hono replaces or removes a ref, the prior callback's
cleanup runs before the next assignment and is not repeated at unmount.

## TypeScript tooling

For a server project, automatic discovery chooses `@tsrx/hono`, or you can make
the default explicit:

```json
{
  "tsrx": { "compiler": "@tsrx/hono" },
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "hono/jsx",
    "plugins": [{ "name": "@tsrx/typescript-plugin" }]
  }
}
```

A browser project must explicitly use `@tsrx/hono/dom` with
`jsxImportSource: "hono/jsx/dom"`.

## MCP

TSRX MCP accepts `hono` as the target and keeps its generic execution vocabulary:
omitted mode and `server` use `@tsrx/hono`; `client` uses `@tsrx/hono/dom`.
Results expose the effective `compilerEntry`. There is no Hono-specific `dom` MCP
mode, and a failed DOM load does not fall back to the server compiler.

## Scope

TSRX compiles the language onto Hono's maintained renderers. HonoX routing,
navigation, Server Actions, and other application-framework features remain the
responsibility of HonoX and are outside this package.
