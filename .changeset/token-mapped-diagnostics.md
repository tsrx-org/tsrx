---
'@tsrx/core': patch
---

Report more TypeScript errors where they are written in `.tsrx` files, using the parser's tokens:

- A failed `satisfies` check (TS1360) reports on the `satisfies` keyword instead of being dropped (#243).
- A literal that starts a sequence expression, such as `0` in `(0, plain)`, reports at its own column (#232).
- A missing return on a composite return type (`number[]`, `{ a: number }`, `keyof T`) reports TS2355 on the type (#216).
- A superclass with a non-null assertion, such as `extends maybe!`, reports TS2507 (#230).
- A computed key's bracket span maps whatever spaces, comments or line breaks sit inside the brackets.
- The `class` keyword maps correctly after a decorator, `abstract` or `declare` (#193).

A target that builds editor output from a parse without `keywordTokens` still gets these mappings: the tokens are read from a second parse of the source when the AST does not carry them.
