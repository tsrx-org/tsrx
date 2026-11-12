---
'@tsrx/core': patch
'@tsrx/solid': patch
'@tsrx/solid-runtime': patch
---

On Solid, a host element with spreads and its own `ref` now behaves as it
does in plain Solid TSX:

- `ref={el}` assigns the element to `el`. Before, the compiler put the ref in
  an array with the spreads' refs, and Solid only calls the functions in an
  array, so `el` stayed `undefined`.
- A `ref` inside a spread is called once. Before, it was called twice
  (`bag`, `own`, `bag`): once through the element's ref array and again by
  Solid's `spread()`.
- The spread updates when its expression changes, as in
  `<button {...bag()} ref={cb} />`. Before, the bag was read once in a setup
  declaration, so its attributes kept their first values.

The element now keeps its `ref` as written, and Solid's `spread()` applies the
spreads' refs. One spread is normalized in place. Solid keeps only the last of
several spreads' refs, so an element with more than one spread goes through
the Solid runtime's new `spread_ref_bags`: each bag is normalized lazily in a
memo, its spread gets it without its `ref`, and one more spread carries every
bag's ref, so each of them still applies, in order, after the element's own.
A bag that gains or loses a ref while mounted updates, and the bags stay
reactive without rebuilding the element's children. The new
`jsx.hostSpreadRefStrategy: 'spread'` platform option selects this lowering.
