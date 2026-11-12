---
'@tsrx/core': patch
'@tsrx/vite-plugin-react': patch
'@tsrx/vite-plugin-preact': patch
'@tsrx/vite-plugin-solid': patch
'@tsrx/vite-plugin-vue': patch
'@tsrx/vite-plugin-hono': patch
---

The Vite plugins restart the dev server when a tsconfig change selects a different `tsrx.platform`, including a change to an `extends` target or project reference outside the Vite root. `@tsrx/core/config` exports `getBuildPlatformConfigFiles` for the files a platform comes from. Before, both `.tsrx` modules and ordinary modules kept the previous platform until you restarted Vite by hand.

Without a configured platform, the Vite plugins now reject an `import.meta.env.platform` flag in an ordinary `.ts`, `.tsx` or JavaScript module with the same "Platform flag usage requires a configured TSRX platform" error a `.tsrx` module gets. Before, the build succeeded and the bundle failed when it ran (`(void 0).web`).
