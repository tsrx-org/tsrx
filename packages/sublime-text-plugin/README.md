# TSRX for Sublime Text

Sublime Text support for `.tsrx` files: the `source.tsrx` syntax and
`@tsrx/language-server` through the [LSP](https://packagecontrol.io/packages/LSP)
package. The plugin starts a project-local
`node_modules/.bin/tsrx-language-server` when it exists, then a global one on
`PATH`, and otherwise the exact `@tsrx/language-server` version bundled in
`src/language-server/` (Node.js 22+).

## TypeScript backends

By default the TSRX language server hosts TypeScript 5 itself (the `classic`
backend) and serves every feature for `.tsrx` files.

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

## Build

```sh
pnpm --filter @tsrx/sublime-text-plugin build
```

produces `TSRX.sublime-package` with the pinned language server.
