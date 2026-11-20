---
'@tsrx/core': patch
---

On Solid, an error on an `@if` test or a `@for` key is reported on the expression again. Solid prints the test as `<Show when={…}>` and the key as `keyed={(item) => …}`, in a container the compiler gives the expression's location, and the editor mapping of that container started at its `{` (or at the key function's arrow), so TS2352 on `@if (props.n as string)` underlined `rops.n as string`, and on `key (item.id as string)` it underlined `string)`. Such a container's mapping now starts where the expression is printed.
