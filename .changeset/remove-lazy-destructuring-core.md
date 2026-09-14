---
'@tsrx/core': minor
---

Remove lazy destructuring (`&{ ... }` and `&[ ... ]`) from the TSRX language, per [RFC #106](https://github.com/tsrx-org/tsrx/discussions/106). `&` followed by `{` or `[` in a binding or assignment position is now a plain syntax error, as it is in TypeScript. The `transform/lazy.js` pass, the `lazy` flag on `ObjectPattern` / `ArrayPattern`, the `lazy` / `lazy_fallback` binding kinds, the lazy AST metadata, the `UNSUPPORTED_LAZY_ASSIGNMENT_POSITION` diagnostic, and the `createLazyContext`, `collectLazyBindings`, `collectLazyBindingsFromStatements`, `preallocateLazyIds`, `applyLazyTransforms`, and `validateUnsupportedLazyAssignmentPosition` exports are gone. Use ordinary destructuring or the target's own state API instead.
