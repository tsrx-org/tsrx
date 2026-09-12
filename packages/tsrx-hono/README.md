# @tsrx/hono

Compile TSRX components for Hono's JSX runtimes. The package delegates rendering
to Hono; it does not ship a renderer or add HonoX application features.

Install `@tsrx/hono` with Hono `>=4.13.7 <4.14`. The minimum includes Hono's fixes
for escaping plain strings in JSX boundary and context paths.

Use the package root for server rendering:

```js
import { compile } from '@tsrx/hono';
```

Use the explicit DOM entry for browser rendering:

```js
import { compile } from '@tsrx/hono/dom';
```

Automatic target discovery selects the server entry. DOM builds must select
`@tsrx/hono/dom` explicitly. Build integrations can import `honoTarget` or
`resolveHonoTarget` from `@tsrx/hono/target` to share the same closed
mode-to-runtime mapping.

Server output targets `hono/jsx` and supports Hono's asynchronous server
components. DOM output targets `hono/jsx/dom`; components must render
synchronously. For pending browser work, call Hono's `use(promise)` from a
synchronous component under `Suspense`.

TSRX `@catch (error)` lowers to Hono's experimental `ErrorBoundary` and its
one-argument `fallbackRender(error)` contract. Hono does not provide TSRX's reset
callback shape, so `@catch (error, reset)` is a compiler error. Boundary children
and fallbacks remain ordinary Hono JSX values so Hono performs its normal
escaping.

Multiple element refs are combined without discarding callback cleanup functions
or object-ref clearing. When Hono replaces or removes a ref, the prior callback's
cleanup runs before the next assignment and is not repeated at unmount.
