---
'@tsrx/core': minor
'@tsrx/solid': patch
---

A `return` nested in an `@switch` case body, outside a function there, is now reported as `TSRX2009` on every target, as a `return` right in the case already was. Every target runs a case in a function of its own, so such a `return` only ended the case, not the component: `@case 1: { if (done) return; <b /> }` rendered nothing for the `@switch` when it ran, and `@case 1: { if (x) return <b />; <p /> }` rendered `<b />` in the `@switch`'s place. A `return` in a function in the case still compiles. A `return` in an `@switch` in an `@if` or `@for` body is reported once, as `TSRX2009`, where it was `TSRX2002` or `TSRX2005`.

Migration: write the condition in the case's template: `@case 1: { if (x) return <b />; <p /> }` becomes `@case 1: { @if (x) { <b /> } @else { <p /> } }`.
