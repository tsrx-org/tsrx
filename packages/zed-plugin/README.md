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
   ```

3. The extension automatically downloads the TSRX language server the first time
   it runs. The version is pinned via the `config` entry for
   `@tsrx/language-server` in this package's `package.json`.

Project-local installations (`node_modules/.bin/tsrx-language-server`) are also
detected automatically.
