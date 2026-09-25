---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

Comments keep their places in one pass in three more spots:

- A comment after a sequence or assignment in parentheses, as an arrow function's body, a declarator's value, a `return` argument, or an assignment's right side, stays inside the parentheses (`const f = () => (a = b /* note */);`), like Prettier. After the parenthesized expression of an expression statement, the argument of a `throw`, the declaration of an `export default`, or an assignment on another assignment's right side, it moves after the `;` at once, where Prettier moves it on its next pass, and so does a line comment after a declarator's or assignment's parenthesized sequence.
- A comment at the end of the line of a type parameter's `=` stays after the `=`, with the default on the next line, indented, like Prettier. One on a line of its own before or after the `=` moves after the constraint at once, as Prettier's next pass does.
- A block comment on a line of its own before a type after a keyword or colon (`keyof`, `typeof`, `infer`, `is`, `as`, `satisfies`, `:`, `=>`, `extends`, `in`, a conditional type's `?` or `:`, an indexed access type's `[`) stays before the type, on the keyword's line, where Prettier's next pass puts it (`type X = keyof /* c */ T;`).

The blank line after a statement also stays when a comment written before its `;`, on an earlier line, moves after it.
