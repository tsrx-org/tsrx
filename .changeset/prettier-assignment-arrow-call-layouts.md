---
'@tsrx/prettier-plugin': patch
---

Assignments, arrow functions, and call arguments now lay out like Prettier's.

- Variable declarations, assignments, class fields, object properties, and type
  aliases pick their layout the way Prettier's `chooseLayout` does. A long
  string or member chain now moves below the `=`, a type alias keeps a type
  that can break by itself on the `=` line (`type T = Foo<` …), and a chain of
  three or more assignments puts each one on its own line.
- A declaration with several declarators puts each declarator after the first
  on its own line once any of them has a value, and keeps a line comment after
  a declarator where it was.
- A curried arrow function (`(a) => (b) => …`) that doesn't fit moves below the
  `=` as a whole or puts each arrow on its own line, instead of breaking the
  last parameter list.
- An arrow function's expression body that doesn't fit starts on the line after
  `=>` instead of breaking inside itself. A conditional body prints in
  parentheses only while it stays on the `=>` line.
- A last-argument arrow function keeps its parameters on the call's line and
  breaks after `=>` (`items.map((item) => ({` …). A leading function argument
  hugs the parentheses only when one short argument follows it, a React hook's
  dependency array can break by itself, and an argument list with a function
  after a broken object prints one argument per line, which also makes that
  case format the same way twice.
- Test calls (`it("…", () => { … })`), `require("…")` calls, and AMD `define`
  calls keep their arguments on one line.
- `declare` is no longer dropped from type aliases and interfaces.
