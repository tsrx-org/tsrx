---
'@tsrx/core': patch
---

An assigned `<style>` block with a `.__proto__` class selector now exposes a
`theme.__proto__` class entry like any other class. The generated theme object
defines the key as its own property instead of setting the object's prototype,
so `theme.__proto__` reads the scoped class string rather than
`Object.prototype`.
