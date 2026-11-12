---
'@tsrx/vscode-plugin': patch
'@tsrx/intellij-plugin': patch
'@tsrx/sublime-text-plugin': patch
---

The TextMate grammar now accepts only HTML whitespace (tab, line feed, form feed, carriage return and space) between `</style` or `</script` and the `>` of a closing tag, as the compiler does. Before, a non-breaking space or a vertical tab there also ended the block, and the CSS or script after it, which the compiler still reads as part of the body, was highlighted as markup.
