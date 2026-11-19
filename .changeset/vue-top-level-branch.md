---
'@tsrx/vue': patch
---

On the Vue target, a component whose only output is an `@for` with setup statements in its body (which renders through `map_iterable`) now follows its props. A Vapor component's setup runs once, and it returned the `map_iterable` call, so the component kept the rows it rendered at mount. The call is now returned in a fragment, which vue-jsx-vapor evaluates in an effect, as it does the same loop inside an element. The rows, or the `@empty` body, still inherit none of the component's attributes, as before.
