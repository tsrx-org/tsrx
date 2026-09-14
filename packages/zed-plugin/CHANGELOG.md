# @tsrx/zed-plugin

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
