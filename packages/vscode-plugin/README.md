# TSRX Syntax for VS Code

Provides syntax highlighting and rich intellisense for `.tsrx` files in VS Code,
using the TSRX language server.

## TypeScript backends

VS Code's own TypeScript owns every TypeScript feature for `.tsrx` files: the
extension never loads TypeScript, bundles none, never patches another extension,
and never asks which TypeScript VS Code runs (no setting of its own, no lookup of
other extensions). Pick the TypeScript with the **TypeScript: Select TypeScript
Version** picker as for any `.ts` file; the two rows below are what happens in
each case. Only one TypeScript ever serves a file.

| Backend   | How it works                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `classic` | TypeScript 7 off: VS Code's built-in TypeScript extension runs its tsserver (its own copy or the workspace version, 5.9 or 6) with `@tsrx/typescript-plugin`, which this extension contributes as a tsserver plugin (`typescriptServerPlugins`) and ships. VS Code manages `.tsrx` documents like `.ts` ones, so its commands and menus work on them and `.ts` importers resolve `.tsrx` modules with no tsconfig `plugins` entry. The TSRX language server adds TSRX compile errors, snippets, CSS in `<style>`, document symbols, auto-closing tags and CSS-class hover and definition. |
| `native`  | TypeScript 7 on: the [TypeScript 7 extension](https://github.com/microsoft/TypeScript/tree/main/packages/vscode-typescript) owns every TypeScript feature for `.tsrx` files through [`@tsrx/content-mapper`](https://www.npmjs.com/package/@tsrx/content-mapper), declared in `tsconfig.json`, including TSRX compile errors. The TSRX language server serves the same TSRX-only features minus compile errors.                                                                                                                                                                           |

### Native backend setup

TypeScript 7 support for `.tsrx` files is not complete yet. The gaps and the
upstream TypeScript issues behind them are tracked in
[tsrx-org/tsrx#136](https://github.com/tsrx-org/tsrx/issues/136); if you run into
one that is not listed there, please file a new issue.

1. Install a TypeScript 7 extension build that supports content mappers and runs
   TypeScript `7.1.0-dev.20260822.1` or newer (a 7.1 nightly; the stable 7.0 line
   has no content-mapper protocol), then enable it (`js/ts.experimental.useTsgo`,
   the **TypeScript: Select TypeScript Version** picker or the **TypeScript:
   Enable TypeScript 7** command) and keep its `js/ts.contentMappers.enabled`
   setting on (the default). As of 2026-09-19 no marketplace release supports
   content mappers: **TypeScript 7** (`TypeScriptTeam.native-preview`) stopped at
   `0.20260708.2`, before the feature, and the **TypeScript 7 Nightly** extension
   only supplies the compiler. Until TypeScript 7.1 and its extension are
   published it takes a build of
   [`packages/vscode-typescript`](https://github.com/microsoft/TypeScript/tree/main/packages/vscode-typescript)
   from the TypeScript repository. This extension never talks to the TypeScript 7
   extension; it only reads the setting above to pick the backend.
2. Declare the mapper in every `tsconfig.json` that contains `.tsrx` files, and
   install `@tsrx/content-mapper` next to it. TypeScript 7 reads that entry itself
   and resolves `.tsrx` imports across the whole project:

   ```jsonc
   {
     "contentMappers": [
       { "package": "@tsrx/content-mapper", "extensions": [".tsrx"] },
     ],
   }
   ```

   A `.tsrx` file that belongs to no such project (no `tsconfig.json`, or one
   without the `contentMappers` entry) gets no TypeScript features on the native
   backend.

3. The workspace must be trusted. Neither the mapper nor the TSRX compilers run in
   Restricted Mode.

What differs from the classic backend:

- TSRX compile errors are reported by TypeScript with the `tsrx` source.
- Hover text shows generated helper identifiers as TypeScript sees them; the
  classic backend rewrote them to the authored names.
- Rename is limited to identifiers whose generated text matches the source
  (upstream microsoft/TypeScript#63879).
- Keyword highlights from the TSRX server are not shown while several `.tsrx`
  editors are visible side by side (VS Code then only consults the TypeScript 7
  extension's multi-document highlight provider).

See the
[`@tsrx/content-mapper` README](https://github.com/tsrx-org/tsrx/tree/main/packages/content-mapper)
for the CLI (`tsc --runExternalCode`), declaration output and known limitations,
its
[`ROLLOUT.md`](https://github.com/tsrx-org/tsrx/blob/main/packages/content-mapper/ROLLOUT.md)
for migration and rollback steps, and its
[`COMPATIBILITY.md`](https://github.com/tsrx-org/tsrx/blob/main/packages/content-mapper/COMPATIBILITY.md)
and
[`BENCHMARKS.md`](https://github.com/tsrx-org/tsrx/blob/main/packages/content-mapper/BENCHMARKS.md)
for how the two backends compare.
