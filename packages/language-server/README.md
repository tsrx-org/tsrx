# @tsrx/language-server

[![npm version](https://img.shields.io/npm/v/%40tsrx%2Flanguage-server?logo=npm)](https://www.npmjs.com/package/@tsrx/language-server)
[![npm downloads](https://img.shields.io/npm/dm/%40tsrx%2Flanguage-server?logo=npm&label=downloads)](https://www.npmjs.com/package/@tsrx/language-server)

Language Server Protocol implementation for `.tsrx` files. It uses Volar and
TypeScript to provide diagnostics, completions, hover information, navigation,
document symbols, highlighting, and automatic closing tags. It formats `.tsrx`
files with the project's Prettier (see [Formatting](#formatting)).

The language server resolves the compiler selected by the active TypeScript
project, so the same tooling works with React, Preact, Solid, Vue, Ripple, Octane,
and third-party TSRX targets. Ripple-runtime API completions are only enabled when
the file is compiled by the Ripple target.

## Installation

```bash
npm install --global @tsrx/language-server
# or
pnpm add --global @tsrx/language-server
```

Start the server over stdio:

```bash
tsrx-language-server --stdio
```

It can also be run without a global installation:

```bash
npx @tsrx/language-server --stdio
# or
pnpm dlx @tsrx/language-server --stdio
```

Configure your editor's LSP client for `*.tsrx` files with the language ID `tsrx`.

The `classic` backend hosts TypeScript's JavaScript API,
`typescript@^5.9.3 || ^6.0.0` (the peer dependency range also admits TypeScript 7
from `7.1.0-dev.20260923.1`, for the `native` backend); it refuses to initialize
with an explanation when the project's only `typescript` is the native TypeScript
7 package (a launcher without a JavaScript API). The `native` backend loads no
TypeScript at all: it reads `tsconfig.json` and resolves compilers through
`@tsrx/typescript-plugin`'s own reader and runs on Volar's plain project host, so
TypeScript 7 can be the only TypeScript in the project.

## TypeScript backends

The server runs beside one of two TypeScript backends. Never run both on the same
file.

- `classic` (default): the server hosts TypeScript (5.9 or 6) itself through Volar
  and serves every feature for `.tsrx` files, including type-aware ones. Which
  installation it hosts comes from the Volar-style `typescript.tsdk`
  initialization option, the absolute path of a TypeScript `lib` directory (the
  one containing `typescript.js`); the VS Code extension passes the TypeScript VS
  Code runs for the workspace. Without the option the server loads the
  `typescript` package resolvable from its own location (the peer dependency).
- `native`: TypeScript 7 owns every TypeScript feature for `.tsrx` files through
  [`@tsrx/content-mapper`](https://github.com/tsrx-org/tsrx/tree/main/packages/content-mapper)
  (diagnostics including TSRX compile errors, hover, completions, signature help,
  definitions, references, rename, code actions, auto-import, inlay hints,
  semantic tokens). The TSRX server is slimmed down to what TypeScript does not
  own: TSRX snippet completions (Ripple-gated), CSS in `<style>` blocks, document
  symbols, auto-closing tags, CSS-class hover and definition, and keyword
  highlights. `volar-service-typescript` is never loaded in this mode.
- `plugin`: the editor's own tsserver owns every TypeScript feature for `.tsrx`
  files through `@tsrx/typescript-plugin` (VS Code on TypeScript 5.9 or 6, where
  the extension hands the plugin to VS Code's tsserver). The server is as slim as
  on `native` but also reports the TSRX compile errors, which a tsserver plugin
  cannot.

Select the backend with a command-line flag or an initialization option (the flag
wins):

```bash
tsrx-language-server --stdio --typescript-backend=native
```

```jsonc
// LSP initialize params
{ "initializationOptions": { "typescriptBackend": "native" } }
// or, on the classic backend, the TypeScript to host:
{ "initializationOptions": { "typescript": { "tsdk": "/path/to/node_modules/typescript/lib" } } }
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

## Formatting

The server formats `.tsrx` files (`textDocument/formatting`, and
`textDocument/rangeFormatting` for a selection or a paste) with the project's own
`prettier` and
[`@tsrx/prettier-plugin`](https://github.com/tsrx-org/tsrx/tree/main/packages/prettier-plugin),
on every backend.

1. Install both in the project:

   ```bash
   npm install -D prettier @tsrx/prettier-plugin
   # or
   pnpm add -D prettier @tsrx/prettier-plugin
   ```

2. Run your editor's format command (whole file or selection), or turn on format
   on save or on paste.

How it formats:

- The server bundles no Prettier. It uses the project's copy, so the editor gives
  the same result as the project's `prettier` command. Prettier 3.6 or newer is
  necessary (the plugin's peer range).
- The server looks for both packages in the `node_modules` folders above the file,
  and nowhere else (not `NODE_PATH`).
- The server adds the plugin and the `tsrx` parser itself. A `.tsrx` file formats
  even when the Prettier config does not list the plugin. The `prettier` command
  still needs the plugin in the config.
- The Prettier config (`.prettierrc` or another config file), `.editorconfig`, and
  the nearest `.prettierignore` apply, as on the command line. The editor's tab
  size and its choice of tabs or spaces apply only when the project has no
  Prettier config and no `.editorconfig`.

When formatting cannot run:

- **A package is missing, or Prettier is older than 3.6:** the server returns no
  edits. It shows a message once per project (`window/showMessage`), for example:

  > To format .tsrx files, TSRX needs prettier and @tsrx/prettier-plugin in this
  > project. To install them, run: npm install -D prettier @tsrx/prettier-plugin

  The install command matches the project's package manager, from the nearest
  lockfile (pnpm, Yarn, Bun or npm; npm without a lockfile).

  The server does not send an error response, because with format on save the
  editor would report a failure on every save.

- **Prettier cannot parse the file**, which happens while you type: the server
  returns no edits and writes the error to its log only.

To turn formatting off, set `tsrx.format.enable` to `false`. The server reads it
through `workspace/configuration`.

Other formatters for `.tsrx` files return no edits:

- **TypeScript 7** (`tsc --lsp`) always offers a formatter for content-mapped
  files such as `.tsrx`, and a content mapper cannot turn it off yet
  ([microsoft/TypeScript#64579](https://github.com/microsoft/TypeScript/issues/64579)).
  In an editor that runs `tsc --lsp` for `.tsrx` files, choose the TSRX language
  server as the formatter.
- **VS Code's own TypeScript** (5.9 or 6) offers no `.tsrx` formatter, unless
  `js/ts.format.enabled` is set in the settings.

In VS Code, TSRX is the default formatter for `.tsrx` files, so neither gets in
the way.

## Restarts after package changes

When a `package.json` or a lockfile changes (`pnpm install`, for example), the
server must restart to load the TSRX compiler again. By default it exits with code
0, and the editor must start it again.

An editor that can restart the server itself sets the `restartNotification`
initialization option. The server then sends a `tsrx/restartServer` notification
and keeps running until the editor stops it (`shutdown`, then `exit`) and starts
it again. The VS Code extension does this:

```jsonc
// LSP initialize params
{ "initializationOptions": { "restartNotification": true } }
```

## More

See the [TSRX documentation](https://tsrx.dev/) and
[`@tsrx/typescript-plugin`](https://github.com/tsrx-org/tsrx/tree/main/packages/typescript-plugin)
for target compiler selection and TypeScript configuration, and
[`@tsrx/content-mapper`'s `ROLLOUT.md`](https://github.com/tsrx-org/tsrx/blob/main/packages/content-mapper/ROLLOUT.md)
for the migration, rollback and default-backend decision behind the two backends.
