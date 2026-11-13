# @tsrx/sublime-text-plugin

## 0.0.85

### Patch Changes

- [#1319](https://github.com/tsrx-org/tsrx/pull/1319)
  [`ff67a15`](https://github.com/tsrx-org/tsrx/commit/ff67a1505986a9feafa8aa8c447ffc3293348224)
  Thanks [@github-actions](https://github.com/apps/github-actions)! - Install
  `@tsrx/language-server` 0.7.0 when a project has no server of its own.

## 0.0.84

### Patch Changes

- [#1221](https://github.com/tsrx-org/tsrx/pull/1221)
  [`d43aac0`](https://github.com/tsrx-org/tsrx/commit/d43aac0e58a555426606c3f7caff38f94b3ed9f8)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The TextMate grammar
  now accepts only HTML whitespace (tab, line feed, form feed, carriage return and
  space) between `</style` or `</script` and the `>` of a closing tag, as the
  compiler does. Before, a non-breaking space or a vertical tab there also ended
  the block, and the CSS or script after it, which the compiler still reads as
  part of the body, was highlighted as markup.

- [#1104](https://github.com/tsrx-org/tsrx/pull/1104)
  [`a283f9d`](https://github.com/tsrx-org/tsrx/commit/a283f9d49654d6a954539fcfe297f54d9b712a31)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The TextMate grammar
  now ends a `<script>` block where the compiler does, at `</script` followed by
  optional whitespace and `>`. Before, `</script >` was not seen as the closing
  tag, and the rest of the file was highlighted as script. A closing tag with a
  line break before its `>` also ends the block. It also highlights `using` and
  `await using` in an `@for` head as declaration keywords, as it already did in
  statements and `for…of` loops.

- [#1180](https://github.com/tsrx-org/tsrx/pull/1180)
  [`985dbfd`](https://github.com/tsrx-org/tsrx/commit/985dbfd446b91c1fffb45b18a3ac5400d82bf137)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The TextMate grammar
  now ends a `<style>` block where the compiler does, at `</style` followed by
  optional whitespace and `>`, as it already did for `<script>`. Before,
  `</style >` was not seen as the closing tag, and the rest of the file was
  highlighted as CSS. A closing tag with a line break before its `>` also ends the
  block.

## 0.0.83

### Patch Changes

- [#1060](https://github.com/tsrx-org/tsrx/pull/1060)
  [`bc439e9`](https://github.com/tsrx-org/tsrx/commit/bc439e9da1c6eeedb9fa75b389bbdc7e6a703550)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Each release now has a built
  `TSRX.sublime-package` attached, so you can install the package without building
  it from this repository.

- [#1060](https://github.com/tsrx-org/tsrx/pull/1060)
  [`bc439e9`](https://github.com/tsrx-org/tsrx/commit/bc439e9da1c6eeedb9fa75b389bbdc7e6a703550)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The syntax closes a `<style>`
  or `<script>` block even when the CSS or TypeScript syntax is not loaded, and
  highlights an element used as an attribute value without braces
  (`content=<span>…</span>`)
  ([#1057](https://github.com/tsrx-org/tsrx/pull/1057)).
