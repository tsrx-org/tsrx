---
'@tsrx/core': patch
'@tsrx/solid': patch
'@tsrx/vue': patch
---

Solid now imports the components it generates for `@if`, `@for`, `@switch` and `@try` under private names (`__Show`, `__For`, `__Switch`, `__Match`, `__Errored`, `__Loading`), and Vue imports the `VaporFor` it generates for `@for` as `__VaporFor`. A module can declare its own binding with one of those names (an import from another module, a type-only import, a module or setup local, or a `@for (const Match of rows)` loop variable) without the build failing with "Identifier `Show` has already been declared", and the generated element no longer renders the authored binding in its place. An authored `import type { VaporFor } from 'vue-jsx-vapor'` now stays type-only beside the generated value imports. The compiler now counts a tag as a component whenever its name doesn't start with a lowercase letter, as JSX does, so a tag like `<_Card>` is treated as a component rather than a host element, and Solid doesn't hoist a static `@if`, `@switch` or `@pending` subtree that renders one of its private components.

Vue's `defineVaporComponent` keeps its public name, because vue-jsx-vapor finds components by calls to that name. A Vue module that declares its own binding named `defineVaporComponent` (an import from another module, a module function or `const`, or a local in a component) now gets a compile error, `TSRX2032`, instead of a duplicate declaration or every component wrapped in the authored function. A type-only import of `defineVaporComponent` from `vue-jsx-vapor` becomes the value import the compiler needs.
