---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

Keep dotted namespace names (`namespace A.B { … }`, `declare namespace A.B.C`)
when formatting and compiling TSRX files. Prettier printed the keyword again for
each name part (`namespace A namespace B { … }`), which no longer parses, and the
compilers emitted `namespace Anamespace B`. Shorthand ambient modules
(`declare module 'name';`) also keep their semicolon when formatted and no longer
crash the compilers.
