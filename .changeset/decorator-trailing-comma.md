---
'@tsrx/core': patch
---

Accept a trailing comma in a decorator's arguments (`@dec(a,)`, `@dec<T>(a,)`), before a class, a class member or a parameter, as TypeScript does. A formatted decorator whose arguments break (Prettier ends them with a comma) now parses again (#773).
