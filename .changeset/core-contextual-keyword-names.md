---
'@tsrx/core': patch
---

Read TypeScript's contextual keywords as plain names where TypeScript does, in modules, functions, blocks and template bodies:

- `type`, `namespace`, `module`, `abstract` or `declare` alone as a statement, with another statement after it on the same line (`type; foo;`), no longer fails with `';' expected.`.
- `declare` before a token that starts no declaration is the name `declare`, followed by the next statement, without an error, as TypeScript reads it. `declare namespace;`, `declare module;` and `declare abstract;` used to compile to `declare;` and drop the second word, `declare global;` compiled to a global augmentation without a body, which doesn't parse, and `declare foo;` reported `';' expected.`.
- `declare type` starts a type alias whatever follows `type`, as in TypeScript: `declare type;` reports TS1003 (`Identifier expected.`) where it compiled to `declare;`, and a name on the next line reports TS1142 (`Line break not permitted here.`).
- `namespace as {}`, `namespace satisfies {}`, `module as {}` and `module satisfies {}` declare a namespace named `as` or `satisfies`, where they compiled to an expression. In a function, block or template body they now report TS1235, as other namespaces there do.
- The words the parser gives a token of their own (`abstract`, `assert`, `asserts`, `declare`, `global`, `keyof`, `module`, `namespace`, `readonly`, `type`, `unique`) work as a label, after `break` and `continue`, and as an `async` arrow function's parameter (`async type => type`). `async as T` and `async satisfies T` parse as expressions.
