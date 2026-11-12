---
'@tsrx/typescript-plugin': patch
---

On TypeScript 5.9 and 6 (the classic `tsrx-tsc` path), `tsrx-tsc` no longer writes the editor-only `ImportMetaEnv` / `ImportMeta` globals into the declaration files of `.tsrx` modules that use `import.meta.env.platform` flags. Before, a consumer that imported two such modules failed with `TS2374: Duplicate index signature`, and every emitted module forced the library's platform onto the consumer's `import.meta.env` types. Authored global augmentations are kept. The TypeScript 7 native path is not covered yet.

An incremental build (`tsrx-tsc -b`, or `incremental: true`) that has nothing to rebuild keeps declaration files written before this release; run it once with `--force`, or delete the output, to rewrite them.
