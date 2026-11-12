---
'@tsrx/core': patch
---

Compiled output and the editor's type view now keep more of a `.tsrx` file as written:

- An optional binding pattern parameter keeps its `?`, as in `declare function f({ a }?: T): void`. Calling `f()` no longer reports TS2554 (#556).
- A string statement that is not a directive keeps its parentheses, so `('use strict');` no longer compiles to a `'use strict'` directive (#968). An empty directive (`'';`) stays a directive.
- Block-form `/* @ts-expect-error */` and `/* @ts-ignore */` directives now apply in `tsrx-tsc` and the editor, as in TypeScript, including one whose last line holds the directive (#866). The comments around a directive keep their lines, so a plain block comment between a directive and its code still ends the directive's reach, for the line form too. A directive on the line where its statement starts covers the line after it in the source, which the printed code need not keep, so it is left out.
- Block comments print as written. A JSDoc comment no longer gets an extra space after `/**`, and one over several lines keeps its closing line (#1065).
