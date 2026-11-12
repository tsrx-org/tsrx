---
'@tsrx/core': patch
'@tsrx/runtime': patch
'@tsrx/react': patch
'@tsrx/preact': patch
'@tsrx/solid': patch
'@tsrx/vue': patch
'@tsrx/hono': patch
---

Scoped style classes now join an element's class the way its target renders that class. Beside a `<style>` block, `<div className={props.c} />` rendered `class="undefined tsrx-…"` when `c` was unset, and on Solid and Vue `class={{ active: on }}` rendered `[object Object] tsrx-…` and `class={['a', on && 'b']}` rendered `a,false tsrx-…`. A class that may not be a string now joins through the runtime's new `join_scope_class`, which follows the target's rendering, set by the new `jsx.classValue` platform option:

- React and Hono DOM leave out `null`, `undefined`, `true` and `false`, Preact renders `true` as text, and Hono's server renders `true` and `false` as text. Any other value joins as text.
- Solid and Vue keep an object or a list class, and leave out other values that are not strings, such as numbers and functions.
- A props spread's class joins the same way on each target.
- A class that is always a string (a template literal, a choice between string literals, a `$class` read) still joins as text, and the editor's type-only output is unchanged.

On Solid and Vue, an authored `className` attribute on an intrinsic element now compiles to `class`, joined with a `class` attribute (or, with a spread between them, kept in its place, so the target handles them as two `class` attributes: Solid keeps the last, Vue joins them), so React-style source keeps its class with or without scoped styles. Solid ignored `className`, and Vue rendered a static one as a `classname` attribute. The editor checks it as `class` too, so it no longer reports that `className` doesn't exist on these targets' elements, and hover, rename and go-to-definition still point at the authored `className`. Components, member and dynamic tags (which may be components) and spread bags keep `className` as written.
