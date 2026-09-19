# TSRX Syntax for VS Code

Provides syntax highlighting and rich intellisense for `.tsrx` files in VS Code,
using the TSRX language server.

## TypeScript backends

`.tsrx` files get their TypeScript features from one of two backends, selected by
the `tsrx.typescript.backend` setting (`auto` by default). Only one backend ever
runs on a file, and changing the setting requires restarting extensions.

| Backend   | How it works                                                                                                                                                                                                                                                                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `classic` | The TSRX language server hosts TypeScript 5 itself and the built-in TypeScript extension is patched to recognize `.tsrx` files.                                                                                                                                                                                                                                                                   |
| `native`  | The [TypeScript 7 extension](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.vscode-typescript) owns every TypeScript feature for `.tsrx` files through [`@tsrx/content-mapper`](https://www.npmjs.com/package/@tsrx/content-mapper). The TSRX language server only serves snippets, CSS in `<style>`, document symbols, auto-closing tags and CSS-class hover and definition. |
| `auto`    | `native` when the TypeScript 7 extension is installed and TypeScript 7 is enabled (`js/ts.experimental.useTsgo`), otherwise `classic`.                                                                                                                                                                                                                                                            |

### Native backend setup

1. Install the TypeScript 7 extension and enable it (`js/ts.experimental.useTsgo`,
   or the **TypeScript: Enable TypeScript 7** command). Keep its
   `js/ts.contentMappers.enabled` setting on (the default).
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
