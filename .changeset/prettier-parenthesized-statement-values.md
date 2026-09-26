---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

An element that is an expression statement keeps its parentheses, and comments in the parentheses of a statement's value keep their places in one pass:

- `(<div />);` keeps its parentheses and its `;`, which it used to lose, so that the next format read a template element and an empty statement. In a template body (a `@{ … }` code block or a template control-flow branch), an element that starts a longer expression statement, like `(<div />) + 1;`, keeps them too. A multi-line element breaks them around it, and a comment after the element in them moves after the `;`, like Prettier's.
- A comment in the parentheses around the last operand of a statement's binary or logical value (`const x = a || (b /* c */);`) moves after the `;` at once, where Prettier moves it on its next pass. After a `return` or `throw` argument, it prints inside the parentheses the argument breaks in, and after the `;` when it fits. The same goes for a comment at the end of a statement without a `;`.
- A comment before the `)` of the parentheses around an operand's last operand moves after them at once, and a line comment there no longer breaks the operator before them (`30 * (month - 1 // c⏎) + day`).
- A line comment after block comments at the end of a declarator's or assignment's parenthesized sequence moves after the `;` alone, and the block comments stay in the parentheses.
- A comment after the parenthesized body of an arrow function called right away prints inside the parentheses around the arrow function at once.
