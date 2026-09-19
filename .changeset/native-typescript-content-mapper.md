---
'@tsrx/content-mapper': patch
'@tsrx/typescript-plugin': patch
'@tsrx/core': patch
---

Add `@tsrx/content-mapper`, a TypeScript 7 content mapper that type-checks `.tsrx` files under native `tsc --runExternalCode`; factor the type-only transform out of the Volar plugin into `@tsrx/typescript-plugin/src/transform.js`, and drop the unused `suppressedDiagnostics` mapping metadata, and blank `<script>` bodies in the generated TSX (they are checked as embedded scripts) so a `<` inside one no longer parses as a JSX tag. Migration and rollback steps, the compatibility matrix against the classic path, and benchmarks are in `packages/content-mapper/ROLLOUT.md`, `COMPATIBILITY.md` and `BENCHMARKS.md`. `<script>` bodies are no longer separate supplemental `.mts` outputs: the shared transform appends each body to the generated TSX as a block statement, mapped back to the source, and hoists a `<script type="module">` body's `import` declarations to module level in front of it. Composite (`--build`) projects therefore accept `.tsrx` files with `<script>` bodies (the TS6307 limitation is gone), and `--declaration` emits no `*.tsrx.<n>.d.mts` files.
