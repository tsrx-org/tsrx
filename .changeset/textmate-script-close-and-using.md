---
'@tsrx/vscode-plugin': patch
'@tsrx/intellij-plugin': patch
'@tsrx/sublime-text-plugin': patch
---

The TextMate grammar now ends a `<script>` block where the compiler does, at `</script` followed by optional whitespace and `>`. Before, `</script >` was not seen as the closing tag, and the rest of the file was highlighted as script. A closing tag with a line break before its `>` also ends the block. It also highlights `using` and `await using` in an `@for` head as declaration keywords, as it already did in statements and `for…of` loops.
