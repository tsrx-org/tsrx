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
VS Code users can install the
[TSRX Syntax for VS Code](https://marketplace.visualstudio.com/items?itemName=TSRX.tsrx-vscode-plugin),
which bundles and starts this server automatically. Zed users can install the
[TSRX extension for Zed](https://zed.dev/extensions/tsrx), which also starts this
server automatically.

See the [TSRX documentation](https://tsrx.dev/) and
[`@tsrx/typescript-plugin`](../typescript-plugin/README.md) for target compiler
selection and TypeScript configuration.
