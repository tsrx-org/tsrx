---
'@tsrx/vite-plugin-react': patch
'@tsrx/vite-plugin-preact': patch
'@tsrx/vite-plugin-solid': patch
'@tsrx/vite-plugin-vue': patch
'@tsrx/vite-plugin-hono': patch
---

A relative `url()` in a component's `<style>` block now resolves from the
component's directory. The Vite plugins gave the extracted stylesheet a
`\0`-prefixed virtual module id, so Vite resolved relative references against a
directory that does not exist, left `url(./asset.svg)` unchanged, and printed a
warning. The stylesheet id is now the component's path plus the style query, so
the asset resolves as it does in a plain CSS file, in both `vite dev` and builds.
