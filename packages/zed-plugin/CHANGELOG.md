# @tsrx/zed-plugin

## 0.1.3

### Patch Changes

- Updated dependencies
  [[`defb663`](https://github.com/tsrx-org/tsrx/commit/defb6639445c76f617a2a080d8d0d00928962fe1),
  [`3322cec`](https://github.com/tsrx-org/tsrx/commit/3322ceca85280c493625e58e92b987bbb3925249)]:
  - @tsrx/language-server@0.6.3

## 0.1.2

### Patch Changes

- Updated dependencies
  [[`e806335`](https://github.com/tsrx-org/tsrx/commit/e806335fc4ab663c7746e5e946cec72761db7659),
  [`87c8835`](https://github.com/tsrx-org/tsrx/commit/87c88350c4e3d0f5b6ecc1ce60a31a957fa565ac),
  [`495323e`](https://github.com/tsrx-org/tsrx/commit/495323ee83e9a454e59e5b2a2b3d53e76e5d9588)]:
  - @tsrx/language-server@0.6.2

## 0.1.1

### Patch Changes

- [#132](https://github.com/tsrx-org/tsrx/pull/132)
  [`bbda4d2`](https://github.com/tsrx-org/tsrx/commit/bbda4d20cefba9504b92cddbb64955443fcdcca3)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Support TypeScript
  `satisfies` expressions and postfix non-null assertions in the Tree-sitter
  grammar and editor highlighting, including their precedence and assignment
  targets. Prevent template-string scanning from consuming later declarations
  during error recovery.

## 0.1.0

### Minor Changes

- [#110](https://github.com/tsrx-org/tsrx/pull/110)
  [`dcc0283`](https://github.com/tsrx-org/tsrx/commit/dcc0283a7470773f8a169c8750344ad147c30c99)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Remove the `&{ ... }` /
  `&[ ... ]` lazy destructuring rules from the TextMate and Tree-sitter grammars
  and highlight queries, per
  [RFC #106](https://github.com/tsrx-org/tsrx/discussions/106).

## 0.0.88

### Patch Changes

- [#53](https://github.com/tsrx-org/tsrx/pull/53)
  [`8efcbc8`](https://github.com/tsrx-org/tsrx/commit/8efcbc85bc3910531715f51c9f592588c2464f4c)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Highlight self-closing
  `<style apply={…} />` blocks and `<style>` blocks in every template position of
  `@{ … }` and directive bodies.

## 0.0.87

### Patch Changes

- Move the TSRX Zed extension source and grammar to `tsrx-org/tsrx` and use the
  renamed TSRX language server, grammar, and language identifiers.

## 0.0.86

### Patch Changes

- [#1420](https://github.com/Ripple-TS/ripple/pull/1420)
  [`c182962`](https://github.com/Ripple-TS/ripple/commit/c182962f27ad022db6d7c48244e7d2df471df1c8)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Publish Zed extension updates
  automatically through the Zed extensions registry whenever the extension version
  changes.
