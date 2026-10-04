---
'@tsrx/language-server': patch
---

Closing tags no longer add a second closing tag to an element that already has one. Before, typing the `>` of `<div class="card">` again inserted `</div>` when the element's `</div>` was further on, for example on a later line below its children. The server now checks the parsed element, like TypeScript does, and inserts a closing tag only when the element has none. For `<style>` and `<script>`, only a closing tag right after the cursor counts, as before.
