---
'@tsrx/core': patch
---

In a `.mts` or `.cts` file, a collecting parse no longer records TS7060 for a generic arrow function in a parameter default that TypeScript's checker doesn't check, as tsc reports only TS2371 there: in a function or constructor type, a call, construct or method signature, a `declare` function or class, or an abstract method. A default keeps it where tsc needs the parameter's type: an overload's, a binding pattern's, and without a type annotation, a rest parameter's or one whose parameter a `typeof` in the signature names. The errors of a function's or method's parameter list and return type now come in tsc's order, by position, so an overload's or abstract method's TS2371 comes before the errors after it, and a strict parse throws it.
