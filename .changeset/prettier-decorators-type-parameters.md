---
'@tsrx/prettier-plugin': patch
---

Decorators after `export` and long type parameters format like Prettier.

- Decorators written after `export` (`export @dec class A {}`) stay after it,
  with `export`, each decorator, and `class` on their own lines. They used to
  move above `export`. Decorators written before `export` still print there.
- A class expression's decorators in parentheses, as in
  `(@dec class {}).name`, go on their own lines inside the parentheses.
- A type parameter whose constraint or default doesn't fit breaks after
  `extends` or `=`, with the type indented on the next line, before it breaks
  inside the type.
- The type parameter list of an arrow function with one type parameter breaks
  when it doesn't fit, like other type parameter lists. A comma written after a
  constrained parameter (`<T extends X,>`) is dropped, since the constraint
  already tells the list from JSX.
