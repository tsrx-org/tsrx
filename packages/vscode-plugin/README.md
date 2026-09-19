# TSRX Syntax for VS Code

Provides syntax highlighting and rich intellisense for `.tsrx` files in VS Code,
using the TSRX language server.

## TypeScript backends

`.tsrx` files get their TypeScript features from one of two backends, selected by
the `tsrx.typescript.backend` setting (`auto` by default). Only one backend ever
runs on a file, and changing the setting requires restarting extensions.

| Backend   | How it works                                                                                                                                                                                                                                                                                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `classic` | The TSRX language server hosts TypeScript 5 itself and the built-in TypeScript extension is patched to recognize `.tsrx` files.                                                                                                                                                                                                                                              |
| `native`  | The [TypeScript 7 extension](https://github.com/microsoft/typescript-go/tree/main/_extension) owns every TypeScript feature for `.tsrx` files through [`@tsrx/content-mapper`](https://www.npmjs.com/package/@tsrx/content-mapper). The TSRX language server only serves snippets, CSS in `<style>`, document symbols, auto-closing tags and CSS-class hover and definition. |
| `auto`    | `native` when the TypeScript 7 extension is installed and TypeScript 7 is enabled (`js/ts.experimental.useTsgo`), otherwise `classic`.                                                                                                                                                                                                                                       |

### Native backend setup

TypeScript 7 support for `.tsrx` files is not complete yet. The gaps and the
upstream TypeScript issues behind them are tracked in
[tsrx-org/tsrx#136](https://github.com/tsrx-org/tsrx/issues/136); if you run into
one that is not listed there, please file a new issue.

1. Install a TypeScript 7 extension build that exposes the content-mapper API
   (`registerContentMappers`) and runs TypeScript `7.1.0-dev.20260822.1` or newer,
   then enable it (`js/ts.experimental.useTsgo`, or the **TypeScript: Enable
   TypeScript 7** command) and keep its `js/ts.contentMappers.enabled` setting on
   (the default). The extension is looked up under the ids VS Code itself uses:
   `TypeScriptTeam.vscode-typescript`, `TypeScriptTeam.vscode-typescript-nightly`
   and `TypeScriptTeam.native-preview`; every installed one is tried for the API,
   because the nightly channel can be a compiler-only companion. As of 2026-09-19
   no marketplace release has the API (**TypeScript 7**
   `TypeScriptTeam.native-preview` stopped at `0.20260708.2`), so it takes a build
   of
   [`_extension`](https://github.com/microsoft/typescript-go/tree/main/_extension)
   from the typescript-go repository, with the **TypeScript 7 Nightly** extension
   (`0.20260822.1` or newer) supplying the compiler. Without a usable extension
   the extension falls back to the classic backend and says why.
2. Declare the mapper in every `tsconfig.json` that contains `.tsrx` files, and
   install `@tsrx/content-mapper` next to it, so that TypeScript resolves `.tsrx`
   imports across the whole project:

   ```jsonc
   {
     "contentMappers": [
       { "package": "@tsrx/content-mapper", "extensions": [".tsrx"] },
     ],
   }
   ```

   `.tsrx` files that belong to no project (or to a project without
   `contentMappers`) are still mapped: the extension registers the copy of the
   mapper bundled with it for TypeScript's inferred projects.

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
for migration and rollback steps and why `auto` is the default, and its
[`COMPATIBILITY.md`](https://github.com/tsrx-org/tsrx/blob/main/packages/content-mapper/COMPATIBILITY.md)
and
[`BENCHMARKS.md`](https://github.com/tsrx-org/tsrx/blob/main/packages/content-mapper/BENCHMARKS.md)
for how the two backends compare.
