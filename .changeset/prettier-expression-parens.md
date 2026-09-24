---
'@tsrx/prettier-plugin': patch
---

The formatter now decides parentheses the way Prettier does, so it no longer
drops the ones that change what code means:

- A logical, binary, conditional, `await`, `yield`, unary, arrow or class
  operand that is called, constructed, tagged, accessed, or followed by `!`
  keeps its parentheses. `(primary || fallback)()` used to become
  `primary || fallback()`, and `(await load())()` used to become
  `await load()()`.
- `(yield value) + 1` and `(await value) ** 2` keep their parentheses.
- Parentheses that end an optional chain stay: `(a?.b)()`, `new (a?.b)()`,
  ``(a?.b)`x` ``, `(a?.b)!.c`, and `(a?.b)<T>()`.
- `a || (() => 1)` and `- -a` no longer print as `a || () => 1` and `--a`.

Formatting existing files changes their output in two ways. Parentheses that
do nothing are removed (`const x = (a);` becomes `const x = a;`), except around
JSDoc type casts such as `/** @type {T} */ (value)`. And the readability
parentheses Prettier adds now appear too, for example `(x + y) as string`,
`(a * b) / c`, `{...(a && b)}`, `f((a = 1))`, and
`class A extends (new Base()) {}`.
