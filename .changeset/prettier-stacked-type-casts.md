---
'@tsrx/prettier-plugin': patch
---

The formatter keeps every JSDoc type cast when casts are stacked or their
parentheses start with a comment:

- `/** @type {Entry} */ (/** @type {unknown} */ (node))`, the usual way to cast
  through `unknown`, used to lose its outer parentheses and print as
  `/** @type {Entry} */ /** @type {unknown} */ (node)`, often with a line break
  after the first comment. Without its parentheses the outer comment is a plain
  comment, so a JavaScript checker saw `node` cast to `unknown` only. Each cast
  now keeps its own pair of parentheses, as Prettier prints them, and `return`
  no longer wraps such a cast in parentheses on separate lines.
- A cast whose parentheses hold a comment or an inner cast before the node,
  such as `/** @type {A} */ (/* note */ node.y)` or
  `/** @type {A} */ (/** @type {B} */ (node).y).z`, used to lose its
  parentheses too, and now keeps them.
- A comment between a call's callee and its argument list, as in
  `foo /** @type {A} */ ((node))`, no longer becomes a cast of the argument.
