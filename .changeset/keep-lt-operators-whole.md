---
'@tsrx/core': patch
---

Parse `<=`, `<<`, and `<<=` as whole operators when they are written without
surrounding spaces (`value<=0`, `1<<n`) or when a later arrow made them look
like the start of a generic arrow function. Type arguments that open with a
generic function type (`f<<T>() => T>()`) still parse, and a `<` inside a type
is never read as a JSX tag, so spaced construct signatures (`new <T>(x: T): T`)
and optional generic methods (`f?<T>(x: T): T`) in interfaces, type literals
and classes parse.
