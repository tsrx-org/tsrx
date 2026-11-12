---
'@tsrx/core': minor
---

A `var` declared in an `@if`, `@for`, `@switch` or `@try` body (including `@else`, `@empty`, `@case`, `@default`, `@pending` and `@catch` bodies), in a `@{ … }` block that isn't a function's own body (a child or a value, such as `<div>@{ var y = 1; <p>{y}</p> }</div>`), or in a plain block or loop inside one of these, is now reported as TSRX2030 on every target, at the `var` keyword, with a hint to use `const` or `let`. Before, it compiled without an error, but the body or block runs in a function of its own, so code after it that read the variable threw `ReferenceError` at render. A `var` in a component's own `@{ … }` body, or in a function or class inside the body or block, is still allowed.

Migration: declare the variable with `const` or `let`. If code after the directive or block reads the value, compute it before instead, since some targets run a directive body later or more than once.
