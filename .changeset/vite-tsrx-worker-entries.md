---
'@tsrx/core': patch
'@tsrx/vite-plugin-react': patch
'@tsrx/vite-plugin-preact': patch
'@tsrx/vite-plugin-solid': patch
'@tsrx/vite-plugin-vue': patch
'@tsrx/vite-plugin-hono': patch
---

A `.tsrx` module imported as a web worker (`import MyWorker from './worker.tsrx?worker'`)
now starts in `vite dev`. Vite requested the entry as
`worker.tsrx?worker_file&type=module`, which its dev server served as a static
file, and the plugins skipped the query-suffixed id, so the browser received
raw TSRX source and the worker failed to load. The Vite plugins now route that
request through Vite's transform pipeline and compile the entry. In the Solid
and Vue plugins, editing the entry also invalidates the cached worker module,
so the next page load gets the new code. Production builds were not affected.

`@tsrx/core` gains a `@tsrx/core/vite/worker` entry point with the shared
dev-server middleware and id helper.
