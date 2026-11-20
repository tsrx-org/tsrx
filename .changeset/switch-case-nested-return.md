---
'@tsrx/core': patch
'@tsrx/solid': patch
---

A `return` nested in an `@switch` case body, outside a function there, is now TSRX2009, as a `return` right in the case already was. `@case 1: { if (done) return; <b /> }` compiled with no error on every target, and since each target runs a case in a function of its own, the `return` only ended the case, which rendered nothing. A `return` in a function in the case still compiles. One inside an `@switch` in an `@if` or `@for` body is reported once, as TSRX2009, where it was TSRX2002 or TSRX2005.
