---
'@tsrx/core': patch
---

The parser now accepts and rejects these as TypeScript does:

- A `const` type parameter in a function type, a constructor type, or a call, construct or method signature (`type F = <const T>(value: T) => T;`) parses. Before, it failed with `Unexpected keyword 'const'`.
- `asserts` in a return type is a type predicate's modifier only before a name or `this` on its line. Before, `asserts` with the name on the next line parsed as a predicate, and the formatter joined the lines into code TypeScript accepts. Now it reports TypeScript's error after the return type, TS1434 or TS1005.
- An element or fragment as a class's superclass without parentheses (`class A extends <div /> {}`) reports TS1109 `Expression expected.` at its `<`, as TypeScript does. In parentheses it still parses.
