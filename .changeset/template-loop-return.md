---
'@tsrx/core': minor
---

A `return` in a native loop in a template body is now reported, as a `return` right in that body already was: `TSRX2005` in an `@for` body, and `TSRX2001` in an `@try`, `@pending` or `@catch` body or a nested `@{ … }` block, also when that `@try` is in an `@else if` body or an `@for` body. A `return` in an `@empty` body, right in it or in a loop, is now `TSRX2001` too. Before, these compiled on every target, except a loop in an `@try` in an `@else if` body, which Solid rejected with `TSRX2002`. The `return` ended the function the body runs in, so its value rendered in place of that body (the `@for` row, the `@try` body, the `@pending` or `@catch` block, the `@empty` block or the nested block), or in place of the component's output for a code-only block inlined before a `return`, and a bare `return;` rendered nothing there. A `return` in a loop in an `@try` in an `@if` or `@else` body, and on Solid in an `@else if` body, is now `TSRX2001` rather than `TSRX2002`, as a `return` right in that `@try` already was.

Migration: work out the value before the template output and render it conditionally, as in `const hit = list.find(test);` followed by `@if (hit) { <b>{hit}</b> } @else { <i /> }`, or move the loop into a function declared in the body.
