---
'@tsrx/core': patch
---

The parser no longer hangs when the input ends inside an `@case` or `@default`
body of an `@switch`, as it does while a file is being typed in the editor. It
now reports `Unexpected token` at the end of the input for the missing `}` in
every parse mode, as it does for an unterminated `@if` or `@for` body. The
default mode still reports an unclosed element in the body first. Before, every
parse mode looped forever there (the default mode stopped only at an unclosed
element), which could freeze the language server, the formatter, the ESLint
parser, and the build plugins.
