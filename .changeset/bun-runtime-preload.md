---
'@tsrx/bun-plugin-react': patch
'@tsrx/bun-plugin-preact': patch
'@tsrx/bun-plugin-solid': patch
'@tsrx/bun-plugin-vue': patch
'@tsrx/bun-plugin-hono': patch
---

The Bun plugins now work as `bun:test` preloads registered with `Bun.plugin()`.

- `@tsrx/bun-plugin-vue` no longer fails every test file with "Expected module mock to return an object". Its `createVaporApp` interop rewrite now runs only in `Bun.build()`, so a preload leaves every module other than `.tsrx` to Bun, and `require()` of CommonJS project files keeps working. Under a preload, add `vaporInteropPlugin` to `createVaporApp()` yourself. Vue preloads cover `.tsrx` modules that export plain values: a component with a template fails under `bun:test`, because Vue 3.6's `node` entry has no Vapor APIs. In `Bun.build()`, the rewrite now skips `node_modules` in its filter and loads `.js` files with Bun's default `jsx` loader ([#1151](https://github.com/tsrx-org/tsrx/issues/1151)).
- `@tsrx/bun-plugin-hono` now loads components with a `<style>` block, which failed with `Expected loader to be one of "js", …`. Its virtual stylesheets now use the `file` namespace, the only one where Bun's runtime accepts the `css` loader, as the other Bun plugins do ([#1152](https://github.com/tsrx-org/tsrx/issues/1152)).
- `include`, `exclude` and several plugin instances now work under `Bun.plugin()`, which calls only the first matching hook and fails with "onLoad() expects an object returned" when it returns nothing. An instance hands a `.tsrx` file it leaves out to the first registered TSRX plugin instance that includes it, or else returns what Bun loads without a plugin (the file's path as the default export). It serves stylesheets that any instance compiled.
