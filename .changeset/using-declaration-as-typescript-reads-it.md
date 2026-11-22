---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

A `using` or `await using` declaration is read where TypeScript reads one. `await` with `using x = y;` on the next line is an `await using` declaration, which compiles to `await using x = y;`, where it failed with TS1005 `';' expected.`. A binding pattern in one (`using {x} = y;`, `await using {x} = y;`, a later declarator such as `using a = b, [x] = y;`, or a `for` head) is TypeScript's TS1492 `'using' declarations may not have binding patterns.` at the pattern, which a strict compile throws and the editor shows, where it failed with TS1434, TS1012 or TS1005. With `declare`, `declare using {x} = y;` and `declare await` with `using x = y;` on the next line now get TypeScript's TS1491 and TS1495 for the `declare`, where they failed with `';' expected.`. The Prettier plugin refuses to format a binding pattern in a `using` declaration, as Prettier's `typescript` parser does.
