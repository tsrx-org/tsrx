# JetBrains Marketplace first release

Status: **under review — version 0.0.82**

## Identity

- Plugin XML ID: `tsrx.intellij-plugin`
- Marketplace ID: `33991`
- Marketplace URL: `https://plugins.jetbrains.com/plugin/33991-tsrx`
- Vendor: `TSRX`
- Source: `https://github.com/tsrx-org/tsrx`
- License: MIT
- Homepage: `https://tsrx.dev/`

The previously published third-party plugin and its `dev.tsrx.intellij_plugin` XML
ID were deleted. This repository deliberately uses a new ID so stale Marketplace
records cannot become the official release channel accidentally.

## Review state

Version `0.0.82` was submitted on 2026-09-01 and is under Marketplace review.
JetBrains' compatibility verification considers the plugin compatible. IntelliJ
2026.x builds report non-blocking deprecation warnings for LSP APIs that remain
necessary for the supported IntelliJ 2025.2 baseline.

Remaining release steps:

1. Address any Marketplace reviewer feedback with a new patch version; do not
   change the XML ID.
2. After the listing is public, create a Marketplace token from an authorized
   maintainer's account and store it as `JETBRAINS_MARKETPLACE_PUBLISH_TOKEN` in
   the protected `jetbrains-marketplace` GitHub environment.
3. Smoke-test installation from Marketplace in WebStorm.

Every later version is reviewed separately. The release workflow always attempts
the Marketplace update so a rejected or unavailable upload fails visibly instead
of being mistaken for a successful release.

## Submission record

- Version: `0.0.82`
- Submitted at: 2026-09-01
- Marketplace URL: `https://plugins.jetbrains.com/plugin/33991-tsrx`
- Review result: pending
- WebStorm smoke test: pending
