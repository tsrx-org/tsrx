# @tsrx/content-mapper

TypeScript 7 content mapper for `.tsrx` files. It lets native TypeScript (the
`typescript@7` line's `tsc` and its language server) type-check `.tsrx` modules
through the upstream content-mapper protocol, reusing the target-specific
type-only transform that also powers `@tsrx/typescript-plugin` and the classic
Volar path.

Implementation issue: https://github.com/tsrx-org/tsrx/issues/41. Gaps in
TypeScript 7 support and the upstream issues behind them:
https://github.com/tsrx-org/tsrx/issues/136.

## Requirements

- **TypeScript `7.1.0-dev.20260923.1` or newer.** The content-mapper protocol is
  not in the stable 7.0 line: `typescript@7.0.2` rejects `--runExternalCode`
  (TS5023) and ignores `contentMappers`. The protocol arrived in
  `7.1.0-dev.20260822.1` (`7.1.0-dev.20260821.1` fails this package's test suite),
  but `tsc --watch` never recompiled on macOS until `7.1.0-dev.20260923.1`
  (microsoft/TypeScript#64351), the oldest nightly that passes the whole suite.
  The repository runs `7.1.0-dev.20260930.4`. Run the suite against another build
  with `TSRX_NATIVE_TSC=<path to tsc>`.
- **`--runExternalCode`.** TypeScript only spawns the mapper when the user opts
  in; the mapper never enables it. Without the flag, a `contentMappers` entry is
  an error (TS100024). `tsrx-tsc` passes the flag when it runs TypeScript 7,
  because running it is already the decision to execute the project's TSRX
  compiler.
- **No other TypeScript.** The mapper reads `tsconfig.json` (comments, trailing
  commas and the `extends` chain, including packages) and resolves compiler
  packages with `@tsrx/typescript-plugin`'s own reader and package walk
  (`src/tsconfig-resolution.js`, `src/package-resolution.js`), never through
  TypeScript's JavaScript API. A project whose only `typescript` is the native
  compiler's launcher package needs nothing else; `tests/mapper.test.js` runs the
  mapper with the `typescript` package forbidden to prove it.

## Usage

Install the mapper next to TypeScript 7 and declare it in `tsconfig.json`:

```jsonc
{
  "tsrx": { "compiler": "@tsrx/react" },
  "contentMappers": [
    { "package": "@tsrx/content-mapper", "extensions": [".tsrx"] },
  ],
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react",
  },
}
```

Then run native `tsc` with external code enabled. The flag is a user decision; the
mapper never turns it on for you:

```sh
tsc --runExternalCode --noEmit
```

`tsrx-tsc` (from `@tsrx/typescript-plugin`) keeps working unchanged for TypeScript
5.9 and 6, and on a TypeScript 7.1 nightly it runs this same command for you: it
finds the native binary through the `typescript` launcher package's platform
package, adds `--runExternalCode`, and refuses to run a tsconfig without a `.tsrx`
content mapper rather than let TypeScript skip those files. One `package.json`
script therefore serves every supported TypeScript
(`tests/tsrx-tsc-native.test.js`).

### Options

The mapper entry accepts an `options` object:

| Option                 | Type                          | Meaning                                                                                                               |
| ---------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `compiler`             | bare package specifier        | The TSRX target compiler to use, for example `@tsrx/react` or a third-party compiler.                                 |
| `platform`             | `"web"`, `"ios"`, `"android"` | Platform for `import.meta.env.platform` flags.                                                                        |
| `languageFeatures`     | boolean, default `true`       | `false` keeps spans for diagnostics but drops editor feature bits (CLI-only projects).                                |
| `verificationMappings` | boolean, default `false`      | `true` adds the transform's own diagnostics mappings to each transform result, for command-line checkers (see below). |

Invalid options are reported by TypeScript as option diagnostics on the mapper
entry.

With `verificationMappings: true`, each transform result also has
`verificationMappings`: every compiler mapping marked for diagnostics, in Volar's
`CodeMapping` shape (`sourceOffsets`, `generatedOffsets`, `lengths`,
`generatedLengths`) and in the transform's order. It is for a checker that runs
TypeScript (or another checker) on the generated text itself, through
`create_tsrx_content_mapper` from `@tsrx/content-mapper/mapper`. Mapped with
`@volar/source-map`, each diagnostic lands where `tsrx-tsc` puts it:

```js
import { SourceMap } from '@volar/source-map';

const map = new SourceMap(result.verificationMappings);
const [range] = map.toSourceRange(start, start + length, true);
```

`@tsrx/content-mapper` doesn't depend on `@volar/source-map`; a checker that uses
it installs it itself (`npm install @volar/source-map`, version 2).

Unlike `mappings`, nothing is selected, coalesced or extended over whitespace, and
each mapping keeps its offsets together: Volar maps a range only through one
mapping that holds both of its ends, such as the two zero-length points of a
literal's start and end, and tries mappings in this order. When any mapping of a
file has a `verification` that is a `shouldReport` callback, the file's
`verificationMappings` is empty: the callback depends on the diagnostic and can't
be serialized, and leaving out only that mapping could let an overlapping one move
a diagnostic. The TSRX compilers in this repository emit none. The field is
outside the TypeScript 7 protocol (`VerificationMapping` in
`@tsrx/content-mapper/protocol`); TypeScript ignores it, and `mappings` is the
same with or without the option.

### Compiler selection

One precedence rule, highest first:

1. `contentMappers[].options.compiler` on the mapper entry.
2. `tsrx.compiler` in the project's tsconfig, following the `extends` chain (the
   same rule the classic plugin uses).
3. Auto-detection of an installed target compiler (`@tsrx/react`, `@tsrx/preact`,
   `@tsrx/solid`, `@tsrx/vue`, `@tsrx/hono`, `@tsrx/ripple`, `octane`) from the
   file's directory upwards.

`platform` follows the same rule with `tsrx.platform`.

### What a compiler returns

The mapper runs any TSRX compiler, this repository's targets, Ripple, Octane or a
third-party one, through
`compile_to_volar_mappings(source, filename, { loose: true, platform })`, and
relies on what it returns:

- `code`: the generated TSX. Keep it valid TSX: a directive hides only
  TypeScript's checker errors, so a syntax error TypeScript finds in the generated
  code shows as it is, next to the compiler's own error.
- `mappings`: Volar mappings from the source to `code`. Map every token of a
  statement, keywords and punctuation too, so that TypeScript's errors land on the
  source and a directive covers the statement's whole generated code.
- `errors`: the collected errors, each with `pos` and `end` offsets into the
  source and a `code`, TSRX's (`TSRX2002`) or TypeScript's (`TS1186`). An error
  without a code is sent as `771001`.
- `sourceAst`: the source tree, with `start` and `end` on its nodes. The mapper
  finds the statement, class or type member, or element that holds an error in it.
  Without a tree, a directive covers only the error's own span.

A mistake the compiler cannot recover from is thrown, with `pos` and `code`: the
mapper then sends that error alone, and a stub of the file's exports.

### What TypeScript sees

- The generated TSX of the type-only transform, with a span map. Spans whose text
  is unchanged are `Verbatim` (edit-safe: rename, code actions and formatting
  write back through them); renamed identifiers are `Alias`, so a diagnostic that
  covers one shows the authored name; everything else is `Atom`. Neighbouring
  `Verbatim` spans with the same feature bits whose gap is identical text in both
  files are coalesced into one span, so a statement such as
  `import { a } from './x';` is one edit-safe span and TypeScript can place an
  auto-import edit inside it. A span from a mapping with no feature at all joins
  either neighbour. Fragments of identifiers (the transform's one-character
  file-start anchor) are dropped.
- Each embedded `<script>` body as a block statement appended to the generated
  TSX, with a verbatim span back to the source (the shared transform does this on
  every path). A block keeps one body's declarations from colliding with another's
  or with the component's, and contributes nothing to declaration output. `import`
  declarations of a `<script type="module">` body are hoisted to module level in
  front of the block, where TypeScript resolves them like any other import.
- Every TSRX compile error as a mapper diagnostic in the original file, printed as
  `error TSRX<number>`, in capitals like TypeScript's `TS2322`, so a TSRX error
  shows with its own code (`TSRX2002`). An error with a TypeScript code is `11`
  and its number (`TS1005` → `TSRX111005`), with the code in brackets in the
  message. The mapper's own errors are `771000` (a file that doesn't compile, with
  an error without a code), `771001` (an error without a TSRX or TypeScript code),
  `771002` (no compiler found) and `771003` (invalid configuration). The source,
  codes and prefixes are in `@tsrx/core/diagnostics`.
- For each of those errors, an `ignore` diagnostic directive over the generated
  code of the statement, class or type member, or element that holds it, so a
  mistake shows once: TypeScript's own report of it there (TS1186 for a rest
  element's default, a follow-on error of a TSRX mistake) is hidden until the
  mapper's error is fixed. TypeScript's other errors in that code come back then
  too. `tests/error-examples.js` has an example of every error in
  `@tsrx/core/diagnostics`, and `tests/error-examples.test.js` checks that each
  shows exactly once on TypeScript 7, or that its known problem (with the issue
  that tracks it) still stands.
- While a file cannot be compiled, a stub that re-declares its exports as `any`
  (values and types), so importers keep resolving and the author sees exactly one
  error at the failing construct. `<style>` bodies are never TypeScript's concern
  and stay in the TSRX language server.

### Declarations

Under `--declaration`, native TypeScript emits `Component.d.tsrx.ts` (plus `.map`)
next to `main.d.ts` and keeps `./Component.tsrx` in import specifiers. `<script>`
bodies add no declaration files.

- A project that references a `.tsrx` library through `references` (`tsc --build`)
  must declare the content mapper as well, so that TypeScript knows `.tsrx` inputs
  and redirects `lib/Component.tsrx` to `lib/dist/Component.d.tsrx.ts`. Without
  it, the `./Component.tsrx` specifier inside the library's `index.d.ts` fails to
  resolve and, under `skipLibCheck`, the export silently becomes `any`.
- A project that consumes published declarations without the mapper needs
  `allowArbitraryExtensions: true`, which makes TypeScript resolve
  `./Component.tsrx` to `Component.d.tsrx.ts`. Emitted declarations are plain
  TypeScript and re-check with TypeScript 5 or 7 this way.
- microsoft/TypeScript#64120 (`outputExtension`) will let a build that compiles
  `.tsrx` to `.js` emit `Component.d.ts` instead; do not design around the current
  naming.

### Editors

TypeScript 7's language server (`tsc --lsp --stdio`, what the VS Code TypeScript 7
extension and other LSP clients run) serves `.tsrx` files through the mapper once
the client sends `initializationOptions.runExternalCode: true` and the project
declares `contentMappers`. `tests/native-lsp.test.js` drives that server and pins
what editors get:

