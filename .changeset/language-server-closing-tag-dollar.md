---
'@tsrx/language-server': patch
---

Closing tags now keep a `$` in the tag name. In VS Code with TypeScript 7, typing `<$Foo>` inserted `</>`, and `<ui.$Item>` inserted `</ui.>`. Now they insert `</$Foo>` and `</ui.$Item>`. The closing tag goes to VS Code as a snippet, and in a snippet `$Foo` is a variable that VS Code replaces with nothing. The server now escapes the closing tag.

Closing tags in all editors also keep a `$` or a non-ASCII letter after the first character of the tag name. Before, `<Foo$Bar>` got `</Foo>`, `<ui.$Item>` got `</ui.>` and `<Café>` got `</Caf>`.
