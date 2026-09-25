---
'@tsrx/prettier-plugin': patch
---

Binary, logical, conditional, sequence and template literal expressions, and
chains of method calls, now break the way Prettier breaks them.

A chain of operators with the same precedence (`a && b && c`, `a + b + c`)
breaks before every operand, where it used to keep the first operands together
and break only before the last one. The operands after the first line up with
it in an arrow body, a variable initializer, an `if`, `while` or `switch`
condition, a `return` or `throw` argument, and a `Boolean(…)` argument. Under a
unary operator, as a member object, or as a callee, a broken expression breaks
after its `(`. A logical operand of a different logical operator gets
parentheses: `(a && b) || c`. A broken binary or logical `return` or `throw`
argument prints in parentheses with its operands on their own lines.

A long `while` or `do … while` condition moves onto its own lines like an `if`
condition, and a negated logical condition (`!(a && b)`) stays on the keyword
line in both.

A sequence expression breaks after its commas. A nested conditional prints as
one group, so a short `a ? b : c ? d : e` stays on one line after `return`,
`throw` and `export default`. A nested conditional consequent gets parentheses
only on one line, and a nested alternate none, as in Prettier.

An expression inside `${…}` that is written on one line stays on one line, so
a template literal no longer changes on a second pass.

A call on a member lookup prints as a member chain: one that doesn't fit, or
that has more than two calls with function or other non-trivial arguments,
puts each `.name(…)` on its own line, keeping `this`, a factory like
`Object.keys(…)`, or a short identifier that starts a statement on the first
line. A long chain of property lookups breaks before its last lookup, and a
unary operand with comments prints in parentheses of its own.
