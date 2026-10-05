# @tsrx/sublime-text-plugin

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
