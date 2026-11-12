---
'@tsrx/runtime': patch
'@tsrx/hono': patch
---

With Hono's server renderer, a class from Hono's `css` helper beside a scoped `<style>` block now renders with the scope classes. ``<span class={css`color: red;`} />`` threw `ReferenceError: document is not defined` during server rendering. The scope classes now join once the `css` promise settles, and the joined class keeps Hono's callbacks, so the rule still reaches `<Style />`. A spread's `class` from `css` joins the same way.
