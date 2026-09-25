---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

More comments stay where they were written, the way Prettier places them.

- A comment between the blocks of a `try` statement or a template `@try`, like
  `} // note` before `catch`, `finally`, `@pending`, or `@catch`, moves into the
  next block as its first line. It was deleted, or moved on each pass. A line
  comment after a `catch` parameter keeps the parameter on its own line, and a
  comment between `try` and its block stays there.
- A comment after the last parameter, before a trailing comma or another
  comment (`function f(a, b /* note */,) {}`), is no longer deleted.
- A comment at the end of a line after the `?` or `:` of a conditional
  expression or type stays before the operator, after the test or the first
  branch, instead of moving onto the next branch.
- A comment before the `:` of a type annotation or return type
  (`let x /* note */ : T`) stays before the `:`. In a typed object pattern it no
  longer moves inside the braces.
- A comment between an exported class's decorators and `class`, as in
  `@dec export /* note */ class A {}`, prints after the decorators, before
  `export`, instead of between `class` and the name.
