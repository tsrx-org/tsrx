---
'@tsrx/core': patch
'@tsrx/solid': patch
'@tsrx/vue': patch
---

On Solid and Vue, a `yield` in a template value that the target's JSX compiler moves into an effect, a getter or a callback is now a TSRX compile error, TSRX2034, at the authored `yield`: `` Solid TSRX does not support `yield` in this part of the template: Solid's JSX compiler evaluates it in an effect, a getter or a callback, which cannot yield from the enclosing generator. … `` (and the same for Vue). Before, the build failed later in `babel-preset-solid` or `vue-jsx-vapor` output, with `A 'yield' expression is only allowed in a generator body.` or `The keyword 'yield' is reserved` pointing at compiled code. Yield the value first instead: `const title = yield bag.title;`.

A `yield` those compilers leave in place still compiles, so code that builds today is unchanged. On Solid that is a static value (no member access, call, spread or `in`) in an attribute, a component prop or a lone component child, any event handler or non-array `ref`, a class or style object, and an element nested in the returned one. On Vue, which wraps every element, it is a host spread, which TSRX evaluates before the element. A `yield` in a nested generator function or before the template is allowed on both. React, Preact and Hono evaluate templates eagerly and are unchanged.
