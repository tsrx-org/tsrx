---
'@tsrx/core': patch
---

Closures the compiler generates around an `@if` branch, an `@switch` case, or a host element with a spread and a `ref` now run in the same function context as the code around them:

- `<this.Widget />` in a generator method keeps its receiver. Resuming the generator threw `Cannot read properties of undefined (reading 'Widget')` because the generated generator was called without `this` (#502).
- `await using` in a template body makes the closure async and awaited. Before, the closure stayed synchronous, so a server build failed to load with `SyntaxError: Unexpected reserved word` (#501).
- In an async generator, the generated generator is an async generator, so `yield*` on an async iterable works. It threw `is not iterable` (#265).
- The generated generator gets the enclosing `arguments` object itself, so a write such as `arguments[0] = 'changed'` reaches the enclosing generator, and `<arguments.Widget />` reads the enclosing object. Before, it got a copy (#264).
