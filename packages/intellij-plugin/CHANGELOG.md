# @tsrx/intellij-plugin

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
