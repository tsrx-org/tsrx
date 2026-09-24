---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

Comments in class static blocks, namespaces, and `@{ … }` code blocks now attach
to the statements they belong to, as they already did in a function body:

- A block comment on the same line as the next statement now leads that
  statement. `a; /** @type {Foo} */ (x).y();` used to attach the comment to `a;`,
  so the formatter printed `a; /** @type {Foo} */` and then `x.y();`, dropping
  the JSDoc cast. In a code block, a block comment before the rendered element on
  its line now leads the element.
- A comment after the last statement of a static block or namespace stays inside
  it. It used to move after the closing `}`.
- The comments of an empty static block, namespace, or `declare global` block
  stay inside it. They used to move after the block.

The formatter also keeps blank lines between the statements of a static block.
