---
'@tsrx/vue': minor
'@tsrx/vue-runtime': minor
'@tsrx/vite-plugin-vue': minor
'@tsrx/rspack-plugin-vue': minor
'@tsrx/bun-plugin-vue': minor
---

The Vue packages now need `vue` 3.6 or later, including 3.6.0's prereleases (`>=3.6.0-0`), and `vue-jsx-vapor` 3.2.27 or a later stable release (`>=3.2.27`). Until Vue 3.6.0 is stable, install it as `"vue@^3.6.0-0"`.

- Vue 3.5 has no Vapor, so a Vue 3.5 project never built. Under npm, the old `vue >=3.5` also rejected every Vue 3.6 prerelease, so the documented `npm install` failed with ERESOLVE whichever Vue it named.
- `vue-jsx-vapor` 3.2.27 is the first release that fixes both a dev worker that imports a module exporting a function (#186) and the space after an element that a `{…}` container renders last (#870).
- A project on `vue-jsx-vapor` 3.2.26 or earlier now gets an unmet peer warning from pnpm, and an install error under pnpm's `strict-peer-dependencies`. That is why this is a minor release.
