---
'@tsrx/core': patch
---

Scoped CSS keeps attribute selectors whose attribute an element sets through its React prop name. Before, `label[for]` next to `<label htmlFor="x">` was commented out as `(unused)`, and so were `meta[http-equiv]` with `httpEquiv`, `form[accept-charset]` with `acceptCharset`, and SVG rules such as `circle[stroke-width]` with `strokeWidth`, although the browser matches them.
