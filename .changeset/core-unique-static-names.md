---
'@tsrx/core': patch
---

Give every static hoisted to module level a name of its own. Each function numbered its statics from 1 after its name, so functions with the same name, or none, such as two object or class methods with `@{ … }` bodies, a getter and its setter, or two unnamed arrows, could each hoist a `TSRXTemplate__static1`, output that redeclares a `const`. React, Preact and Hono hoist statics.
