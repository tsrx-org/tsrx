---
'@tsrx/vite-plugin-react': patch
'@tsrx/vite-plugin-preact': patch
'@tsrx/vite-plugin-solid': patch
'@tsrx/vite-plugin-vue': patch
'@tsrx/vite-plugin-hono': patch
---

Relative references in a component's `<style>` block now resolve from the
component's directory. The Vite plugins gave the extracted stylesheet a
`\0`-prefixed virtual module id, so Vite resolved relative references against a
directory that does not exist. A relative `@import` failed the build with
`ENOENT`, and a relative `url()` stayed unresolved and printed a warning. The stylesheet id is now the component's path
plus the style query, so `@import './shared.css'` and `url(./asset.svg)` resolve
as they do in a plain CSS file, in both `vite dev` and builds.
