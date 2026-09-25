---
'@tsrx/core': patch
'@tsrx/solid': patch
'@tsrx/vue': patch
'@tsrx/prettier-plugin': patch
---

JSX spread children (`<div>{...children}</div>`) now parse, in templates and in
plain TSX, instead of failing with `Unexpected token`:

- React, Preact, and Hono compile them unchanged, and the JSX compiler spreads
  the array into the element's children.
- Solid compiles `{...children}` to `{children}`, which Solid's JSX compiler
  renders the same way. Solid's JSX compiler would otherwise render a spread
  child after the static siblings that follow it.
- Vue reports `Vue TSRX does not support JSX spread children` at the spread
  child, because vue-jsx-vapor drops spread children.
- The editor's virtual TypeScript keeps the spread child, so TypeScript checks
  that the spread value is an array, and hover and go-to-definition work on
  its expression.
- The formatter prints a spread child like an expression child, with its
  expression's comments inside the braces as Prettier prints them.

A spread as an attribute value (`<a b={...c} />`) or as a dynamic tag name
(`<{...c} />`) is still an error, now with a message that says so.
