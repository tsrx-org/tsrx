# TSRX Extension for Zed

This extension provides TSRX language support for the
[Zed editor](https://zed.dev). It provides syntax and language-server support for
`.tsrx` files across Ripple, React, Preact, Solid, Vue, Octane, and third-party
compiler targets.

## Installation

### From the Zed Extension Marketplace

The [TSRX extension](https://zed.dev/extensions/tsrx) is available in the Zed
Extension Marketplace:

1. Open Zed
2. Press `Cmd/Ctrl + Shift + X` to open extensions
3. Search for "TSRX"
4. Click "Install"

### Development Installation

1. Clone this repository
2. Install Rust with the WebAssembly target used by Zed:

   ```bash
   rustup target add wasm32-wasip2
   ```

3. From the repository root, stage the extension outside the working tree:

   ```bash
   pnpm zed:stage-dev
   ```

4. Open Zed and run **zed: install dev extension** from the command palette
5. Select the staging directory printed by the command

Do not select `packages/zed-plugin` directly. Zed writes its Cargo output,
compiled WebAssembly, and a checkout of the configured grammar repository into the
selected extension directory. Staging keeps those generated files out of this
repository.

After changing the extension source, run `pnpm zed:stage-dev` again and then run
**zed: rebuild dev extension** in Zed. Once Zed is using the staged directory,
remove artifacts left by an older direct installation with:

```bash
pnpm zed:clean-worktree
```

Set `TSRX_ZED_DEV_DIR` to override the platform-specific cache directory used for
staging.

## Language Server Setup

The extension looks for the language server `@tsrx/language-server` in this order:

1. The local project that you have opened in Zed via the `package.json` and looks
   for `node_modules/.bin/tsrx-language-server`. So make sure to install your
   dependencies first via:

   ```bash
   npm install
   ```

2. Globally installed:

   ```bash
   npm install -g @tsrx/language-server
   # or
   pnpm add -g @tsrx/language-server
   ```

3. The extension automatically downloads the TSRX language server the first time
   it runs. The version is pinned via the `config` entry for
   `@tsrx/language-server` in this package's `package.json`.

Project-local installations (`node_modules/.bin/tsrx-language-server`) are also
detected automatically.

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

Zed's default `formatter` setting (`auto`) uses the language server for `.tsrx`
files.

## Closing tags

When you type the `>` that ends an opening tag, the TSRX language server inserts
the closing tag: `<div>` becomes `<div></div>`, with the cursor between the tags.
Zed asks the server for it through on-type formatting, which is on by default. Use
Zed 1.17 or newer: older versions move the cursor past the closing tag.

To turn closing tags off, turn on-type formatting off for `.tsrx` files in Zed's
settings:

```jsonc
{
  "languages": {
    "TSRX": { "use_on_type_format": false },
  },
}
```

## TypeScript backends

The TSRX language server hosts TypeScript itself (the `classic` backend), so
`.tsrx` files get their TypeScript features from it. Zed's own TypeScript support
runs `vtsls` or `typescript-language-server`, both TypeScript 5 based, and cannot
serve `.tsrx` files.

### Which TypeScript the language server uses

In the default setup, `@tsrx/language-server` runs TypeScript itself and looks for
it as described here. With TypeScript 7 it does not: the server runs with
`--typescript-backend=native`, loads no TypeScript and searches for none, and
TypeScript 7's own language server (`tsc --lsp`) provides the TypeScript features.
Zed has no TypeScript 7 language server for `.tsrx` files yet; see the `native`
backend below.

`@tsrx/language-server` uses the project's `typescript`: `node_modules/typescript`
in the folder you open in Zed, or in a parent folder. Without one, it uses a
`typescript` installed next to the server. It does not install one itself, so
install `typescript` in the project:

```bash
npm install -D typescript
# or
pnpm add -D typescript
```

Any version below 7 works. When the server finds no `typescript`, or finds
TypeScript 7, it still starts and Zed shows a warning that says what it found.
`.tsrx` files then get no type checking, hover or completions. TSRX compile
errors, CSS in `<style>`, the outline, formatting and closing tags still work.

To use another TypeScript, set its `lib` folder in Zed's settings:

```jsonc
{
  "lsp": {
    "tsrx-language-server": {
      "initialization_options": {
        "typescript": { "tsdk": "/path/to/typescript/lib" },
      },
    },
  },
}
```

### What goes in tsconfig.json

- **TypeScript 5.9 or 6** (classic backend): install `@tsrx/typescript-plugin` and
  add `{ "name": "@tsrx/typescript-plugin" }` to `compilerOptions.plugins`. Zed's
  `vtsls` or `typescript-language-server` loads the plugin from there, next to the
  workspace `typescript` package it runs, so `.ts` files that import `.tsrx`
  modules resolve them. The TSRX language server needs nothing: it serves the
  `.tsrx` files themselves.
- **TypeScript 7** (native backend): declare `@tsrx/content-mapper` under
  `contentMappers` instead; TypeScript 7 ignores `plugins`. Both entries can sit
  in one tsconfig, since TypeScript 5 and 6 ignore `contentMappers`.
- VS Code alone needs no `plugins` entry: its extension hands the plugin to VS
  Code's own tsserver.

TypeScript 7 support for `.tsrx` files is not complete yet. The gaps and the
upstream TypeScript issues behind them are tracked in
[tsrx-org/tsrx#136](https://github.com/tsrx-org/tsrx/issues/136); if you run into
one that is not listed there, please file a new issue.

The server also has a `native` backend that leaves TypeScript features to
TypeScript 7's language server (`tsc --lsp`) through `@tsrx/content-mapper` (see
[`@tsrx/language-server`](https://github.com/tsrx-org/tsrx/tree/main/packages/language-server)).
It only makes sense next to a client that runs TypeScript 7 with
`initializationOptions.runExternalCode: true` for `.tsrx` files. Zed has no such
language server yet, so keep the default `classic` backend in Zed. Once Zed can
run TypeScript 7 for `.tsrx` files, select the backend without an extension update
through Zed's settings:

```jsonc
{
  "lsp": {
    "tsrx-language-server": {
      "initialization_options": { "typescriptBackend": "native" },
    },
  },
}
```
