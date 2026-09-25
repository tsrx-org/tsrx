---
'@tsrx/prettier-plugin': patch
---

String literals now pick their quotes the way Prettier does. A string keeps the
configured quote unless it contains more of that quote than of the other one, so
`"say \"hi\""` formats as `'say "hi"'`, and only the chosen quote is escaped. A
string whose quote doesn't change keeps its escapes as written. Directives still
keep their text exactly.

The `extends` and `implements` clauses of a class, and the `extends` clause of
an interface, now break like Prettier's. When the heading doesn't fit, each
clause starts its own indented line and a class body's `{` moves to its own
line. When a clause's types don't fit either, they go one per line under the
keyword. When an assigned class expression (`x = class extends … {}`) doesn't
fit, its superclass moves into parentheses.

Prettier's readability parentheses around types are now added: a function type
that is an arrow function's return type (`(): (() => void) => …`), `typeof` in
an array or indexed access type (`(typeof a)[]`), a type operator inside another
(`keyof (keyof T)`), a union in a rest type, and a conditional type used as a
type parameter constraint. Parentheses written in the source are kept as
before.
