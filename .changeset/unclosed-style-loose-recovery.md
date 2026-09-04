---
'@tsrx/core': patch
---

Recover unclosed `<style>` / `<script>` blocks in loose (editor) mode so partial CSS no longer throws `Expected identifier` and token mappings stay intact while the closing tag is being typed.