- `.tsrx` document filters are registered dynamically for diagnostics, hover,
  definition, references, document highlights, completion, rename and code
  actions.
- Pull diagnostics report TypeScript errors and TSRX compile errors (source
  `tsrx`) at authored spans; while a file fails to compile, importers keep
  resolving through the export stub.
- Hover, definition, references, document highlights and rename work through
  `Verbatim` spans, across `.tsrx` and `.ts` files and across several configured
  projects in one session, and again after a server restart.
- Auto-import that extends an existing import statement works. Auto-import that
  needs a new import statement is dropped by the server because the insertion
  point falls into synthesized code (the hoisted static JSX at the top of the
  generated file); tracked as microsoft/TypeScript#64119.
- Rename on an `Atom` span (for example `/>`, which becomes `/>;`) returns
  nothing; whole-symbol projection for `Atom` spans is microsoft/TypeScript#63879.
- Requests on synthesized spans (`@{`) return nothing. VS Code takes the first
  non-empty document-highlight result in provider order, so the TSRX language
  server's keyword highlights are consulted exactly there; with several `.tsrx`
  editors visible VS Code only asks multi-document providers, which the TSRX
  server does not register.
- Without `runExternalCode` the mapper process is never spawned, `.tsrx` is never
  registered and `.ts` importers report TS2307 for `.tsrx` modules: that is the
  untrusted-workspace behaviour.
