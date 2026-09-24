---
'@tsrx/prettier-plugin': patch
---

The formatter no longer changes what code does when a loop or `if` has an empty
body, or when a comment starts a returned value, and it lays out assigned values
the way Prettier does:

- An empty statement body keeps its `;`. `if (a);` followed by `count++;` used
  to print as `if (a)` followed by `count++;`, which made `count++` the body. The
  same applied to `while`, `for`, `for…in`, `for…of`, `do`, and `else`. A `do`
  loop whose body is not a block now prints `while` on its own line, as
  Prettier does.
- A short conditional initializer stays on the `=` line: `const g = a || b ? c : d;`
  and `const x = a ? (b ? c : d) : e;` no longer break after the `=`. Longer
  ones follow Prettier: a binary or logical test breaks after the `=`, and any
  other test stays on the `=` line while the branches break.
- A comment that starts a variable initializer, assignment, class field, or
  object property value no longer pushes the value to column zero. An own-line
  comment prints below the operator with the value indented under it, and a
  comment right after the operator stays on that line.
- `return` and `throw` keep their argument when a comment inside the argument's
  leading parentheses ends its line, as in `return (` + `// note` + `a || b` +
  `)();` on separate lines, or when two block comments lead the argument, as in
  `return /* a */ /* b */ x;`. Both used to print a line break right after
  `return`, which returned `undefined`.
