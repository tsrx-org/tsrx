# Zed Extension Development Guide

## Staging and Building the Extension

1. **Install Rust toolchain** with WebAssembly target:

   ```bash
   rustup target add wasm32-wasip2
   ```

2. **Stage the extension outside the repository** from the repository root:

   ```bash
   pnpm zed:stage-dev
   ```

3. **Install the staged dev extension** in Zed:
   - Open Zed
   - Press `Cmd/Ctrl + Shift + P`
   - Run "zed: install dev extension"
   - Select the staging directory printed by `pnpm zed:stage-dev`

Zed installs a development extension as a link to the selected directory and
writes `target/`, `extension.wasm`, and its grammar checkout there. The TSRX
grammar points at this monorepo and uses `path = "grammars/tree-sitter"`; Zed
checks out the repository before applying that path. Staging therefore prevents a
generated copy of the monorepo from appearing inside `packages/zed-plugin`.

After changing extension source, rerun `pnpm zed:stage-dev` and then run **zed:
rebuild dev extension** in Zed. The staging command preserves build output in the
staged directory while replacing its source files.

Once Zed is linked to the staged directory, remove artifacts from an older direct
installation with:

```bash
pnpm zed:clean-worktree
```

Do not run the cleanup while Zed is still linked directly to
`packages/zed-plugin`, because the compiled WebAssembly files are required when
the extension loads. Set `TSRX_ZED_DEV_DIR` to use a custom staging directory.

## Testing

1. Open a `.tsrx` file in Zed
2. Verify:
   - Syntax highlighting works
   - Language server connects (check status bar)
   - Code completion works
   - Outline view shows components/functions

## File Structure

```
zed-plugin/
├── extension.toml           # Extension metadata and configuration
├── Cargo.toml              # Rust dependencies
├── src/
│   └── lib.rs              # Language server integration logic
├── languages/
│   └── tsrx/
│       ├── config.toml     # Language configuration
│       ├── highlights.scm  # Syntax highlighting queries
│       ├── brackets.scm    # Bracket matching
│       ├── outline.scm     # Code structure/outline
│       ├── folds.scm       # Code folding
│       └── injections.scm  # Language injections
├── LICENSE                 # MIT License
├── README.md              # User documentation
└── .gitignore             # Git ignore rules
```

## Publishing to Zed Extensions Registry

Add a patch changeset for `@tsrx/zed-plugin` when a change should reach the Zed
extension registry:

```bash
pnpm changeset
```

The Changesets release PR bumps `package.json` and synchronizes both the version
and grammar revision in `extension.toml`. When that release PR is merged, the
publish workflow creates an `@tsrx/zed-plugin@<version>` tag and opens the
registry update PR through the
[`leonidaz/extensions`](https://github.com/leonidaz/extensions) fork. The
extension is published after the Zed registry maintainers merge that PR.

The workflow requires a `ZED_EXTENSION_TOKEN` Actions secret containing a classic
GitHub personal access token owned by `leonidaz` with `repo` and `workflow`
scopes. This is an ongoing credential for automatic Zed releases, not a one-time
bootstrap token: the workflow consumes it only when the Zed extension version
changes. Give it an expiration, rotate it before expiry, and run **Inspect Zed
Extension Token** after creating or rotating it. Remove the secret only when
switching to manual registry PRs or a different cross-repository authentication
mechanism.

### One-time repository migration

Before the first release from `tsrx-org/tsrx`, open a registry PR through the
[`leonidaz/extensions`](https://github.com/leonidaz/extensions) fork that:

1. changes the `extensions/tsrx` URL in `.gitmodules` from
   `https://github.com/Ripple-TS/ripple.git` to
   `https://github.com/tsrx-org/tsrx.git`;
2. points the `extensions/tsrx` gitlink at a reachable `tsrx-org/tsrx` commit
   containing `packages/zed-plugin`; and
3. keeps `extensions.toml` and `packages/zed-plugin/extension.toml` on the same
   version.

The community `zed-extension-action` used by the publish workflow updates the
registry version and gitlink commit, but it does not change `.gitmodules`. Once
the one-time URL migration is merged upstream, future `@tsrx/zed-plugin` release
tags can use the automated path normally.

## Updating the Extension

### After Grammar Changes

If you update the tree-sitter grammar in `grammars/tree-sitter`:

1. Update query files in `languages/tsrx/` if needed
2. Commit the generated tree-sitter grammar artifacts
3. Test locally
4. Add a patch changeset for `@tsrx/zed-plugin`; the Changesets release PR updates
   the `rev` field in `extension.toml`

### After Language Server Changes

The extension just launches the language server binary - no changes needed to the
extension itself unless:

- Binary name changes
- Command-line arguments change
- Installation method changes

## Troubleshooting

### Language server not found

Make sure `@tsrx/language-server` is installed:

```bash
npm install -g @tsrx/language-server
```

Or in your project:

```bash
npm install --save-dev @tsrx/language-server
```

### Syntax highlighting not working

1. Check that tree-sitter grammar compiled successfully
2. Verify query files are valid (no syntax errors)
3. Check Zed logs: `Cmd/Ctrl + Shift + P` → "zed: open log"

### Extension won't build

1. Ensure Rust toolchain is installed: `rustc --version`
2. Ensure wasm32-wasip2 target is installed: `rustup target list --installed`
3. Check Cargo.toml has correct `zed_extension_api` version

## Resources

- [TSRX in the Zed Extension Marketplace](https://zed.dev/extensions/tsrx)
- [Zed Extensions Docs](https://zed.dev/docs/extensions)
- [Language Extensions Guide](https://zed.dev/docs/extensions/languages)
- [Extension API Reference](https://docs.rs/zed_extension_api/latest/)
- [Tree-sitter Query Documentation](https://tree-sitter.github.io/tree-sitter/using-parsers#pattern-matching-with-queries)
