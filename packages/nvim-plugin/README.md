# TSRX Neovim Plugin

Neovim integration for `.tsrx` files, including Tree-sitter highlighting and
`@tsrx/language-server` integration.

## Requirements

- Neovim 0.11 or newer
- [nvim-treesitter](https://github.com/nvim-treesitter/nvim-treesitter)
- Node.js 22 or newer

## Installation

With `lazy.nvim`:

```lua
{
  "tsrx-org/tsrx",
  config = function(plugin)
    vim.opt.rtp:append(plugin.dir .. "/packages/nvim-plugin")
    require("tsrx").setup(plugin)
  end
}
```

The plugin uses a project-local or global `tsrx-language-server` when available.
Otherwise, it installs the exact `@tsrx/language-server` version pinned in this
package's `config` field. The pin moves to each new server release soon after it
is on npm, so updating the plugin also updates that server.

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

Then format with `vim.lsp.buf.format()`. With the native backend, TypeScript 7's
`tsc` client also offers a formatter for `.tsrx` files, which does nothing
([microsoft/TypeScript#64579](https://github.com/microsoft/TypeScript/issues/64579)).
To ask only the TSRX server:

```lua
vim.lsp.buf.format({ name = "tsrx" })
```

## Closing tags

On Neovim 0.12 or newer, when you type the `>` that ends an opening tag, the TSRX
language server inserts the closing tag: `<div>` becomes `<div></div>`, with the
cursor between the tags. The plugin turns on Neovim's on-type formatting
(`vim.lsp.on_type_formatting`) for the TSRX server only. Neovim 0.11 does not have
on-type formatting, so it does not close tags.

To turn closing tags off:

```lua
vim.lsp.config("tsrx", {
  settings = { tsrx = { autoClosingTags = { enabled = false } } },
})
```

## TypeScript backends

By default the TSRX language server hosts TypeScript itself (the `classic`
backend) and serves every feature for `.tsrx` files.

### Which TypeScript the language server uses

In the default setup, `@tsrx/language-server` runs TypeScript itself and looks for
it as described here. With TypeScript 7 it does not: the server runs with
`--typescript-backend=native`, loads no TypeScript and searches for none, and
TypeScript 7's own language server (`tsc --lsp`) provides the TypeScript features.
The plugin sets that up with `typescript_backend = "native"`; see below.

`@tsrx/language-server` uses the project's `typescript`: `node_modules/typescript`
in the folder you open in Neovim, or in a parent folder. Without one, it uses a
`typescript` installed next to the server. It does not install one itself, so
install `typescript` in the project:

```bash
npm install -D typescript
# or
pnpm add -D typescript
```

Any version below 7 works. When the server finds no `typescript`, or finds
TypeScript 7, it still starts and Neovim shows a warning that says what it found.
`.tsrx` files then get no type checking, hover or completions. TSRX compile
errors, CSS in `<style>`, the outline, formatting and closing tags still work.

To use another TypeScript, pass its `lib` folder after `require("tsrx").setup()`:

```lua
vim.lsp.config("tsrx", {
  init_options = { typescript = { tsdk = "/path/to/typescript/lib" } },
})
```

### What goes in tsconfig.json

- **TypeScript 5.9 or 6** (classic backend): install `@tsrx/typescript-plugin` and
  add `{ "name": "@tsrx/typescript-plugin" }` to `compilerOptions.plugins`. The
  TypeScript server you run for `.ts` files (`ts_ls`, `vtsls`) loads the plugin
  from there, next to the workspace `typescript` package it runs, so `.ts` files
  that import `.tsrx` modules resolve them. The TSRX language server needs
  nothing: it serves the `.tsrx` files themselves.
- **TypeScript 7** (native backend): declare `@tsrx/content-mapper` under
  `contentMappers` instead; TypeScript 7 ignores `plugins`. Both entries can sit
  in one tsconfig, since TypeScript 5 and 6 ignore `contentMappers`.
- VS Code alone needs no `plugins` entry: its extension hands the plugin to VS
  Code's own tsserver.

TypeScript 7 support for `.tsrx` files is not complete yet. The gaps and the
upstream TypeScript issues behind them are tracked in
[tsrx-org/tsrx#136](https://github.com/tsrx-org/tsrx/issues/136); if you run into
one that is not listed there, please file a new issue.

With TypeScript 7 installed in the project, its language server (`tsc --lsp`, the
`tsc` config of nvim-lspconfig, which requires a TypeScript 7 binary) can own
TypeScript features for `.tsrx` files instead, through
[`@tsrx/content-mapper`](https://www.npmjs.com/package/@tsrx/content-mapper).
Declare the mapper in the project's `tsconfig.json`:

```jsonc
{
  "contentMappers": [
    { "package": "@tsrx/content-mapper", "extensions": [".tsrx"] },
  ],
}
```

and select the native backend in the plugin setup:

```lua
require("tsrx").setup(plugin, { typescript_backend = "native" })
vim.lsp.enable("tsc")
```

This starts `tsrx-language-server --typescript-backend=native` (snippets, CSS in
`<style>`, document symbols, auto-closing tags, CSS-class navigation) and, when
the `tsc` config exists, adds the `tsrx` filetype to it and sets
`init_options.runExternalCode = true`, the trust gate that lets TypeScript 7 spawn
the mapper. Without the `tsc` config, or without the mapper in tsconfig, `.tsrx`
files get no TypeScript features on the native backend. Only ever run one backend
on a file.

Verified in this repository: the native server's behaviour for `.tsrx` files
(`packages/content-mapper/tests/native-lsp.test.js`). The Neovim wiring above
follows nvim-lspconfig's `tsc` config and is not covered by automated tests.

The Tree-sitter parser is built from `grammars/tree-sitter` in this repository.
