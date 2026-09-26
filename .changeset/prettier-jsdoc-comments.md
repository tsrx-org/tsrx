---
'@tsrx/prettier-plugin': patch
---

JSDoc comments format like Prettier in two more spots:

- Two JSDoc comments that touch (`*//**`), each over several lines that all start with `*`, stay together as one comment, like Prettier, instead of printing with a space between them or on separate lines. A JSDoc cast in either one keeps its parentheses.
- A line comment inside the parentheses of a JSDoc cast on the left of a binary or logical operator no longer moves the right operand to the next line: `/** @type {T} */ (a && b // c` / `) || d` keeps `|| d` after the `)`.
