---
'@tsrx/typescript-plugin': patch
'@tsrx/language-server': patch
'@tsrx/prettier-plugin': patch
'@tsrx/eslint-parser': patch
'@tsrx/eslint-plugin': patch
---

Support lexically scoped `<style>` blocks, `$class`, and `apply` in editor and lint tooling: the fallback CSS extractor and the auto-insert tag matcher handle self-closing `<style … />` and `>` inside `apply={…}`, completions offer `<style>` and `<style apply={…} />` snippets, style diagnostics keep their `tsrx-style-*` codes, the formatter keeps every new form idempotent, and the lint rules no longer count a `<style>` sibling as a code block's output node.
