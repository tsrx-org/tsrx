---
'@tsrx/vscode-plugin': patch
'@tsrx/intellij-plugin': patch
---

The TextMate grammar now closes a `<style>` or `<script>` block when the host has not loaded the CSS or TypeScript grammar. Before, the block's body was read as tag attributes, and the rest of the file stayed inside the tag. Highlighting is unchanged when those grammars are loaded.
