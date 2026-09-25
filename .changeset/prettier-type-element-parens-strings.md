---
'@tsrx/prettier-plugin': patch
---

The formatter now handles type parentheses, element operands, and multi-line strings like Prettier:

- Parentheses written around a type are dropped unless the type needs them: `type A = (B | C)` prints as `type A = B | C`, while `(A | B)[]` keeps them. The type is laid out as if the parentheses weren't there, and a conditional type nested in another's true type gets parentheses only on one line.
- An element or fragment used as the operand of `await`, a unary operator, an `as`/`satisfies` cast, a spread, a template literal, or a class property value is parenthesized: `await (<div />)`, `!(<div />)`, `(<b />) as T`, `[...(<b />)]`. Template elements, `@{ }` code blocks, and `<style>` blocks in a template stay bare.
- A string literal that continues onto the next line with a backslash breaks the code around it: an assignment breaks after its `=`, and a call breaks its arguments.
