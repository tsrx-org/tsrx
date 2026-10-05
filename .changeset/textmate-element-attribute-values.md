---
'@tsrx/vscode-plugin': patch
'@tsrx/intellij-plugin': patch
---

The TextMate grammar now highlights an element or fragment used as an attribute value without braces, such as `<Slot content=<span>…</span> />`. Before, `=<span` was marked as an invalid attribute.
