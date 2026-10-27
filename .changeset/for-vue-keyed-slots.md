---
'@tsrx/core': patch
'@tsrx/vue': patch
---

A keyed Vue `@for` whose item is an array pattern, as in `@for (const [first, second] of rows; key first)`, now destructures each item through its iterator instead of reading `item[0]` and `item[1]`. A `Set`, a string with astral characters, or any other re-iterable item now renders its real values, defaults in the pattern work, and the loop stays on `<VaporFor>`, so keyed rows keep their state and still update in place. The key callback destructures the item too, so an item that can be iterated only once, such as a generator, still can't be keyed by a name its pattern binds. The slot imports `computed` from `vue` in a declaration of its own, beside any authored `import type` or `import * as` from `vue`.

A keyed Vue `@for` no longer rewrites type syntax that shares the loop variable's name: `function <item>(x: item) {}`, `type item = string`, an interface that mentions `item`, and the member name in `typeof Types.item` stay as written instead of becoming `item.value` and failing the build.
