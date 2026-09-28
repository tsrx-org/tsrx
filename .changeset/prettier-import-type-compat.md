---
'tsrx-prettier-plugin': patch
---

Preserve both AST representations of TypeScript import types so older Prettier
printers can format expressions such as `type T = import("pkg").Value` without
crashing. Allow Prettier `>=3.6.0` as a peer dependency, with no upper limit.
