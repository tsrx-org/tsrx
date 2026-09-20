---
'@tsrx/content-mapper': patch
---

Bundle the `@tsrx/content-mapper/mapper`, `/rpc` and `/protocol` exports into `dist/` so they import from the installed package: they resolved to `src/`, which imports `@tsrx/typescript-plugin/src/*`, a path that package does not publish and that is not a dependency of the mapper. The compile-failure export stub now quotes arbitrary module namespace names (`export { "foo-bar" as baz } from`, `export * as "ns-name" from`) instead of emitting them unquoted, and the bench harness reads a `--project` tsconfig as JSONC (comments and trailing commas) and splices its `contentMappers` entry in as an edit.
