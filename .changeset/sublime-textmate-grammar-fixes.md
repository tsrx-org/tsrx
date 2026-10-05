---
'@tsrx/sublime-text-plugin': patch
---

The syntax closes a `<style>` or `<script>` block even when the CSS or TypeScript syntax is not loaded, and highlights an element used as an attribute value without braces (`content=<span>…</span>`) ([#1057](https://github.com/tsrx-org/tsrx/pull/1057)).
