---
'@tsrx/core': minor
---

A `return` in an `@else if` body, or in the `@else` after one, outside a function there, is now reported as `TSRX2002` on React, Preact, Vue and Hono, as it already was on Solid and as a `return` in an `@if` body or a plain `@else` already was on every target. Each branch runs in a function of its own, so the `return` only ended the branch: a bare `return` rendered nothing in the `@if`'s place, and `@else if (x) { if (y) return <b />; <i /> }` rendered `<b />` there.

Migration: write the condition in the branch's template: `@else if (x) { if (y) return <b />; <i /> }` becomes `@else if (x) { @if (y) { <b /> } @else { <i /> } }`.
