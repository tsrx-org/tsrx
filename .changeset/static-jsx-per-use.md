---
'@tsrx/solid': patch
'@tsrx/vue': patch
---

A static component used more than once now renders each time on Solid and Vue. These targets no longer hoist static JSX such as `<p class="b">plain</p>` to a module-level constant: Solid and Vue Vapor JSX evaluates to a DOM node, so the constant held one node that every use moved into place. `<Static />` twice rendered one `<p>`, and a static component in a three-row `@for` showed only in the last row. On Vue, which also hoisted inside `@for` and `@if` bodies, a static `@for` row rendered once for the whole list, and a static `@if` branch showed in only one instance of its component. Static JSX now stays in place, and each framework's compiler still parses each template once and clones it per use (#1236, #1240).
