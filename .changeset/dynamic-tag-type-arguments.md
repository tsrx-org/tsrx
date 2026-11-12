---
'@tsrx/core': minor
'@tsrx/prettier-plugin': patch
---

Type arguments after a dynamic tag, as in `<{Tag}<T> />`, now parse and report TSRX2033 on every target, which says to declare a typed alias above the element: `const Typed = Tag<T>;`, then `<{Typed} />`. Most of them used to fail with "Unexpected token". Inside an element's `{ }`, such as `<div>{<{Tag}<string> />}</div>`, they parsed and compiled, but the editor's code passed them to the dynamic helper, so they typed the helper instead of the tag's props; that is now an error too. Collect mode and the editor record the error and leave the type arguments out of the generated code. The Prettier plugin reports the error instead of formatting the file, as it does for TSRX2014.

Migration: declare a typed alias with an instantiation expression above the element, `const Typed = Tag<string>;`, and use `<{Typed} />`.
