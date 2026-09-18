# @tsrx/content-mapper

TypeScript 7 content mapper for `.tsrx` files. It lets native TypeScript (the
`typescript@7` line's `tsc` and its language server) type-check `.tsrx` modules
through the upstream content-mapper protocol, reusing the target-specific
type-only transform that also powers `@tsrx/typescript-plugin` and the classic
Volar path.

Tracking issue: https://github.com/tsrx-org/tsrx/issues/41

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

The classic `tsrx-tsc` (from `@tsrx/typescript-plugin`) keeps working unchanged
for TypeScript 5.

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
- Each embedded `<script>` body as a supplemental `.mts` output (module scope, so
  bodies never collide as globals) with a single verbatim span. TypeScript names
  it `<file>.tsrx.<index>.mts` and, under `--declaration`, emits
  `<file>.tsrx.<index>.d.mts` next to `<file>.d.tsrx.ts`.
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
next to `main.d.ts`, keeps `./Component.tsrx` in import specifiers, and emits
`Component.tsrx.<index>.d.mts` for each `<script>` body.

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
- `custom/setContentMapperContributions` (what the VS Code extension's
  `registerContentMappers` call becomes) maps `.tsrx` files that belong to no
  configured project, and clearing it unregisters them.

The TSRX language server runs beside it with `--typescript-backend=native`; see
[`@tsrx/language-server`](../language-server/README.md) and the VS Code
extension's README for the per-editor setup.

### Known limitations (TypeScript 7.1.0-dev.20260918.1)

- `--watch` compiles once and never recompiles after an edit on macOS in this
  environment, with or without a content mapper and with every `--watchFile`
  strategy. The watch test only asserts the initial pass.
- Composite projects (`--build`) reject the compiler-named supplemental `<script>`
  file with TS6307 because it cannot be listed in `include`. Keep `<script>`
  bodies out of composite libraries until this is fixed upstream;
  `tests/native-build.test.js` pins the current behaviour.
- `--runExternalCode` is required and is never enabled by the mapper.
- Editors: no auto-import when a new import statement is needed
  (microsoft/TypeScript#64119), no rename on `Atom` spans
  (microsoft/TypeScript#63879), and an unused variable in a `<script>` body is
  reported as a hint (TS6133) because the body is checked as a module.

### Compatibility notes (for the Phase 4 matrix)

Observed on 2026-09-18 with the pinned nightly, checking the Ripple playground
(`playground/ripple` in the Ripple repository, 1,648-line `App.tsrx`, external
`@tsrx/ripple` compiler) with `tsc --runExternalCode --noEmit` against classic
`tsrx-tsc --noEmit` on the same tsconfig:

- Identical diagnostics for every `.tsrx` and `.ts` source (29 errors), plus
  hover, definition into Ripple's type declarations and completions through the
  native language server.
- One extra native diagnostic in Vite's own `index.d.ts` (TS2320, a library-check
  difference between TypeScript 7 and 5 with `skipLibCheck` off): compiler-version
  difference.
- Before `blank_script_bodies` in `@tsrx/typescript-plugin/src/transform.js`,
  native `tsc` reported a TS1003 "in virtual code produced by the content mapper"
  for a `<script>` body containing `1 < 2`: the Ripple compiler copies the body
  into the JSX of the `<script>` element, where `<` parses as a tag. The classic
  path hid that syntax error because Volar drops diagnostics with no source
  mapping (the playground's `debug/tsx/App.tsx` dump shows it). The body is now
  blanked in the main TSX on both paths and checked only as the supplemental
  output: adapter bug, fixed.

### Cache invalidation

The mapper uses `dynamicConfig`. `openProject` returns a `configIdentity` hashed
from the mapper options, every tsconfig in the `extends` chain and the resolved
compiler's `package.json`, and lists those files as `watchedFiles`.

## Development

### Dependencies

The mapper bundles `@tsrx/typescript-plugin`'s compiler resolution and transform
(`src/transform.js`, `consumer-compiler.js`, `tsconfig-resolution.js`) and keeps
classic `typescript` as a peer dependency: the tsconfig readers use
`readJsonConfigFile`, `convertToObject`, `parseJsonSourceFileConfigFileContent`
and `resolveModuleName` from the TypeScript 5 API for `extends` and JSONC
handling. The native compiler never loads the mapper's copy of TypeScript, so this
is an explicit, versioned dependency rather than a claim of independence.

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
- `@typescript/native-preview` (the `tsgo` used by `pnpm typecheck`) is a
  different, older build and does not contain the content-mapper feature.

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
  `@tsrx/content-mapper/mapper`) so a host that ships its own copy of the mapper,
  such as the VS Code extension for inferred projects, can start it from its own
  bundled entry file.

`MAPPING.md` is the inventory of every mapping site in the shared transform and
the span kind and feature bits each one becomes.
