---
'@tsrx/core': patch
'@tsrx/language-server': patch
---

Recover an unclosed `<style>` or `<script>` in loose (editor) mode instead of failing the whole file. Inside a template the body runs up to the next tag start, so partial CSS reaches the loose CSS parser, which no longer throws on it, and the siblings after it keep their token mappings. Closing-tag auto-insert now keys off the typed `>` itself, so it works for `<style apply={…}>` without the fatal-compile fallback.
