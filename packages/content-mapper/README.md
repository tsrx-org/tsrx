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

- **TypeScript `7.1.0-dev.20260822.1` or newer.** The content-mapper protocol is
  not in the stable 7.0 line: `typescript@7.0.2` rejects `--runExternalCode`
  (TS5023) and ignores `contentMappers`. `7.1.0-dev.20260822.1` is the oldest
  nightly that passes this package's test suite (`7.1.0-dev.20260821.1` fails it);
  the repository pins `7.1.0-dev.20260918.1`. Run the suite against another build
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

| Option             | Type                          | Meaning                                                                                |
| ------------------ | ----------------------------- | -------------------------------------------------------------------------------------- |
| `compiler`         | bare package specifier        | The TSRX target compiler to use, for example `@tsrx/react` or a third-party compiler.  |
| `platform`         | `"web"`, `"ios"`, `"android"` | Platform for `import.meta.env.platform` flags.                                         |
| `languageFeatures` | boolean, default `true`       | `false` keeps spans for diagnostics but drops editor feature bits (CLI-only projects). |

Invalid options are reported by TypeScript as option diagnostics on the mapper
entry.

### Compiler selection

One precedence rule, highest first:

1. `contentMappers[].options.compiler` on the mapper entry.
2. `tsrx.compiler` in the project's tsconfig, following the `extends` chain (the
   same rule the classic plugin uses).
3. Auto-detection of an installed target compiler (`@tsrx/react`, `@tsrx/preact`,
   `@tsrx/solid`, `@tsrx/vue`, `@tsrx/hono`, `@tsrx/ripple`, `octane`) from the
   file's directory upwards.

`platform` follows the same rule with `tsrx.platform`.

### What TypeScript sees

- The generated TSX of the type-only transform, with a span map. Spans whose text
  is unchanged are `Verbatim` (edit-safe: rename, code actions and formatting
  write back through them); renamed identifiers are `Alias`, so a diagnostic that
  covers one shows the authored name; everything else is `Atom`. Neighbouring
  `Verbatim` spans with the same feature bits whose gap is identical text in both
  files are coalesced into one span, so a statement such as
  `import { a } from './x';` is one edit-safe span and TypeScript can place an
  auto-import edit inside it. Fragments of identifiers (the transform's
  one-character file-start anchor) are dropped.
- Each embedded `<script>` body as a block statement appended to the generated
  TSX, with a verbatim span back to the source (the shared transform does this on
  every path). A block keeps one body's declarations from colliding with another's
  or with the component's, and contributes nothing to declaration output. `import`
  declarations of a `<script type="module">` body are hoisted to module level in
  front of the block, where TypeScript resolves them like any other import.
- TSRX compile errors as mapper diagnostics in the original file, printed as
  `error tsrx<code>`. Code `1000` is a fatal compile error, `1001` a usage error
  without a string code, `1002` no compiler found, `1003` invalid configuration;
  string-coded diagnostics such as `tsrx-unclosed-tag` get a stable numeric code
  in the `10000` to `99999` range and keep the string code in brackets in the
  message.
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
[`@tsrx/language-server`](../language-server/README.md) and the VS Code
extension's README for the per-editor setup.

### Known limitations (TypeScript 7.1.0-dev.20260918.1)

- `--watch` compiles once and never recompiles after an edit on macOS
  (microsoft/TypeScript#64351, a nightly regression since `7.1.0-dev.20260811.1`
  that reproduces without a content mapper and with every `--watchFile` strategy).
  The watch test only asserts the initial pass.
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

The mapper is tested against an exact TypeScript 7 nightly. The `typescript@7.x`
package is only a thin launcher: its `bin/tsc` calls `lib/getExePath.js`, which
resolves the platform package `@typescript/typescript-<os>-<arch>` and runs
`lib/tsc` (or `lib/tsc.exe`) from it. That platform package is self-contained (the
Go binary plus the `lib.*.d.ts` library files), so this repository pins the
platform packages directly instead of the launcher:

- `package.json` at the repository root lists every
  `@typescript/typescript-<os>-<arch>` package under `optionalDependencies` at the
  exact nightly version. pnpm installs only the one matching the current
  `process.platform` and `process.arch`.
- Pinning the platform packages avoids a `tsc` bin conflict with the classic
  `typescript` catalog entry, which stays on the 5.x line for the Volar path.
- The pinned nightly is also listed under `minimumReleaseAgeExclude` in
  `pnpm-workspace.yaml` because it is newer than the workspace's release-age
  policy.
- `pnpm typecheck` runs the same pinned platform packages through
  `scripts/native-tsc.js`, since the root `typescript` must stay on the 5.x line
  for the tooling's JavaScript API.

Tests locate the binary as
`node_modules/@typescript/typescript-${process.platform}-${process.arch}/lib/tsc`
resolved from the repository root. A missing binary fails the test instead of
skipping it.

To move to a newer nightly, update the version in the root `package.json`
(`optionalDependencies`) and in `pnpm-workspace.yaml`
(`minimumReleaseAgeExclude`), then run `pnpm install`.

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
