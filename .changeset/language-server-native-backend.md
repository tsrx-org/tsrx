---
'@tsrx/language-server': patch
---

Add a `native` TypeScript backend mode (`--typescript-backend=native` or the `typescriptBackend` initialization option) that leaves every TypeScript feature for `.tsrx` files to TypeScript 7 and `@tsrx/content-mapper`, serving only TSRX snippets, CSS, document symbols, auto-insert, CSS-class hover and definition, and keyword highlights; `volar-service-typescript` is loaded lazily and only on the classic backend. Migration and rollback steps, the compatibility matrix against the classic path, and benchmarks are in `packages/content-mapper/ROLLOUT.md`, `COMPATIBILITY.md` and `BENCHMARKS.md`. On the classic backend the new Volar-style `typescript.tsdk` initialization option names the TypeScript installation to host (the `lib` directory containing `typescript.js`); without it the server keeps loading the `typescript` package next to it.
