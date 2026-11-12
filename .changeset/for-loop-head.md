---
'@tsrx/core': minor
---

An `@for` head that assigns to an existing variable or property, as in `@for (state.item of items)` or `@for (item of items)`, is now reported as TSRX2027 on every target, wherever the loop is nested, instead of compiling to invalid output or to a callback parameter that shadows the variable. A `using` or `await using` loop variable is reported the same way instead of losing its disposal.

Migration: a head without `const` or `let` that compiled before, such as `@for (item of items)`, is now an error. Declare the loop variable: `@for (const item of items)`. To dispose each item, declare the resource in the loop body: `@for (const item of items) { using resource = item; ... }`.

An `await` in a destructuring default of an `@for` head, as in `@for (const [item = await load()] of rows)`, no longer produces a module that fails to load with "Illegal await-expression in formal parameters of async function". The loop callback now destructures the item first and runs the loop body in a block of its own, so the body's declarations can't shadow names the head reads.