- `custom/setContentMapperContributions`, exposed by the TypeScript 7 VS Code
  extension as `registerContentMappers`, discovers configured projects for
  contributed file extensions. TSRX registers only `.tsrx`, so opening a `.tsrx`
  file starts TypeScript features without opening a `.ts` or `.js` file. The
  mapper comes from the project's `contentMappers` entry. The API also supports an
  optional inferred-project mapper for files outside configured projects; the TSRX
  extension does not provide one.

The TSRX language server runs beside it with `--typescript-backend=native`; see
[`@tsrx/language-server`](https://github.com/tsrx-org/tsrx/tree/main/packages/language-server)
and the VS Code extension's README for the per-editor setup.

### Known limitations (TypeScript 7.1.0-dev.20260930.4)

- `--runExternalCode` is required and is never enabled by the mapper; `tsrx-tsc`
  passes it.
- Editors: no auto-import when a new import statement is needed
  (microsoft/TypeScript#64119), no rename on `Atom` spans
  (microsoft/TypeScript#63879), and an unused variable in a `<script>` body is
  reported as a hint (TS6133) because the body is checked as a module.

### Compatibility and performance

[`COMPATIBILITY.md`](./COMPATIBILITY.md) classifies every observed difference
between this path and classic `tsrx-tsc` (compiler-version difference, previously
hidden diagnostic, adapter bug, adapter design, upstream limitation) with the test
or probe behind each row, and lists what is not exercised yet.
[`BENCHMARKS.md`](./BENCHMARKS.md) reports cold and warm checks, single-edit
latency, peak memory and process counts for both paths on the same projects and
hardware (`bench/bench.js`). [`ROLLOUT.md`](./ROLLOUT.md) is the release note with
migration, rollback and the default-backend decision.

### Cache invalidation

The mapper uses `dynamicConfig`. `openProject` returns a `configIdentity` hashed
from the mapper options, every tsconfig in the `extends` chain and the resolved
compiler's `package.json`, and lists those files as `watchedFiles`.

## Development

### Dependencies

The mapper has no dependency on `typescript`, classic or native: it reads tsconfig
files and resolves compiler packages with its own code, and `tests/mapper.test.js`
and `tests/package.test.js` run the shipped bundles with the `typescript` package
forbidden to keep it that way.

`@tsrx/typescript-plugin` is a devDependency only. The bundles inline its compiler
resolution and transform (`src/transform.js`, `language.js`,
`consumer-compiler.js`, `package-resolution.js`, `tsconfig-resolution.js`,
`config-host.js`, `jsonc.js`) together with the third-party modules those pull in
(`@volar/language-core`, `resolve-pkg-maps`), because the plugin publishes only
its `dist` and pulls the classic Volar stack into anything that depends on it.
`@tsrx/core` appears in JSDoc types only; the TSRX target compiler itself is
resolved from the project at run time.

`jsonc-parser` is the one runtime dependency: its UMD entry requires its
`./impl/*` files at run time, which a bundle cannot follow, so it stays external
and installs next to the package.

### Native TypeScript binary

The repository's root `typescript` is the exact TypeScript 7.1 nightly the mapper
is tested against: the `native` catalog in `pnpm-workspace.yaml` (`ts_native`).
The `typescript@7.x` package is only a thin launcher: its `bin/tsc` calls
`lib/getExePath.js`, which resolves the platform package
`@typescript/typescript-<os>-<arch>` (an optional dependency of the launcher, so
pnpm installs only the one matching the current platform) and runs `lib/tsc` (or
`lib/tsc.exe`) from it.

- `pnpm typecheck` runs that `tsc` directly, with `--runExternalCode` for the
  projects that declare the mapper in `contentMappers`.
- The packages whose code or tests use TypeScript's JavaScript API
  (`@tsrx/typescript-plugin`, `@tsrx/language-server`, `@tsrx/core`'s tests and
  the others that list it) keep `typescript` from the `default` catalog, the 5.x
  line.
- Packages whose declaration files import `typescript` without declaring it get it
  as an optional peer through `packageExtensions`, so they take the `typescript`
  of the package that uses them rather than the root launcher.
- The nightly is also listed under `minimumReleaseAgeExclude` because it is newer
  than the workspace's release-age policy.

Tests locate the binary the way the launcher does, through the platform package of
the `typescript` resolved from the repository root. A missing binary fails the
test instead of skipping it.

To move to a newer nightly, update `ts_native` and the matching
`minimumReleaseAgeExclude` entries in `pnpm-workspace.yaml`, then run
`pnpm install`.

### Tests

```sh
pnpm test --project content-mapper
```

- `tests/fixtures/consumer/` is the React reference project: two `.tsrx` modules
  that import each other, a `.ts` importer, one intentional cross-file prop-type
  error, one embedded `<script>` block and one `<style>` block with a scoped
  class. `expected-diagnostics.json` records the classic `tsrx-tsc` output and is
  the parity target for `native-tsc.test.js`.
- `tests/fixtures/targets/` holds one fixture per target (Preact, Solid, Vue,
  Ripple); `targets.test.js` runs both `tsrx-tsc` and native `tsc` on each and
  requires identical diagnostics.
- `third-party-compiler.test.js` selects a stub compiler through the mapper
  options and through `tsrx.compiler`, and checks that `Alias` spans show authored
  identifiers in diagnostics.
- `native-lsp.test.js` drives the native language server (`tsc --lsp --stdio`)
  through `tests/lsp-client.js`, a minimal JSON-RPC client, and pins the editor
  features listed under _Editors_ above.
- Integration tests spawn the mapper from `src/server.js` through a generated
  manifest in a temporary workspace, so they never depend on a stale `dist/`.

### Package layout

- `src/server.js` is the executable entry named by the manifest.
- `src/rpc.js` (`run_mapper_server`, `redirect_console_to_stderr`) is the stdio
  transport and `src/mapper.js` (`create_tsrx_content_mapper`) the protocol
  implementation. Both are exported (`@tsrx/content-mapper/rpc`,
  `@tsrx/content-mapper/mapper`), with `src/protocol.js`
  (`@tsrx/content-mapper/protocol`), so a host that ships its own copy of the
  mapper can start it from its own bundled entry file. The exports resolve to the
  bundles in `dist/` (built with `dist/server.js`), never to `src/`: the source
  imports `@tsrx/typescript-plugin/src/*`, which that package does not publish and
  which is not a dependency of this one.

`MAPPING.md` is the inventory of every mapping site in the shared transform and
the span kind and feature bits each one becomes.
