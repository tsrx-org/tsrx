---
'@tsrx/language-server': patch
---

Closing tags no longer add a second `</style>` or `</script>` to an element that already has one. Before, typing the `>` of `<style>` again inserted `</style>` when the element's `</style>` was further on, for example on a later line below its CSS. A new `<style>` or `<script>` still gets its closing tag, also when a style block or script further on in the file has its own.
