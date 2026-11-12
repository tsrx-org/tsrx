---
'@tsrx/core': patch
---

`tsrx-tsc` and the editor now report TypeScript errors in parts of a `.tsrx` file whose mappings were missing:

- The type arguments of an import type, as in `import('./store').Store<Missing>` and `typeof import('./store').create<Missing>` (#552).
- A whole import type, so an ES module used as a type without `typeof` (`type M = import('./store')`) reports TS1340 (#594).
- The options of `import(source, options)` and `import.defer(source, options)` (#599).
- The parameter types of a `declare function` and of an overload signature (#935).
- The key remapping (`as`) clause of a mapped type, including a key type that is not a property key, as `as {}` or `as T[K]` (#939).
