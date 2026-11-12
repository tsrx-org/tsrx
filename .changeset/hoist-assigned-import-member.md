---
'@tsrx/core': patch
---

On React, Preact and Hono, static JSX whose member tag starts with an import (`<ui.Button>`, `<Menu.Item>`) now stays at render time when the module writes a property under that import anywhere (`ui.Button = Replacement`, `delete ui.Button`, `[ui.Button] = […]`, `Object.assign(ui, …)`), so the replacement renders. Before, it was hoisted to a module-level constant that kept the property's first value (#1292). A tag on a namespace import (`<ns.Button>`) is still hoisted, since a namespace's own properties are read-only.
