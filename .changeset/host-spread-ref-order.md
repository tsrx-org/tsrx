---
'@tsrx/core': patch
'@tsrx/react': patch
'@tsrx/preact': patch
'@tsrx/hono': patch
---

Adding a `ref` to a host element with a spread no longer changes the order in
which its attributes are evaluated on React, Preact, and Hono. In
`<div data-first={next()} {...{ 'data-second': next() }} ref={cb} />` the
compiler evaluated the spread in a declaration before the element, so
`data-second` got `1` and `data-first` got `2`; a spread on a nested element also
ran before its ancestors' attributes. The spread's props bag is now assigned
where it is spread, `{...(bag = normalize(expr))}`, and the element's `ref`
reads `bag?.ref` afterward, as before.

Platforms opt in with the new `jsx.hostSpreadRefBinding: 'in-place'` option.
Solid and Vue keep the declaration: their compiled JSX evaluates attributes in
its own order, and Solid reads `ref` before the spread.
