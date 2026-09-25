---
'@tsrx/core': patch
---

A missing `}` is now reported as TypeScript reports it, `'}' expected.`, instead
of `Unexpected token`, for JavaScript and template blocks alike: function and
statement blocks, class bodies, object literals and patterns, `switch` bodies,
namespaces, enums, interfaces, type literals, import and export lists, and
`@{ … }`, `@if`, `@for`, `@switch`, and `@try` bodies, at the end of the input;
and after the expression of a template literal's `${ … }` or an expression
container (`{value}`, `{...spread}`), at whatever token is found in its place.
The position doesn't change. Every other syntax error keeps its message, and
the error is thrown in every parse mode, as before.

An `@if`, `@else`, `@for`, `@empty`, `@try`, `@pending`, or `@catch` body that
is still open at the end of the input, with nothing around it
(`const v = @if (ok) {` and then the end of the file), used to be accepted as if
it were closed: it compiled, and the formatter printed a `}` that was never
written. It now reports `'}' expected.` too, and an open `@try` body reports it
instead of a missing `@catch`.
