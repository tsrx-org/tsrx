---
'@tsrx/vscode-plugin': patch
'@tsrx/intellij-plugin': patch
'@tsrx/sublime-text-plugin': patch
---

The TextMate grammar now ends a `<style>` block where the compiler does, at `</style` followed by optional whitespace and `>`, as it already did for `<script>`. Before, `</style >` was not seen as the closing tag, and the rest of the file was highlighted as CSS. A closing tag with a line break before its `>` also ends the block.
