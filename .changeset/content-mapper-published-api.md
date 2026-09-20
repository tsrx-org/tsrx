---
'@tsrx/content-mapper': patch
---

Quote string-literal export names in the compile-failure stub so re-exports such as `export { "foo-bar" as baz }` stay valid TypeScript, and declare `@tsrx/typescript-plugin` as a runtime dependency (publishing that package's `src` so the deep imports resolve) so the published `./mapper` entry can load outside this workspace.
