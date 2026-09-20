# @tsrx/content-mapper

## 0.1.0

### Minor Changes

- [#135](https://github.com/tsrx-org/tsrx/pull/135) Thanks
  [@leonidaz](https://github.com/leonidaz)! - Add `@tsrx/content-mapper`, a
  TypeScript 7 content mapper that type-checks `.tsrx` files under native
  `tsc --runExternalCode`; factor the type-only transform out of the Volar plugin
  into `@tsrx/typescript-plugin/src/transform.js`, and drop the unused
  `suppressedDiagnostics` mapping metadata, and blank `<script>` bodies in the
  generated TSX (they are checked as embedded scripts) so a `<` inside one no
  longer parses as a JSX tag. Migration and rollback steps, the compatibility
  matrix against the classic path, and benchmarks are in
  `packages/content-mapper/ROLLOUT.md`, `COMPATIBILITY.md` and `BENCHMARKS.md`.
  `<script>` bodies are no longer separate supplemental `.mts` outputs: the shared
  transform appends each body to the generated TSX as a block statement, mapped
  back to the source, and hoists a `<script type="module">` body's `import`
  declarations to module level in front of it (its `export` syntax is blanked in
  place, since nothing can import an inline script, and top-level `await` stays
  valid). Composite (`--build`) projects therefore accept `.tsrx` files with
  `<script>` bodies (the TS6307 limitation is gone), and `--declaration` emits no
  `*.tsrx.<n>.d.mts` files. Verbatim spans now also cover the identical whitespace
  that follows them, so edits that end at the start of the next line (Organize
  Imports, Sort Imports, Remove Unused Imports) map and apply instead of being
  dropped by TypeScript 7.
