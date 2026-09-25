---
'@tsrx/prettier-plugin': patch
---

Union and intersection types, JSDoc-cast values, and parenthesized `await` and
`as` expressions now break like Prettier's.

- A union that doesn't fit moves to its own indented lines, one member per line
  after a leading `|`, in type annotations, parameters, return types, class
  fields, and interface members. Before, the first `|` stayed after the colon
  and the other members started at the enclosing indentation. Inside type
  arguments, tuples, and conditional type branches, the union breaks in place,
  a parenthesized union breaks inside its parentheses, and a comment before a
  union moves with it. A union cast with `as` or `satisfies` moves below the
  operator.
- An intersection that doesn't fit breaks after each `&`. An object type stays
  on the line of its `&` and breaks inside its braces.
- A value in a JSDoc cast (`/** @type {T} */ (a && b)`) stays on the `=` line
  and breaks inside the cast's parentheses, instead of moving below the `=`
  like an uncast binary expression.
- An `await`, `as`, or `satisfies` expression that is called or accessed
  (`(await load()).value`) and doesn't fit moves onto its own line inside its
  parentheses, instead of breaking inside the call with the parentheses
  hugging it.
