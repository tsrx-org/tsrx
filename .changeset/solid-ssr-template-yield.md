---
'@tsrx/solid': patch
'@tsrx/vite-plugin-solid': patch
'@tsrx/bun-plugin-solid': patch
---

TSRX2034 (a `yield` in a template value that Solid's JSX compiler moves out of its generator) can now follow babel-preset-solid's SSR output in a server build. `@tsrx/solid`'s `compile` takes a new `ssr` option for that. `@tsrx/vite-plugin-solid` takes `ssr` too: set it as you set `vite-plugin-solid`'s own `ssr` option, and a server build is then compiled with `ssr: true`. `@tsrx/bun-plugin-solid` sets it when its `solid` options have `generate: 'ssr'` and `hydratable: true`. So `<input {...bag} title={yield 1} />` is reported at the `yield` in such a server build, instead of the build failing later with `A 'yield' expression is only allowed in a generator body.` in compiled code.

The hydratable SSR output moves every attribute beside a host spread except refs, event handlers and `prop:` values, the children of a host element with a spread, an attribute value with an element in it, and a `textContent` value grouped with a neighbouring dynamic value. Every `yield` a client build reports is reported in a server build too, since the app's client build fails on it. The SSR check counts a value that may fold into a constant as folded and drops the `yield`s only it finds there, so such a `yield` goes unreported rather than reported though the compiler drops it.

Client builds, server builds with the option off (such as a plain `solid()` server build or a Vitest `node` environment), the editor and the Rspack plugin keep the DOM output's rules, and the compiled code is the same either way.
