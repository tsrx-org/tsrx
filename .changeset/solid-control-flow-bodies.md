---
'@tsrx/solid': patch
---

Two Solid control-flow fixes:

- A `@{ }` block inside an `@if`, `@else if`, `@for`, `@switch` (`@case` or `@default`) or `@try` body now renders its output, whether it is an element's child (`<p>@{ const v = 1; <b>{v}</b> }</p>`) or the whole body. Before, the block's setup ran but its output was dropped, so `<p>` rendered empty. A block that is the whole body now lowers like a body without the `@{ }`: in an `@if`, `@else if` or `@case` its setup runs untracked, once, instead of re-running whenever a signal it reads changes.
- `@switch` now reads its discriminant once and compares every case with that value. Before, each case read it again, so a discriminant with a side effect, such as `@switch (queue.shift())`, consumed one value per case and could render the wrong branch, on the server and in the browser. A discriminant that is not a plain name or property read is now held in a `createMemo`, boxed so that a promise is compared as a value, as a JavaScript `switch` compares it, rather than awaited.
