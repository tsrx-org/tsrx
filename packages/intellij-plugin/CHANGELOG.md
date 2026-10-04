# @tsrx/intellij-plugin

## 0.0.88

### Patch Changes

- Updated dependencies
  [[`defb663`](https://github.com/tsrx-org/tsrx/commit/defb6639445c76f617a2a080d8d0d00928962fe1),
  [`3322cec`](https://github.com/tsrx-org/tsrx/commit/3322ceca85280c493625e58e92b987bbb3925249)]:
  - @tsrx/language-server@0.6.3

## 0.0.87

### Patch Changes

- [#1020](https://github.com/tsrx-org/tsrx/pull/1020)
  [`87c8835`](https://github.com/tsrx-org/tsrx/commit/87c88350c4e3d0f5b6ecc1ce60a31a957fa565ac)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Tags now close as you type.
  When you type the `>` that ends an opening tag, the TSRX language server inserts
  the closing tag: `<div>` becomes `<div></div>`, with the caret between the tags.
  JetBrains IDEs leave on-type formatting off for language servers, so the plugin
  turns it on for the TSRX server only.

  The plugin now needs an IntelliJ-based IDE 2026.1.4 or newer. Before, it needed
  2025.2 or newer. 2026.1.4 is the first version with on-type formatting for
  language servers and with the renamed LSP API, which the plugin now uses
  (`LspIntegrationProvider`, `ProjectWideLspClientDescriptor`,
  `LspClientManager`).

- [#1012](https://github.com/tsrx-org/tsrx/pull/1012)
  [`9f04e81`](https://github.com/tsrx-org/tsrx/commit/9f04e81d9579624dd2bb2de8fab48141f430855f)
  Thanks [@leonidaz](https://github.com/leonidaz)! - New setting: **Settings →
  Languages & Frameworks → TSRX → TypeScript lib folder**. Set it to the `lib`
  folder of a TypeScript installation, and the TSRX language server runs that
  TypeScript. For example, use TypeScript 6 when the project is on TypeScript 7. A
  relative path starts at the project folder. When you change the setting, the
  language server restarts. Leave it empty to use the project's `typescript`, as
  before.
- Updated dependencies
  [[`e806335`](https://github.com/tsrx-org/tsrx/commit/e806335fc4ab663c7746e5e946cec72761db7659),
  [`87c8835`](https://github.com/tsrx-org/tsrx/commit/87c88350c4e3d0f5b6ecc1ce60a31a957fa565ac),
  [`495323e`](https://github.com/tsrx-org/tsrx/commit/495323ee83e9a454e59e5b2a2b3d53e76e5d9588)]:
  - @tsrx/language-server@0.6.2

## 0.0.86

### Patch Changes

- [#101](https://github.com/tsrx-org/tsrx/pull/101)
  [`1c9d76a`](https://github.com/tsrx-org/tsrx/commit/1c9d76a60b4506f2992cd029e68808c592571ead)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Recognize multiline JSX
  expression boundaries and align theme-relative highlighting roles for member
  access inside embedded JSX expressions. Preserve ordinary function-call
  highlighting when mapping embedded JSX members to WebStorm theme roles.

- [#103](https://github.com/tsrx-org/tsrx/pull/103)
  [`984fd22`](https://github.com/tsrx-org/tsrx/commit/984fd2213d5cb3bdaa0f23fb3ce0d154d087ee24)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Add optional TSRX
  structural bracket coloring through the standard Rainbow Brackets plugin.
  Preserve nested JSX attributes and follow native TSX tag and bracket-family
  color cycles for shared punctuation.

## 0.0.85

### Patch Changes

- [#53](https://github.com/tsrx-org/tsrx/pull/53)
  [`8efcbc8`](https://github.com/tsrx-org/tsrx/commit/8efcbc85bc3910531715f51c9f592588c2464f4c)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Highlight self-closing
  `<style apply={…} />` blocks and `<style>` blocks in every template position
  (bundled TextMate grammar regenerated).

## 0.0.84

### Patch Changes

- [#56](https://github.com/tsrx-org/tsrx/pull/56)
  [`2477452`](https://github.com/tsrx-org/tsrx/commit/2477452ff8a373ca61852aa691426939e71ff360)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Replace an internal IntelliJ
  plugin lookup with the supported plugin-aware class loader API.

## 0.0.83

### Patch Changes

- [#36](https://github.com/tsrx-org/tsrx/pull/36)
  [`708f16b`](https://github.com/tsrx-org/tsrx/commit/708f16ba77d0bdd31eb57ce5955efa9be8dd3b5a)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Prepare the TSRX plugin
  for verified, signed JetBrains Marketplace releases under a fresh plugin ID.
