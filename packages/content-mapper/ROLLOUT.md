# Native TypeScript 7 support: release notes, migration, rollback

Phase 4 of [tsrx-org/tsrx#41](https://github.com/tsrx-org/tsrx/issues/41). This is
the release note for the first release that ships `@tsrx/content-mapper`, the
`native` backend of `@tsrx/language-server`, and the `tsrx.typescript.backend`
setting of the VS Code extension. The classic path (`tsrx-tsc`, the TypeScript 5
language server, the patched built-in VS Code TypeScript extension) is unchanged
and remains the default everywhere except where the user has already switched
their editor to TypeScript 7. Deprecating the classic path is a separate decision
and is not made here.

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
- **VS Code extension**: `tsrx.typescript.backend` (`auto`, `classic`, `native`;
  default `auto`). On `native` the extension registers a bundled copy of the
  mapper with the TypeScript 7 extension for inferred projects, stops patching the
  built-in TypeScript extension, and starts the TSRX server in native mode. The
  extension now activates on a single `.tsrx` file and declares that it does not
  run in untrusted workspaces.
- **Editor guides** for Zed, Neovim (`setup(plugin, { typescript_backend })`),
  IntelliJ and Sublime Text describe the native setup per editor.
- **TypeScript 6** on the classic path: the `typescript` peer range of
  `@tsrx/typescript-plugin` and `@tsrx/language-server` is `^5.9.3 || ^6.0.0` (the
  whole suite passes on 6.0.3). The `typescript@7` package has no JavaScript API,
  so `tsrx-tsc`, the language server and the mapper stop with an explanation when
  they resolve one; the mapper carries its own `typescript` dependency for
  tsconfig parsing.

## Requirements and status on 2026-09-19

- The content-mapper protocol needs a TypeScript 7.1 nightly:
  `7.1.0-dev.20260822.1` or newer (found by running the native suite across the
  nightlies with `TSRX_NATIVE_TSC`). The stable `typescript@7.0.2` rejects
  `--runExternalCode` (TS5023) and ignores `contentMappers`; there is no 7.1 beta
  or release candidate yet.
- No marketplace release of the VS Code TypeScript 7 extension exposes
  `registerContentMappers` yet: **TypeScript 7** (`TypeScriptTeam.native-preview`)
  stopped at `0.20260708.2`, and **TypeScript 7 Nightly**
  (`TypeScriptTeam.vscode-typescript-nightly`) only ships the compiler. The native
  backend therefore needs a build of the extension from the typescript-go
  repository's `_extension` until a release with the API appears. The TSRX
  extension looks the extension up under the ids VS Code's own TypeScript
  extension uses (`vscode-typescript`, `vscode-typescript-nightly`,
  `native-preview`) and tries every installed one for the API.
- Packaging verified on macOS x64: the `pnpm pack` tarball of
  `@tsrx/content-mapper` installed with npm into a fresh project outside the
  checkout beside `typescript@7.1.0-dev.20260918.1` and the published
  `@tsrx/react` (npm nests `typescript@6.0.3` under the mapper) reports the
  consumer fixture's diagnostic through `npx tsc --runExternalCode`; the VSIX
  built by `pnpm run build-and-package` (851 files, 7.2 MB, bundling TypeScript
  5.9.3) does the same through its `dist/content-mapper.js` from an unpacked copy
  outside the checkout. Linux and Windows are not exercised.
- The gaps and their upstream issues are tracked in
  [tsrx-org/tsrx#136](https://github.com/tsrx-org/tsrx/issues/136), which the VS
  Code messages, the CLI and the docs point users to.

Performance on the same projects and hardware
([`BENCHMARKS.md`](./BENCHMARKS.md)): cold checks 2.1–3.6× faster,
edit-to-diagnostics 3.3–4× faster, 25–45% less peak memory, at the cost of one
extra Node process (the mapper) per `tsc` invocation or language-server session.

## Default backend decision

| Surface                 | Default              | Why                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Command line            | `tsrx-tsc` (classic) | Native needs TypeScript 7 (a nightly at the time of writing), `--runExternalCode` (a user decision the mapper never makes), and has upstream gaps: `--watch` does not recompile on macOS (microsoft/TypeScript#64351), composite `--build` projects reject `<script>` bodies (TS6307, microsoft/TypeScript#64350), declaration files are named `Component.d.tsrx.ts` until microsoft/TypeScript#64120 lands. |
| `@tsrx/language-server` | `classic`            | Native mode without a TypeScript 7 server beside it gives `.tsrx` files no type information, and every non-VS Code editor has to be configured for both servers by hand. The flag makes the choice explicit and per-editor.                                                                                                                                                                                  |
| VS Code extension       | `auto`               | `auto` is native exactly when the TypeScript 7 extension is installed and `js/ts.experimental.useTsgo` is on. In that state the built-in TypeScript extension that the classic path patches is already off, so classic would not work; following the user's TypeScript 7 choice is the only working default. Users who never enable TypeScript 7 stay on classic.                                            |

The default flips to native (CLI documentation and the language server) when all
of the following hold; each is tracked in `COMPATIBILITY.md`:

1. TypeScript 7 ships a stable release with the content-mapper protocol.
2. microsoft/TypeScript#64119 (auto-import needing a new import statement) and
   microsoft/TypeScript#63879 (rename on `Atom` spans) are fixed, or TSRX accepts
   them as permanent.
3. `--watch` recompiles (microsoft/TypeScript#64351) and composite `--build`
   projects accept supplemental `<script>` outputs (microsoft/TypeScript#64350).
4. Push diagnostics (microsoft/TypeScript#63921) or every supported editor
   integration is confirmed to pull diagnostics.

Deprecating `tsrx-tsc` and the classic server is decided separately after the
flip.

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
   the launcher and platform packages. The mapper brings the JavaScript TypeScript
   it needs for tsconfig parsing as its own dependency.

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

   `--runExternalCode` lets TypeScript start the mapper (and therefore the TSRX
   target compiler) from the workspace. Treat it like any other script that runs
   workspace code: fine for your own projects and CI, a decision to make
   consciously for untrusted checkouts.

4. Emitting declarations: native writes `Component.d.tsrx.ts` (plus one
   `Component.tsrx.<n>.d.mts` per `<script>` body) next to `main.d.ts`. A project
   that references a `.tsrx` library must declare the mapper as well; a consumer
   of published declarations without the mapper needs
   `allowArbitraryExtensions: true`. Keep `<script>` bodies out of composite
   libraries until TS6307 is fixed upstream (microsoft/TypeScript#64350).

5. Keep `tsrx-tsc` in `package.json` scripts until the default flips; both
   commands can run in the same CI job on the same tsconfig.

### VS Code

1. Install a TypeScript 7 extension build that exposes `registerContentMappers`
   and runs TypeScript `7.1.0-dev.20260822.1` or newer (see "Requirements and
   status" above for what is available today), and enable it
   (`js/ts.experimental.useTsgo` or the **TypeScript: Enable TypeScript 7**
   command). Keep `js/ts.contentMappers.enabled` on (default).
2. Declare `contentMappers` in the project's `tsconfig.json` and install
   `@tsrx/content-mapper` (steps 1 and 2 above), so `.tsrx` imports resolve across
   the project. Files outside any configured project are mapped by the copy
   bundled with the extension.
3. Leave `tsrx.typescript.backend` on `auto`, or set `native` to insist (the
   extension falls back to classic and says why when the TypeScript 7 extension or
   its `registerContentMappers` API is missing). Restart extensions after changing
   the setting.
4. Trust the workspace; neither backend runs in Restricted Mode.
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

- **Command line**: run `tsrx-tsc --noEmit` again. The `contentMappers` entry can
  stay (TypeScript 5 ignores it) or be removed. Uninstall `@tsrx/content-mapper`
  and the TypeScript 7 packages if unwanted. Declaration outputs from a native run
  have different names (`*.d.tsrx.ts`); delete the output directory before
  re-emitting with the classic path.
- **VS Code**: set `tsrx.typescript.backend` to `classic` (or disable
  `js/ts.experimental.useTsgo`, which makes `auto` choose classic) and restart
  extensions. The extension patches the built-in TypeScript extension again on the
  next activation.
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
- Composite (`--build`) projects reject `<script>` bodies with TS6307
  (microsoft/TypeScript#64350).
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
- Editors other than VS Code need `typescript@^5.9.3 || ^6.0.0` installed beside
  TypeScript 7 for the TSRX language server (it reads tsconfig through the
  TypeScript API and runs on Volar's TypeScript project host); removing that
  requirement is tracked in tsrx-org/tsrx#136.
