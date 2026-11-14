---
'@tsrx/core': patch
---

When a generic arrow function's body has a syntax error (`const f = <T,>(x: T) => { const z; return x +; };`), a collecting parse now records the checker errors before it, such as TS1155 for `const z;`, and then throws the syntax error, as it does for an arrow function without type parameters. Before, it recorded nothing, where a strict parse threw TS1155. A generic async arrow function keeps its body's errors only; its parameters' errors come once it's read, as before. In a signature's parameter default, a strict parse now throws that TS1155 too, as for an arrow function without type parameters.
