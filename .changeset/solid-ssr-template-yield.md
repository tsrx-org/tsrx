---
'@tsrx/solid': patch
'@tsrx/vite-plugin-solid': patch
---

`@tsrx/solid`'s `compile` takes a new `ssr` option for a server build, and `@tsrx/vite-plugin-solid` sets it from Vite's `ssr` flag. In a server build, TSRX2034 (a `yield` in a template value that Solid's JSX compiler moves out of its generator) also follows the SSR output that vite-plugin-solid compiles with its `ssr` option (`generate: 'ssr'`, `hydratable: true`). So `<input {...bag} title={yield 1} />` is now reported at the `yield`, instead of the server build failing later with `A 'yield' expression is only allowed in a generator body.` in compiled code. That output moves every attribute beside a host spread, the children of a host element with a spread, an attribute value with an element in it, and a `textContent` value beside another dynamic value.

A `yield` that only the DOM output moves is still reported in a server build, since the app's client build fails. Client builds and the editor keep the DOM output's rules, and the compiled code is the same either way. The Rspack and Bun plugins don't pass the option, so their checks follow the DOM output only.
