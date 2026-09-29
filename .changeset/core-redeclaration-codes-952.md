---
'@tsrx/core': patch
---

Report the other redeclarations with the code TypeScript reports for them (#952):

- A `var` in a block below one that declares its name with `let`, `const`, or `using` (`{ let a; var a; }`) is TS2481 `Cannot initialize outer scoped variable 'a' in the same scope as block scoped declaration 'a'.`
- A `let`, `const`, or `using` declaration of a `catch` clause's parameter in its block (`catch (e) { let e; }`) is TS2492 `Cannot redeclare identifier 'e' in catch clause.`
- An enum and another declaration of its name but an enum (`enum E {} let E;`) is TS2567 `Enum declarations can only merge with namespace or other enum declarations.`
- A function declaration that isn't exported comes first in its list, as in TypeScript, so `let a; let a; function a() {}` is TS2300, not TS2451.

These were TS2300 before.
