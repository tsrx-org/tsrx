# @tsrx/content-mapper

## 0.1.2

### Patch Changes

- [#135](https://github.com/tsrx-org/tsrx/pull/135)
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Bundle the
  `@tsrx/content-mapper/mapper`, `/rpc` and `/protocol` exports into `dist/` so
  they import from the installed package: they resolved to `src/`, which imports
  `@tsrx/typescript-plugin/src/*`, a path that package does not publish and that
  is not a dependency of the mapper. The compile-failure export stub now quotes
  arbitrary module namespace names (`export { "foo-bar" as baz } from`,
  `export * as "ns-name" from`) instead of emitting them unquoted, and the bench
  harness reads a `--project` tsconfig as JSONC (comments and trailing commas) and
  splices its `contentMappers` entry in as an edit.

- [#135](https://github.com/tsrx-org/tsrx/pull/135)
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Every `console` method of the
  mapper process writes to stderr, not only `log`, `info`, `warn` and `debug`:
  `console.dir`, `table`, `trace`, `group` and the rest no longer write to stdout,
  where they would corrupt the protocol stream TypeScript reads.

- [#135](https://github.com/tsrx-org/tsrx/pull/135)
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee)
  Thanks [@leonidaz](https://github.com/leonidaz)! - `@tsrx/content-mapper`
  reports every compile error under the source `TSRX`, in capitals like
  TypeScript's own `TS2322`: a TSRX error with its code's number, so it shows with
  its own code (`TSRX2002`) instead of a hash of the code, and an error with a
  TypeScript code with `11` before its number (`TS1005` shows as `TSRX111005`).
  The generated code can lose a mistake, such as a repeated modifier or a rest
  parameter's `?`, so TypeScript can't always report it itself. Where it does, an
  `ignore` diagnostic directive over the generated code of the statement, member
  or element that holds the error hides TypeScript's copy until the error is
  fixed, so each mistake shows once. The mapper's own errors are `771000` to
  `771003`. `@tsrx/core/diagnostics` exports the source, codes and prefixes as
  `DIAGNOSTIC_SOURCE`, `MAPPER_CODES`, `TYPESCRIPT_CODE_PREFIX` and
  `MAPPER_CODE_PREFIX`.

- [#135](https://github.com/tsrx-org/tsrx/pull/135)
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee)
  Thanks [@leonidaz](https://github.com/leonidaz)! - A TSRX error inside an
  element that holds a `<script>` body no longer hides TypeScript errors in other
  components. The directive that hides TypeScript's copy of the error spanned from
  the element's first to its last generated code, and the body is checked at the
  end of the generated file, so the range covered every component in between. It
  now covers each piece of the element's generated code separately.

- [#135](https://github.com/tsrx-org/tsrx/pull/135)
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The stub that stands in for a
  file that doesn't compile exports a name no declaration can have, such as
  `null`, `if`, `string`, or `"foo-bar"`, from a local binding, instead of
  declaring it (`export declare const null: any` doesn't parse) or leaving it out,
  so importers keep resolving it.

- [#135](https://github.com/tsrx-org/tsrx/pull/135)
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The native TypeScript 7 path
  needs no other TypeScript. `@tsrx/typescript-plugin` now reads `tsconfig.json`
  (with `jsonc-parser`) and resolves `extends` entries and compiler packages
  itself (the rules of get-tsconfig's resolver, with `resolve-pkg-maps` for
  `exports`) instead of through TypeScript's JavaScript API, and detects
  `import.meta.env.platform` flags without TypeScript's scanner; TypeScript is
  only loaded by the classic path (`tsrx-tsc`, the tsserver plugin, the language
  server's `classic` backend). `@tsrx/content-mapper` drops its `typescript`
  dependency and starts about three times faster;
  `@tsrx/language-server --typescript-backend=native` runs on Volar's plain
  project host and loads no TypeScript, so a project whose only `typescript` is
  the native compiler's launcher package works in every editor. Both are tested
  with the `typescript` package forbidden.

- [#135](https://github.com/tsrx-org/tsrx/pull/135)
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Add `@tsrx/content-mapper`, a
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

- [#135](https://github.com/tsrx-org/tsrx/pull/135)
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Support TypeScript 6: the
  `typescript` peer dependency range of `@tsrx/typescript-plugin` and
  `@tsrx/language-server` is now `^5.9.3 || ^6.0.0 || ^7.1.0-dev.20260923.1` (the
  classic path passes its whole test suite on 6.0.3; TypeScript 7 is for
  `tsrx-tsc` and the language server's native backend). `@tsrx/content-mapper`
  declares that range as its own dependency, so a project whose `typescript` is
  the native TypeScript 7 package (a launcher without a JavaScript API) can still
  run the mapper. `tsrx-tsc`, the language server and the mapper now stop with an
  explanation when they resolve a TypeScript 7 package instead of failing on its
  export map. The mapper documents its minimum TypeScript build
  (`7.1.0-dev.20260923.1`, the first nightly whose `tsc --watch` recompiles; the
  stable 7.0 line has no content-mapper protocol), and the test suite runs against
  another build through `TSRX_NATIVE_TSC`. The TypeScript 7 messages of `tsrx-tsc`
  and the language server say that TypeScript 7 support is not complete and link
  tsrx-org/tsrx#136, which tracks the gaps. `<script>` bodies are type-checked as
  blocks appended to the generated TSX on every path, including tsserver through
  the plugin, instead of as extra service scripts that only the language server
  could register.
