---
'@tsrx/core': patch
---

Parse `<=`, `<<`, and `<<=` as whole operators when they are written without
surrounding spaces (`value<=0`, `1<<n`) or when a later arrow made them look
like the start of a generic arrow function. Type arguments that open with a
generic function type (`f<<T>() => T>()`) and generic arrows with function-type
constraints (`<T extends () => void>(task: T) => task`) still parse.
