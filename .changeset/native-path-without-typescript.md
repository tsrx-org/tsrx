---
'@tsrx/typescript-plugin': minor
'@tsrx/content-mapper': patch
'@tsrx/language-server': minor
---

The native TypeScript 7 path needs no other TypeScript. `@tsrx/typescript-plugin` now reads `tsconfig.json` (with `jsonc-parser`) and resolves `extends` entries and compiler packages itself (the rules of get-tsconfig's resolver, with `resolve-pkg-maps` for `exports`) instead of through TypeScript's JavaScript API, and detects `import.meta.env.platform` flags without TypeScript's scanner; TypeScript is only loaded by the classic path (`tsrx-tsc`, the tsserver plugin, the language server's `classic` backend). `@tsrx/content-mapper` drops its `typescript` dependency and starts about three times faster; `@tsrx/language-server --typescript-backend=native` runs on Volar's plain project host and loads no TypeScript, so a project whose only `typescript` is the native compiler's launcher package works in every editor. Both are tested with the `typescript` package forbidden.
