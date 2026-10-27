---
'@tsrx/core': patch
'@tsrx/solid': patch
---

Fixes bugs in hoisting static JSX to module-level constants:

- Static JSX is hoisted only when every tag it reads is ready when the module loads and cannot change later: an import, a function declaration, or a `const` or class declared earlier. A member tag like `<Menu.Item>` is hoisted only when it starts with an import, since the module can assign `Menu.Item` after it loads. A tag that reads `this`, `super`, a local binding, a `let` or `var`, an enum, a namespace, an import alias, or a name the module does not declare is read at render time. Before, `<Screen.Tag>` in a method of `class Screen` threw `Cannot access 'Screen' before initialization` on import, and `<Menu.Item>` rendered an undefined type when `Menu.Item` was assigned later (#204). Intrinsic tags like `<div>` read no binding and are still hoisted.
- A component declared inside another function keeps its static JSX in place. Before, it referenced a static that was never declared and threw a `ReferenceError` when it rendered.
- The temporary that holds a host element's spread props beside a `ref` is named apart from every identifier in the module, so it can't shadow or redeclare a binding the author wrote.
- A raw `<script>` in an expression container or prop of static JSX keeps its body, as in `<div>{<script type="application/json">{"a":1}</script>}</div>`. The script rendered empty (#845).
