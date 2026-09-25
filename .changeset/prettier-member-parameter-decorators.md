---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

Class member and parameter decorators, and the comments after them, format like
Prettier.

- A line comment, or a comment on its own line, between a class member's
  decorators and its modifiers (`static`, `accessor`, `readonly`, `get`, …)
  stays after the decorators. It used to move after the modifiers, where it
  broke the line after `static`, which the parser then read as a field of its
  own. The same holds for a parameter property's decorators and its `private`,
  `readonly`, or other modifiers.
- A comment after a parameter's decorator, or inside the decorator's
  arguments, stays there instead of moving before the decorator.
- A parameter's decorators keep a line break written after them, and the
  parameter moves to the next line when the decorators don't fit on its line.
  They used to stay on the parameter's line.
- `prettier-ignore` before a decorated parameter keeps its decorators. They
  used to be deleted.
