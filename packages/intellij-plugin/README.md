# TSRX for JetBrains IDEs

TSRX language support for compatible IntelliJ-based IDEs.

## Features

- TSRX file type, icon, commenting, and TextMate syntax highlighting for `.tsrx`
  files
- Diagnostics, completion, navigation, and formatting through
  `@tsrx/language-server` when the IDE exposes JetBrains' LSP module

## Requirements

- IntelliJ-based IDE 2025.2 or newer
- LSP features require both the Ultimate and LSP modules
- Node.js 22+ with npm available on PATH (for LSP features)

WebStorm 2025.2.4 is the reference build used by CI. Syntax-only IDEs receive the
baseline feature tier; products with the optional modules receive the LSP feature
tier.

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
- Plugin and language-server versions are synchronized by the repository's
  Changesets workflow. Do not hand-edit a duplicate release version.
