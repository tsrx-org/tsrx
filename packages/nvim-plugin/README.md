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
package's `config` field.

## TypeScript backends

By default the TSRX language server hosts TypeScript 5 itself (the `classic`
backend) and serves every feature for `.tsrx` files.

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
