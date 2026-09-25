---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

JSX spread children (`<div>{...children}</div>`) now parse, in templates and in
plain TSX, instead of failing with `Unexpected token`, so the formatter, the
ESLint parser, and the editor can read a file that has one. They are still not
supported: every target now reports `tsrx-jsx-spread-child` at the spread child,
"JSX spread children (`{...items}`) are not supported. Render the array as an
expression child instead: `{items}`." A compile fails with it, and the editor
shows it while keeping the spread child in its virtual TypeScript.

The formatter prints spread children like Prettier does, with the spread
expression's comments inside the braces.

A spread as an attribute value (`<a b={...c} />`) or as a dynamic tag name
(`<{...c} />`) is still a parse error, now with a message that says so.
