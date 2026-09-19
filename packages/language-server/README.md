# @tsrx/language-server

[![npm version](https://img.shields.io/npm/v/%40tsrx%2Flanguage-server?logo=npm)](https://www.npmjs.com/package/@tsrx/language-server)
[![npm downloads](https://img.shields.io/npm/dm/%40tsrx%2Flanguage-server?logo=npm&label=downloads)](https://www.npmjs.com/package/@tsrx/language-server)

Language Server Protocol implementation for `.tsrx` files. It uses Volar and
TypeScript to provide diagnostics, completions, hover information, navigation,
document symbols, highlighting, and automatic closing tags.

The language server resolves the compiler selected by the active TypeScript
project, so the same tooling works with React, Preact, Solid, Vue, Ripple, Octane,
and third-party TSRX targets. Ripple-runtime API completions are only enabled when
the file is compiled by the Ripple target.

## Installation

```bash
npm install --global @tsrx/language-server
```

Start the server over stdio:

```bash
tsrx-language-server --stdio
```

It can also be run without a global installation:

```bash
npx @tsrx/language-server --stdio
```

Configure your editor's LSP client for `*.tsrx` files with the language ID `tsrx`.

The `classic` backend hosts TypeScript's JavaScript API,
`typescript@^5.9.3 || ^6.0.0` (the peer dependency); it refuses to initialize with
an explanation when the project's only `typescript` is the native TypeScript 7
package (a launcher without a JavaScript API). The `native` backend loads no
TypeScript at all: it reads `tsconfig.json` and resolves compilers through
`@tsrx/typescript-plugin`'s own reader and runs on Volar's plain project host, so
TypeScript 7 can be the only TypeScript in the project.

## TypeScript backends

The server runs beside one of two TypeScript backends. Never run both on the same
file.

- `classic` (default): the server hosts TypeScript 5 itself through Volar and
  serves every feature for `.tsrx` files, including type-aware ones.
- `native`: TypeScript 7 owns every TypeScript feature for `.tsrx` files through
  [`@tsrx/content-mapper`](../content-mapper/README.md) (diagnostics including
  TSRX compile errors, hover, completions, signature help, definitions,
  references, rename, code actions, auto-import, inlay hints, semantic tokens).
  The TSRX server is slimmed down to what TypeScript does not own: TSRX snippet
  completions (Ripple-gated), CSS in `<style>` blocks, document symbols,
  auto-closing tags, CSS-class hover and definition, and keyword highlights.
  `volar-service-typescript` is never loaded in this mode.

Select the backend with a command-line flag or an initialization option (the flag
wins):

```bash
tsrx-language-server --stdio --typescript-backend=native
```

```jsonc
// LSP initialize params
{ "initializationOptions": { "typescriptBackend": "native" } }
```

Use `native` only when the same editor also runs TypeScript 7's language server
with `initializationOptions.runExternalCode: true` and the project declares the
content mapper in `tsconfig.json`; otherwise `.tsrx` files get no type
information. The VS Code extension selects the backend for you. VS Code users can
install the
[TSRX Syntax for VS Code](https://marketplace.visualstudio.com/items?itemName=TSRX.tsrx-vscode-plugin),
which bundles and starts this server automatically. Zed users can install the
[TSRX extension for Zed](https://zed.dev/extensions/tsrx), which also starts this
server automatically.

See the [TSRX documentation](https://tsrx.dev/) and
[`@tsrx/typescript-plugin`](../typescript-plugin/README.md) for target compiler
selection and TypeScript configuration, and
[`@tsrx/content-mapper`'s `ROLLOUT.md`](../content-mapper/ROLLOUT.md) for the
migration, rollback and default-backend decision behind the two backends.
