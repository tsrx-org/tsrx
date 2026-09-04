---
'@tsrx/core': patch
'@tsrx/solid': patch
'@tsrx/prettier-plugin': patch
'@tsrx/language-server': patch
'@tsrx/mcp': patch
'@tsrx/zed-plugin': patch
'@tsrx/vscode-plugin': patch
'@tsrx/intellij-plugin': patch
---

Parse `@finally` on `@try` into `JSXTryExpression.finalizer` and lower it as always-visible sibling output after `@pending` / `@catch`. Bare `finally { … }` after a template `@try` is rejected with `Expected \`@finally\``. JavaScript `try/finally` cleanup is unchanged.
