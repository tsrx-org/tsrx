# @tsrx/content-mapper

## 0.1.4

### Patch Changes

- [#1349](https://github.com/tsrx-org/tsrx/pull/1349)
  [`daf8c84`](https://github.com/tsrx-org/tsrx/commit/daf8c84f815e1d834f2699ab4b4397b8022afcd0)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - With TypeScript 7, an
  unclosed `<T>(x: T) => x` whose `T` names no value, or an unclosed tag such as
  `<Missing>` at module level, no longer adds a TS18080 error at the top of the
  file next to the mapper's TSRX1001. The closing tag that recovery adds has no
  place in the file, so TypeScript's error on it (TS2304) showed there; the mapper
  now sends an ignore directive over just that closing tag, which holds no
  authored code.

## 0.1.3

### Patch Changes

- [#1295](https://github.com/tsrx-org/tsrx/pull/1295)
  [`972010b`](https://github.com/tsrx-org/tsrx/commit/972010b3654c907baa25cf2f03e3cad9b3d6c6fd)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Warn about a `@{ … }`
  with no output whose only statement is an expression there only for its value,
  such as `<p>@{user.name}</p>`, which renders nothing: `TSRX2035`, the first
  warning TSRX itself reports. In a child list the message says how to render an
  `@` and then the value. A call, an assignment and other expressions that may be
  there for their effect don't warn, nor does a directive, a block with output, or
  a block with more than one statement. Like every warning, it shows only in
  compiles that collect diagnostics, such as the editor and `tsrx-tsc`, and a
  build drops it. Compiled output doesn't change.

  `@tsrx/mcp` now gives each compile error a `severity`, and a warning no longer
  makes `ok` false. `@tsrx/content-mapper` leaves warnings out, since TypeScript 7
  would show each as an error, fail `tsc` on code that compiles, and hide
  TypeScript's own errors in the statement that holds it. The VS Code extension
  keeps the language server's warnings when TypeScript 7 serves the workspace, as
  the content mapper doesn't send them. So on TypeScript 7,
  `tsc --runExternalCode`, `tsrx-tsc` and editors that run the language server
  with `--typescript-backend=native` don't show warnings yet.

- [#1112](https://github.com/tsrx-org/tsrx/pull/1112)
  [`6e5aeab`](https://github.com/tsrx-org/tsrx/commit/6e5aeab2c793e4c701384fd117a9573b029ffeab)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On TypeScript 7,
  auto-import completions are offered in more places in `.tsrx` files. TypeScript
  7 offered none at the end of a name when the text after it was unmapped up to
  the next mapped token, as for `helperB` in
  `<p>{helperB()}<Button label="x" /></p>`
  ([#1028](https://github.com/tsrx-org/tsrx/issues/1028)) or `const m = useMem;`
  in a template body ([#1064](https://github.com/tsrx-org/tsrx/issues/1064)). Text
  that is the same in the source and in the generated code now always maps,
  without language features of its own. A name directly followed by text that the
  generated code adds, such as the `;` after `const m = useMem` when the source
  has none, still gets no auto-import on TypeScript 7.

- [#1184](https://github.com/tsrx-org/tsrx/pull/1184)
  [`b6953e0`](https://github.com/tsrx-org/tsrx/commit/b6953e0a2676661cf40c4b4772a14419443bb1c6)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On TypeScript 7, an
  error that TypeScript reports over a whole construct whose printed text differs
  from the source now starts where the construct does. For example, TS1340 on
  `import(  './store.ts'  )` (with spaces inside the parentheses) was reported two
  columns early, on the `=`. Before, the mapper dropped a container span that
  encloses token spans, so the start of the construct was unmapped. Now the
  container keeps its uncovered edges, before its first token and after its last,
  as spans that place diagnostics and carry no editor features. Inside an edge,
  text that matches the source maps one-to-one, so an error on a node that has no
  span of its own, such as the `{}` in `Record< {}, 1 >` or the `[]` in `f( [] )`,
  lands where `tsc` reports it in a `.ts` file.

- [#1174](https://github.com/tsrx-org/tsrx/pull/1174)
  [`b70c3a2`](https://github.com/tsrx-org/tsrx/commit/b70c3a2e055655384bd4febe59e4ac2c584796d8)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On TypeScript 7 (native
  `tsrx-tsc` or `tsc --runExternalCode`), two `.tsrx` modules that use
  `import.meta.env.platform` flags no longer fail with `TS2374` (duplicate index
  signature on `ImportMeta`), and declaration output (`Component.d.tsrx.ts`) no
  longer carries the editor-only `ImportMetaEnv` / `ImportMeta` globals. The
  mapper now replaces the `declare global` block that the compiler appends to each
  such module with a `/// <reference path>` directive to one shared declaration
  file (shipped in the new `platform-globals/` directory), which TypeScript loads
  once and leaves out of declaration output. Organize imports and auto-import
  still see only the module's own imports. Authored global augmentations are kept.

- [#1275](https://github.com/tsrx-org/tsrx/pull/1275)
  [`3cecb2c`](https://github.com/tsrx-org/tsrx/commit/3cecb2c59ded5c708167b9a94606a20118334faf)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - New opt-in mapper
  option, `verificationMappings` (off by default), for command-line checkers
  ([#1081](https://github.com/tsrx-org/tsrx/issues/1081)). With `true`, each
  transform result also has `verificationMappings`: every compiler mapping marked
  for diagnostics, in Volar's `CodeMapping` shape and in the transform's order. A
  checker that runs TypeScript on the generated text can map each diagnostic back
  with `@volar/source-map`'s `toSourceRange`, exactly as `tsrx-tsc` does, through
  `@tsrx/content-mapper/mapper` alone. `mappings` and everything TypeScript 7
  reads are unchanged, with or without the option.

- [#1219](https://github.com/tsrx-org/tsrx/pull/1219)
  [`d0a00dc`](https://github.com/tsrx-org/tsrx/commit/d0a00dc54713b459a208fb2e044158a46b0143da)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - TypeScript errors on an
  array literal or an empty type literal are now reported where they are written
  in `.tsrx` files. On TypeScript 7, TS2344 on the `{}` in `g<{}>()` landed one
  column early, on the `<`, and TS2322 on the `[]` in
  `[ {}, [] ] satisfies number[]` was reported at a generated position past the
  end of the file. `tsrx-tsc` and the TypeScript 5.9 plugin dropped the errors on
  an array inside an array, as in `[[]] satisfies number[]`. Array, object and
  type literals, and spread elements, now map their start, their end and their
  brackets or `...`, so an error on a whole literal or spread keeps both of its
  ends. On TypeScript 7 those bracket spans join the exact span over code printed
  as written. An error after a comment inside an object literal, as in
  `{ /* c */ a: 1 as string }`, is also no longer reported on the comment by
  `tsrx-tsc`, and TS2698 on `{ /* c */ ...s }` lands on the spread on both
  TypeScript 5.9 and 7 ([#1209](https://github.com/tsrx-org/tsrx/issues/1209)).

- [#1298](https://github.com/tsrx-org/tsrx/pull/1298)
  [`1e58a65`](https://github.com/tsrx-org/tsrx/commit/1e58a65f2be6ff7d3aee1f4bff521d172b997159)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Each unclosed tag's
  TSRX1001 is now reported on its own tag, not all of them at the token that ends
  the template. In `<main><section>`, the editor and TypeScript 7's
  `tsc --runExternalCode` show one error on `main` and one on `section`. Before,
  the editor showed both on the `>` of `<section>`, and TypeScript 7 showed both
  at the `}`. At module level or inside a closed parent, they show an unclosed
  `<style>` or `<script>` on its opening tag.

  The change is to collected errors, so `@tsrx/prettier-plugin` and
  `@tsrx/eslint-parser`, which report the first one, now report an unclosed
  element or fragment at the tag as well: `const y = <div>` is reported at `1:12`,
  where Prettier's `typescript` parser reports it, and no longer at `2:1`. A
  collected error's `raisedAt` doesn't move, except at the end of the file, where
  it's now one past the input. A strict compile, the one builds run, throws the
  same error at the same place as before.

  A `<>` has no mapping in the editor's code, in a template or not, so the
  language server shows an unclosed one on the nearest code it can. That's its
  first child when the child has a mapping, as in `<><div>` and `<>{1}`, and
  otherwise the code before it, as with `<>` and `<>hello`. TypeScript 7 shows it
  on the `<>`.

  On the TypeScript 7 language server, an unclosed tag hides what it hid before:
  TypeScript's errors in whatever holds the place the parser stopped, until the
  tag is closed. That's usually the enclosing function, and it can be a namespace,
  block, object or class, along with any component inside it. A tag that runs to
  the end of the file has nothing holding that place, so it hides errors only on
  its own name: `export const y = <Missing>` no longer repeats TS2304 beside the
  TSRX1001, and `@{` components after it at the top level keep their errors. An
  unclosed `<style>` or `<script>` stops at its body, which it hides. A plain
  `{ }` function after such a tag is still a parse error in the file.

  An error's anchor, the mapping for a token that isn't in the generated code, now
  stays on its generated line. It can still sit on other code on that line.

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
