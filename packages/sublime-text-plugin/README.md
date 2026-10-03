# TSRX for Sublime Text

Sublime Text support for `.tsrx` files: the `source.tsrx` syntax and
`@tsrx/language-server` through the [LSP](https://packagecontrol.io/packages/LSP)
package. The plugin starts a project-local
`node_modules/.bin/tsrx-language-server` when it exists, then a global one on
`PATH`, and otherwise the exact `@tsrx/language-server` version bundled in
`src/language-server/` (Node.js 22+).

## TypeScript backends

By default the TSRX language server hosts TypeScript itself (the `classic`
backend) and serves every feature for `.tsrx` files.

### Which TypeScript the language server uses

In the default setup, `@tsrx/language-server` runs TypeScript itself and looks for
it as described here. With TypeScript 7 it does not: the server runs with
`--typescript-backend=native`, loads no TypeScript and searches for none, and
TypeScript 7's own language server (`tsc --lsp`) provides the TypeScript features.
See the `native` backend below.

`@tsrx/language-server` uses the project's `typescript`: `node_modules/typescript`
in the folder you open in Sublime Text, or in a parent folder. Without one, it
uses a `typescript` installed next to the server. It does not install one itself,
so install `typescript` in the project:

```bash
npm install -D typescript
# or
pnpm add -D typescript
```

Any version below 7 works. When the server finds no `typescript`, or finds
TypeScript 7, it still starts and sends a warning that says what it found. `.tsrx`
files then get no type checking, hover or completions. TSRX compile errors, CSS in
`<style>`, the outline, formatting and closing tags still work.

To use another TypeScript, add its `lib` folder to
`Packages/User/TSRX.sublime-settings`:

```json
{
  "initializationOptions": { "typescript": { "tsdk": "/path/to/typescript/lib" } }
}
```

### What goes in tsconfig.json

- **TypeScript 5.9 or 6** (classic backend): install `@tsrx/typescript-plugin` and
  add `{ "name": "@tsrx/typescript-plugin" }` to `compilerOptions.plugins`. The
  LSP-typescript client you run for `.ts` files loads the plugin from there, next
  to the workspace `typescript` package it runs, so `.ts` files that import
  `.tsrx` modules resolve them. The TSRX language server needs nothing: it serves
  the `.tsrx` files themselves.
- **TypeScript 7** (native backend): declare `@tsrx/content-mapper` under
  `contentMappers` instead; TypeScript 7 ignores `plugins`. Both entries can sit
  in one tsconfig, since TypeScript 5 and 6 ignore `contentMappers`.
- VS Code alone needs no `plugins` entry: its extension hands the plugin to VS
  Code's own tsserver.

TypeScript 7 support for `.tsrx` files is not complete yet. The gaps and the
upstream TypeScript issues behind them are tracked in
[tsrx-org/tsrx#136](https://github.com/tsrx-org/tsrx/issues/136); if you run into
one that is not listed there, please file a new issue.

The `native` backend leaves TypeScript features to TypeScript 7's language server
(`tsc --lsp --stdio`) through
[`@tsrx/content-mapper`](https://www.npmjs.com/package/@tsrx/content-mapper), and
slims the TSRX server down to snippets, CSS in `<style>`, document symbols,
auto-closing tags and CSS-class navigation. It needs three things:

1. `@tsrx/content-mapper` installed and declared in the project's `tsconfig.json`:

   ```jsonc
   {
     "contentMappers": [
       { "package": "@tsrx/content-mapper", "extensions": [".tsrx"] },
     ],
   }
   ```

2. An LSP client for TypeScript 7 that also covers `source.tsrx` and sends the
   trust gate. In `LSP.sublime-settings`:

   ```jsonc
   {
     "clients": {
       "tsc": {
         "enabled": true,
         "command": ["node_modules/.bin/tsc", "--lsp", "--stdio"],
         "selector": "source.ts | source.tsx | source.js | source.jsx | source.tsrx",
         "initializationOptions": { "runExternalCode": true },
       },
     },
   }
   ```

3. The TSRX server on its native backend. In `TSRX.sublime-settings` (user
   overrides of this package's client configuration):

   ```jsonc
   {
     "initializationOptions": { "typescriptBackend": "native" },
   }
   ```

Never run both backends on a file: with the classic backend, do not add
`source.tsrx` to a TypeScript 7 client.

Verified in this repository: the native server's behaviour for `.tsrx` files
(`packages/content-mapper/tests/native-lsp.test.js`) and the TSRX server's backend
flag. The Sublime client configuration above is not covered by automated tests.

## Formatting

The TSRX language server formats `.tsrx` files with your project's Prettier and
`@tsrx/prettier-plugin` (see
[Formatting](https://github.com/tsrx-org/tsrx/tree/main/packages/language-server#formatting)).
Install both in the project:

```sh
npm install -D prettier @tsrx/prettier-plugin
# or
pnpm add -D prettier @tsrx/prettier-plugin
```

Then run **LSP: Format File** or **LSP: Format Selection**. With the native
backend, the `tsc` client from step 2 also offers a formatter for `.tsrx` files,
which does nothing
([microsoft/TypeScript#64579](https://github.com/microsoft/TypeScript/issues/64579)).
If formatting a `.tsrx` file changes nothing, LSP asked that client. If you do not
format TypeScript files with `tsc` either, turn its formatting off in its client
configuration:

```jsonc
"disabled_capabilities": {
  "documentFormattingProvider": true,
  "documentRangeFormattingProvider": true,
},
```

## Build

```sh
pnpm --filter @tsrx/sublime-text-plugin build
```

produces `TSRX.sublime-package` with the pinned language server.
`src/language-server/` pins it with a lockfile. The pin moves to each new server
release soon after it is on npm, so build again to get that server.
