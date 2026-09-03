---
'@tsrx/typescript-plugin': patch
'@tsrx/language-server': patch
'@tsrx/prettier-plugin': patch
'@tsrx/eslint-parser': patch
'@tsrx/eslint-plugin': patch
---

Support lexically scoped `<style>` blocks, `$class`, and `apply` in editor and lint tooling: the fallback CSS extractor and the auto-insert tag matcher handle self-closing `<style … />` and `>` inside `apply={…}`, completions offer `<style>` and `<style apply={…} />` snippets, style diagnostics keep their `tsrx-style-*` codes, and the formatter keeps every new form idempotent. The `<style>` completion snippets describe the amended scope rule (a block is a child of an element or fragment and styles the items beside it, never its container, and raw CSS needs an enclosing `@{ … }` or control-flow body).
