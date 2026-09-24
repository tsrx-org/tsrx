---
'@tsrx/core': patch
---

`tsrx-tsc` and the editor now report errors that TypeScript places on a whole
call or parenthesized expression, such as spreading a call result that isn't
iterable (TS2488, `[...createBase()]`), calling a value that isn't callable
(TS2349, `createBase()()` or `(plain)()`), testing a `void` call for truthiness
(TS1345, `if (createVoid())`), or `createBase() as const` (TS1355).

Inside an attribute value, such as `icon={<span class="a" />}`, the editor now
offers CSS support for style blocks, TypeScript support for `<script>` bodies,
and CSS hovers for scoped class names, as it already did elsewhere in a template.
