---
'@tsrx/core': patch
---

In the editor, a member expression, call or `new` expression now maps from its own text when other code starts at the same source position and is printed before it. A platform's AST pass that wraps a member expression in a call with the member's location, as Octane does for template reads, made `value.list[0]` map to `read(value.list[0]`, so an editor diagnostic on it started at `read(`. The same happened with the `(` of a parenthesized sequence (`(count.a++, next())`), with the attribute the Solid target makes from an `@if` test, and with the key function it makes from a `@for` key. The mapping now starts where the printed code has the node's whole source text, apart from whitespace, or else its leftmost identifier; a node printed otherwise keeps its mapping.
