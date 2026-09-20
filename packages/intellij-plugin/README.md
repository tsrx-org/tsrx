# TSRX for JetBrains IDEs

TSRX language support for compatible IntelliJ-based IDEs.

## Features

- TSRX file type, icon, commenting, and TextMate syntax highlighting for `.tsrx`
  files
- Optional structural bracket coloring from the standard Rainbow Brackets plugin,
  including TSRX template blocks, JavaScript delimiters, JSX tags, fragments, and
  embedded expressions
- Diagnostics, completion, navigation, and formatting through
  `@tsrx/language-server` when the IDE exposes JetBrains' LSP module

## Requirements

- IntelliJ-based IDE 2025.2 or newer
- Rainbow coloring requires the optional standard Rainbow Brackets plugin. The
  integration is verified with Rainbow Brackets 2025.3.12; Rainbow Brackets Lite
  is not supported.
- LSP features require both the Ultimate and LSP modules
- Node.js 22+ with npm available on PATH (for LSP features)

WebStorm 2025.2.4 is the reference build used by CI. Syntax-only IDEs receive the
baseline feature tier; products with the optional modules receive the LSP feature
tier. Rainbow Brackets is not required for the TSRX file type or baseline syntax
highlighting. When installed, its existing colors and settings control TSRX
bracket overlays. JSX tags have their own nesting cycle; mixed-family cycling
counts JavaScript delimiters independently of tags. With mixed-family cycling
disabled, a different bracket family or embedded-expression boundary starts a new
cycle. Fragment punctuation and TSRX dynamic tags are additional coloring
supported by this integration.

## Installation status

The official plugin, using the XML ID `tsrx.intellij-plugin`, has been submitted
to [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/33991-tsrx) and is
under review. The deleted third-party listing and its old ID are intentionally not
reused.

Until the first Marketplace submission is approved, build the ZIP with:

```sh
packages/intellij-plugin/gradlew -p packages/intellij-plugin buildPlugin
```

Then use **Settings → Plugins → ⚙ → Install Plugin from Disk** and select the ZIP
from `packages/intellij-plugin/build/distributions`.

## Language Server Resolution

The plugin looks for the TSRX language server in this order:

1. Project local `node_modules/.bin/tsrx-language-server`
2. Global `tsrx-language-server` on PATH
3. Installs the exact pinned `@tsrx/language-server` version into a versioned IDE
   system directory with npm lifecycle scripts disabled, validates its package
   identity and launcher, and restarts LSP services

Automatic resolution and installation run only for trusted projects. Syntax
highlighting remains available when npm or the network is unavailable; the IDE
shows an actionable notification instead of repeatedly starting a broken server.

## TypeScript backends

`@tsrx/language-server` runs with its default `classic` backend: it hosts
TypeScript 5 itself and serves every feature for `.tsrx` files. The IDE's own
TypeScript service is not involved with `.tsrx` files.

### What goes in tsconfig.json

- **TypeScript 5.9 or 6** (classic backend): install `@tsrx/typescript-plugin` and
  add `{ "name": "@tsrx/typescript-plugin" }` to `compilerOptions.plugins`. The
  IDE's TypeScript service (tsserver based) loads the plugin from there, next to
  the workspace `typescript` package it runs, so `.ts` files that import `.tsrx`
  modules resolve them. The TSRX language server needs nothing: it serves the
  `.tsrx` files themselves. Whether the IDE's service honours the entry is not
  covered by automated tests in this repository.
- **TypeScript 7** (native backend): declare `@tsrx/content-mapper` under
  `contentMappers` instead; TypeScript 7 ignores `plugins`. Both entries can sit
  in one tsconfig, since TypeScript 5 and 6 ignore `contentMappers`.
- VS Code alone needs no `plugins` entry: its extension hands the plugin to VS
  Code's own tsserver.

TypeScript 7 support for `.tsrx` files is not complete yet. The gaps and the
upstream TypeScript issues behind them are tracked in
[tsrx-org/tsrx#136](https://github.com/tsrx-org/tsrx/issues/136); if you run into
one that is not listed there, please file a new issue.

The server's `native` backend (TypeScript 7 owning TypeScript features through
`@tsrx/content-mapper`, see
[`@tsrx/language-server`](../language-server/README.md)) requires a client that
runs TypeScript 7's language server with
`initializationOptions.runExternalCode: true` for `.tsrx` files. JetBrains IDEs do
not expose TypeScript 7's language server for that today, so this plugin always
starts the classic backend.

## Development and release

- See [DEVELOPMENT.md](./DEVELOPMENT.md) for local tests, compatibility
  verification, install-from-disk smoke tests, and protected publication setup.
- Use [MARKETPLACE_RELEASE.md](./MARKETPLACE_RELEASE.md) for the first-submission
  checklist and release record.
- Run `./gradlew runIde` from this directory to start a sandbox IDE with the
  plugin.

## Notes

- Syntax highlighting works without the LSP module; language features are enabled
  when LSP support is present.
- Rainbow Brackets support is an optional enhancement. Disabling or uninstalling
  it returns `.tsrx` files to the baseline TextMate highlighting path.
- Plugin and language-server versions are synchronized by the repository's
  Changesets workflow. Do not hand-edit a duplicate release version.
