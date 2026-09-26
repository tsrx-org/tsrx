---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

JSDoc type cast comments (`/** @type {X} */`, `/** @satisfies {X} */`) are
placed like Prettier in more spots:

- One at the end of a line now leads the node after it, like Prettier's
  `handleClosureTypeCastComments`, instead of trailing the node before it:
  `f(a, /** @type {X} */` / `b)` prints `f(a, /** @type {X} */ b)` instead of
  `f(a /** @type {X} */, b)`. This keeps a parameter's, a declarator's, or a
  function's JSDoc type, which TypeScript no longer read before the comma. Before
  a statement, a class, interface, object literal, or enum member, a `case`, or a
  template's child, it stays where it is, unlike Prettier, which moves it onto
  that node's line and so gives the node a JSDoc type.
- In a labeled statement, one at the end of a line, or one right before the
  parentheses it casts, stays after the colon instead of moving above the label,
  where the next format dropped the parentheses and the cast.
- When two touching multi-line JSDoc comments (`*//**`) end right before a `(`
  and only the first has `@type`, the comments after the expression stay in the
  parentheses: `/**…@type {A}…*//**…*/ (b // c` / `)` keeps `// c` after `b`.

The comments at the end of a line after a list element's comma also all trail
the element, like Prettier, when a block comment shares their line:
`f(a /* x */, // c` no longer moves `// c` onto a line of its own.
