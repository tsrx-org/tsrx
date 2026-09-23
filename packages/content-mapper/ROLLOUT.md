# Native TypeScript 7 support: release notes, migration, rollback

Phase 4 of [tsrx-org/tsrx#41](https://github.com/tsrx-org/tsrx/issues/41). This is
the release note for the first release that ships `@tsrx/content-mapper`, the
`native` backend of `@tsrx/language-server`, and the native backend of the VS Code
extension. The classic path (`tsrx-tsc`, the TypeScript 5 language server, the VS
Code extension serving `.tsrx` through VS Code's own tsserver and the plugin) is
unchanged and remains the default everywhere except where the user has already
switched their editor to TypeScript 7. The classic path is kept for as long as
TypeScript 5.9 and 6 are supported; no deprecation is planned. `tsrx-tsc` works
with every supported version (classic on 5.9 and 6, native on 7), and on
TypeScript 7 plain `tsc --runExternalCode` can be used directly instead.

## What ships

- **`@tsrx/content-mapper`** (new package): a TypeScript 7 content mapper for
  `.tsrx` files. Native `tsc --runExternalCode` and `tsc --lsp` type-check `.tsrx`
  modules with the same target-specific type-only transform that powers
  `tsrx-tsc`. Diagnostics match the classic path on the React, Preact, Solid, Vue
  and Ripple fixtures and on the Ripple playground; every difference that remains
  is listed in [`COMPATIBILITY.md`](./COMPATIBILITY.md).
- **`@tsrx/typescript-plugin`**: the transform is factored into `src/transform.js`
  and shared; `<script>` bodies are blanked in the generated TSX on both paths and
  checked as embedded scripts (fixes a hidden TS1003 when a body contains `<`).
  Unused variables in `<script>` bodies are now reported (as hints in editors).
- **`@tsrx/language-server`**: `--typescript-backend=<classic|native>` (or the
  `typescriptBackend` initialization option). On `native` the server serves only
  what TypeScript 7 does not (snippets, CSS in `<style>`, document symbols,
  auto-insert, CSS-class hover and definition, keyword highlights) and never loads
  `volar-service-typescript`. Default: `classic`.
- **VS Code extension**: VS Code's own TypeScript owns `.tsrx` files. With
  TypeScript 7 off, VS Code's tsserver runs `@tsrx/typescript-plugin`, which the
  extension contributes through `typescriptServerPlugins` and ships (no patch of
  the built-in extension, no bundled TypeScript, no tsconfig `plugins` entry
  needed in VS Code); with it on, TypeScript 7 runs the mapper each
  `tsconfig.json` declares under `contentMappers`. The extension activates
  Microsoft's TypeScript extensions and registers `.tsrx` with any exposed
  content-mapper API for configured-project discovery. Microsoft's extensions
  choose which server runs; TSRX reads no selection setting and bundles no mapper.
  The TSRX server always runs slim (`--typescript-backend=plugin`) and reports
  TSRX compile errors; the extension drops that copy for a file the mapper already
  reports on, so they show once on TypeScript 7 too. The extension now activates
  on a single `.tsrx` file and declares that it does not run in untrusted
  workspaces.
- **Editor guides** for Zed, Neovim (`setup(plugin, { typescript_backend })`),
  IntelliJ and Sublime Text describe the native setup per editor.
- **TypeScript 6** on the classic path: the `typescript` peer range of
  `@tsrx/typescript-plugin` and `@tsrx/language-server` is `^5.9.3 || ^6.0.0` (the
  whole suite passes on 6.0.3). The `typescript@7` package has no JavaScript API:
  the classic language server stops with an explanation when it resolves one, and
  `tsrx-tsc` runs the native path instead (next bullet).
- **`tsrx-tsc` on TypeScript 7.** When the installed `typescript` is a 7.1 nightly
  with the content-mapper protocol, `tsrx-tsc` finds the native binary through the
  launcher's platform package and runs it with `--runExternalCode` for the
  project's `contentMappers` entry, so one `package.json` script serves TypeScript
  5.9, 6 and 7. A TypeScript 7 build without the protocol (stable 7.0, earlier
  nightlies) is explained, and a tsconfig without a `.tsrx` mapper is refused
  rather than checked without its `.tsrx` files. `@tsrx/content-mapper` is an
  optional peer dependency of `@tsrx/typescript-plugin`.
- **The native path needs only TypeScript 7.** `@tsrx/content-mapper` and the
  language server's native backend read `tsconfig.json` and resolve compiler
  packages themselves (`@tsrx/typescript-plugin`'s `tsconfig-resolution.js` and
  `package-resolution.js`, with `resolve-pkg-maps` for `exports`), and the native
  backend runs on Volar's plain project host instead of its TypeScript one, so a
  project whose only `typescript` is the native compiler's launcher package needs
  nothing else. The mapper starts in about a third of the time it did with the
  TypeScript API loaded (`BENCHMARKS.md`).

## Requirements and status on 2026-09-19

- The content-mapper protocol needs a TypeScript 7.1 nightly:
  `7.1.0-dev.20260822.1` or newer (found by running the native suite across the
  nightlies with `TSRX_NATIVE_TSC`). The stable `typescript@7.0.2` rejects
  `--runExternalCode` (TS5023) and ignores `contentMappers`; there is no 7.1 beta
  or release candidate yet.
- No marketplace release of the VS Code **TypeScript 7** extension
  (`TypeScriptTeam.native-preview`, last published `0.20260708.2`) supports
  content mappers: its client predates the feature and never asks the server to
  run external code, so a `contentMappers` entry is ignored even when the
  **TypeScript 7 Nightly** companion (`TypeScriptTeam.vscode-typescript-nightly`,
  compiler only) supplies a 7.1 nightly. Until TypeScript 7.1 and its extension
  are published, the native backend in VS Code needs the extension built from
  `packages/vscode-typescript` in the microsoft/TypeScript repository (the
  typescript-go staging repository is closed). The TSRX extension uses its
  `registerContentMappers` API to discover projects when only `.tsrx` files are
  open.
- Packaging verified on macOS x64: the `pnpm pack` tarball of
  `@tsrx/content-mapper` installed with npm into a fresh project outside the
  checkout beside `typescript@7.1.0-dev.20260918.1` and the published
  `@tsrx/react` reports the consumer fixture's diagnostic through
  `npx tsc --runExternalCode`; the VSIX built by `pnpm run build-and-package` (851
  files, 7.2 MB, at the time bundling TypeScript 5.9.3; the extension now hosts
  the TypeScript VS Code runs and bundles none) does the same through its
  `dist/content-mapper.js` from an unpacked copy outside the checkout. Linux and
  Windows are not exercised.
- The gaps and their upstream issues are tracked in
  [tsrx-org/tsrx#136](https://github.com/tsrx-org/tsrx/issues/136), which the VS
  Code messages, the CLI and the docs point users to.

Performance on the same projects and hardware
([`BENCHMARKS.md`](./BENCHMARKS.md)): cold checks 2.1–3.6× faster,
edit-to-diagnostics 3.3–4× faster, 25–45% less peak memory, at the cost of one
extra Node process (the mapper) per `tsc` invocation or language-server session.

## Default backend decision

| Surface                 | Default                                                                           | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Command line            | `tsrx-tsc`, following the installed TypeScript: classic on 5.9 and 6, native on 7 | The choice of path is the choice of TypeScript version, which the project already makes in `package.json`; the docs keep recommending TypeScript 5.9 or 6 because native needs a TypeScript 7 nightly at the time of writing and has upstream gaps: `--watch` does not recompile on macOS (microsoft/TypeScript#64351), composite `--build` projects reject `<script>` bodies (TS6307, microsoft/TypeScript#64350), declaration files are named `Component.d.tsrx.ts` until microsoft/TypeScript#64120 lands. `--runExternalCode` stays a user decision the mapper never makes; `tsrx-tsc` passes it because running the command already executes the project's TSRX compiler. |
| `@tsrx/language-server` | `classic`                                                                         | Native mode without a TypeScript 7 server beside it gives `.tsrx` files no type information, and every non-VS Code editor has to be configured for both servers by hand. The flag makes the choice explicit and per-editor.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| VS Code extension       | none: VS Code's TypeScript serves `.tsrx` on both lines                           | The extension activates Microsoft's TypeScript extensions and lets them choose the server, without reading selection settings. With TypeScript 7 off, VS Code's tsserver serves `.tsrx` through the contributed `@tsrx/typescript-plugin`; with it on, TypeScript 7 does through the mapper. The TSRX server always runs slim and its compile-error copy is dropped for files the mapper reports on, so no choice is needed and no restart of the TSRX server either.                                                                                                                                                                                                          |

The default flips to native (CLI documentation and the language server) when all
of the following hold; each is tracked in `COMPATIBILITY.md`:

1. TypeScript 7 ships a stable release with the content-mapper protocol.
2. microsoft/TypeScript#64119 (auto-import needing a new import statement) and
   microsoft/TypeScript#63879 (rename on `Atom` spans) are fixed, or TSRX accepts
   them as permanent.
3. `--watch` recompiles (microsoft/TypeScript#64351).
4. Push diagnostics (microsoft/TypeScript#63921) or every supported editor
   integration is confirmed to pull diagnostics.

`tsrx-tsc` and the classic server are not deprecated by the flip: they stay for as
long as TypeScript 5.9 and 6 are supported.

## Migration

### Command-line type checking

1. Install a TypeScript 7.1 nightly (`7.1.0-dev.20260822.1` or newer; the stable
   7.0 releases have no content-mapper protocol) and the mapper next to the
   project:

   ```sh
   pnpm add -D typescript@next @tsrx/content-mapper
   ```

   Use the exact nightly recorded in this repository's root `package.json`
   (`@typescript/typescript-<os>-<arch>` under `optionalDependencies`) if you need
   the tested build; the `README.md` "Native TypeScript binary" section explains
   the launcher and platform packages. The mapper needs no other TypeScript.

2. Declare the mapper in every `tsconfig.json` that contains `.tsrx` files.
   TypeScript 5 ignores the key, so the same file keeps working with `tsrx-tsc`:

   ```jsonc
   {
     "tsrx": { "compiler": "@tsrx/react" },
     "contentMappers": [
       { "package": "@tsrx/content-mapper", "extensions": [".tsrx"] },
     ],
   }
   ```

   Mapper options (`compiler`, `platform`, `languageFeatures`) go in an `options`
   object on that entry; see the README.

3. Run native `tsc` with external code enabled:

   ```sh
   tsc --runExternalCode --noEmit
   ```

   or keep running `tsrx-tsc --noEmit`, which does the same once the installed
   `typescript` is a 7.1 nightly (and refuses to run without the `contentMappers`
   entry from step 2). `--runExternalCode` lets TypeScript start the mapper (and
   therefore the TSRX target compiler) from the workspace. Treat it like any other
   script that runs workspace code: fine for your own projects and CI, a decision
   to make consciously for untrusted checkouts; `tsrx-tsc` passes it for the same
   reason the classic path runs the compiler in-process.

4. Emitting declarations: native writes `Component.d.tsrx.ts` next to `main.d.ts`;
   `<script>` bodies add nothing to it. A project that references a `.tsrx`
   library must declare the mapper as well; a consumer of published declarations
   without the mapper needs `allowArbitraryExtensions: true`.

5. Keep `tsrx-tsc` in `package.json` scripts: it runs the native path once
   TypeScript 7 is installed, and both commands can run in the same CI job on the
   same tsconfig.

### VS Code

1. Install a TypeScript 7 extension build that supports content mappers and runs
   TypeScript `7.1.0-dev.20260822.1` or newer (see "Requirements and status" above
   for what is available today), and enable it (`js/ts.experimental.useTsgo`, the
   **TypeScript: Select TypeScript Version** picker or the **TypeScript: Enable
   TypeScript 7** command). Keep `js/ts.contentMappers.enabled` on (default).
2. Declare `contentMappers` in every `tsconfig.json` that contains `.tsrx` files
   and install `@tsrx/content-mapper` next to it (steps 1 and 2 above). A `.tsrx`
   file no such tsconfig covers gets no TypeScript features.
3. Restart extensions after switching TypeScript 7 on, as VS Code asks; the TSRX
   extension needs nothing.
4. Trust the workspace; neither backend runs in Restricted Mode. With TypeScript 7
   enabled in user settings, its extension warns once that the TSRX extension's
   tsserver plugin will not be loaded; that plugin is only for TypeScript 5.9 or
   6, so the warning is harmless.
5. Set Prettier as the `[tsrx]` default formatter (`editor.defaultFormatter`):
   TypeScript 7 registers a formatter for `.tsrx` that returns no edits, and VS
   Code otherwise asks which of the two to use.

What changes for the user is listed under "What differs from the classic backend"
in the extension README: `tsrx`-sourced compile errors, no auto-import that needs
a new import statement, no rename on punctuation-only spans, and keyword
highlights hidden while several `.tsrx` editors are visible.

### Other editors

Run the TypeScript 7 language server (`tsc --lsp --stdio`) with
`initializationOptions.runExternalCode: true` on `.tsrx` files, and the TSRX
server with `--typescript-backend=native`. The per-editor READMEs (Zed, Neovim,
IntelliJ, Sublime Text) give the exact configuration. The editor must support pull
diagnostics (`textDocument/diagnostic`), and `.tsrx` files must belong to a
`tsconfig.json` that declares the mapper (there is no inferred-project
contribution outside VS Code).

## Rollback

Every step is independent and reversible; nothing on the native path rewrites
project files.

- **Command line**: install TypeScript 5.9 or 6 again; `tsrx-tsc --noEmit` follows
  the installed version. The `contentMappers` entry can stay (TypeScript 5 ignores
  it) or be removed. Uninstall `@tsrx/content-mapper` and the TypeScript 7
  packages if unwanted. Declaration outputs from a native run have different names
  (`*.d.tsrx.ts`); delete the output directory before re-emitting with the classic
  path.
- **VS Code**: switch TypeScript 7 off (the **TypeScript: Select TypeScript
  Version** picker, or `js/ts.experimental.useTsgo`) and restart extensions. VS
  Code's own tsserver serves `.tsrx` files again through the plugin the extension
  ships.
- **Other editors**: start the TSRX server without `--typescript-backend` (or with
  `classic`) and stop sending `.tsrx` to the TypeScript 7 server. Never run both
  backends on the same file.
- **Packages**: the classic packages are unchanged in behaviour; pinning the
  previous versions is not needed for a rollback, but is possible since every
  change is a patch release.

## Known limitations at release

Copied from the README so this note stands alone; `COMPATIBILITY.md` has the
classification and evidence for each.

- `--runExternalCode` is required and never enabled by the mapper.
- `--watch` compiles once and never recompiles on macOS
  (microsoft/TypeScript#64351, a nightly regression since `7.1.0-dev.20260811.1`,
  with or without a mapper).
- No auto-import when a new import statement is needed
  (microsoft/TypeScript#64119); no rename on `Atom` spans
  (microsoft/TypeScript#63879).
- Unused variables in `<script>` bodies are reported as TS6133 hints.
- Declaration files are named `Component.d.tsrx.ts` until
  microsoft/TypeScript#64120.
- Diagnostics are pull-only; clients without pull support get none from TypeScript
  7 (microsoft/TypeScript#63921).
- Only TypeScript 7.1 nightlies from `7.1.0-dev.20260822.1` on speak the protocol;
  `typescript@7.0.x` does not.
