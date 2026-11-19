---
'@tsrx/vue': patch
---

On the Vue target, a keyed `@for` row reads its item and index through `.value`, and that rewrite now leaves alone a name that the row's code declares again: a `catch` parameter, a `for`, `for…in` or `for…of` head, a `const`/`let` in a `switch` case, a class expression's name, an `enum` or namespace in a block, an `enum` member, a constructor's parameter property, and a declaration in a class `static` block. Before, `catch (row) { … }` in a row's event handler compiled to `catch(row.value)`, which vue-jsx-vapor rejects as a syntax error, and the same happened to the other declarations. This applies to destructured items (`const { id } of rows`) and to the index too.

A component's `props.children` read likewise leaves alone a `props` that a `switch` case, a class expression's name, an `enum` member or a class `static` block declares, instead of reading the component's default slot.
