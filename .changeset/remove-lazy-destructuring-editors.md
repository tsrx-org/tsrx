---
'@tsrx/vscode-plugin': patch
'@tsrx/zed-plugin': patch
---

Remove the `&{ ... }` / `&[ ... ]` lazy destructuring rules from the TextMate and Tree-sitter grammars and highlight queries, per [RFC #106](https://github.com/tsrx-org/tsrx/discussions/106).
