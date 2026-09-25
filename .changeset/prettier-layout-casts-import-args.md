---
'@tsrx/prettier-plugin': patch
---

Logical and assigned values with JSDoc casts, comments after an `=`, and the
arguments of `import()` format like Prettier.

- An object, array, or element in a JSDoc cast on the right of `&&`, `||`, or
  `??` no longer stays on the operator's line: the expression breaks after the
  `=` and before the cast, like Prettier's `babel` output, which keeps the
  cast's parentheses as a node of their own.
- An assigned conditional whose test is a JSDoc-cast binary or logical
  expression stays after the `=` and breaks inside the cast's parentheses.
- A JSDoc-cast operand with the operator of its parent no longer indents an
  object on the right one level too many, and a short right operand stays on
  the line of the cast's closing parenthesis (`) && c`).
- A block comment that ends the line after an `=` or `:` stays there only when
  the value fits after it; otherwise the comment and the value move below the
  operator. In an assignment chain, the comment and the value follow the
  chain's layout, which also makes a joined comment and value stable on the
  next format.
- `import()` and `import.defer()` break between their source and options like
  call arguments, without a trailing comma, instead of running past the print
  width. A lone string source stays on the line, and a comment on its own line
  before the source stays there.
