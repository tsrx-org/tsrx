---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

Comments keep their places in five more spots:

- A comment next to the parameter name of a type predicate (`asserts /* c */ x`, `x /* c */ is T`) is no longer deleted.
- A union prints its trailing comments inside its indentation, like Prettier, so a line comment after a type parameter's union constraint moves the union to the line after `extends`.
- A block comment on a line of its own before the expression after `new`, `await`, `yield*`, a spread's or rest element's `...`, or a conditional's `?` or `:` stays on that line before the expression, where Prettier's next pass puts it (`const x = new /* c */ Foo();`). A spread in an object still breaks the object, which Prettier keeps expanded.
- A comment after a `continue`, `break`, `debugger`, or `return` with nothing after its keyword, before a `;` on the next line, moves after the `;` like Prettier instead of leading the next statement.
- A comment after a line comment goes on a line of its own, like Prettier, even when it shared a line with a statement's `;` (`foo() // a` / `; // b`), instead of joining the line comment, and a block comment after a comment that prints at the end of the line keeps its order.
