---
'@tsrx/turbopack-plugin-react': patch
---

`next build` and `next dev` no longer fail with "Can't resolve './App.tsrx.tsx'" when a `.tsrx` module starts with `'use client'`. Such a module is now imported through a small module that keeps the directive and re-exports the compiled component, so Next's client reference resolves, and server components and client modules that import it share one module instance ([#1148](https://github.com/tsrx-org/tsrx/issues/1148)). The new `create_tsrx_react_turbopack_client_rule()` returns that rule; `tsrxReactTurbopack()` installs it ahead of the compile rule.
