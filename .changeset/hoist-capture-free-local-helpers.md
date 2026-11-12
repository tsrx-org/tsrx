---
'@tsrx/core': patch
'@tsrx/solid': patch
---

On Vue, the helper component that renders a `@catch` body under `@pending` is declared once beside its component, in the enclosing function or namespace body, when the component is inside another function or a namespace and the helper reads nothing from the component's scope (only its own `@catch` parameter, its own locals and bindings outside the component). Before, it was declared in the component's setup, so every instance defined a new helper component. A helper that reads a binding of the component's scope stays in the setup.

On Solid, the temporary that holds a host element's spread props beside a `ref` in an `@if`, `@for` or other branch skips a name the module already uses even when the component's name contains `$` (`App$__spread_props1`). Before, the check missed it, and the temporary shadowed the authored binding of that name.
