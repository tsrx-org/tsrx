---
'@tsrx/runtime': patch
'@tsrx/solid': patch
'@tsrx/solid-runtime': patch
---

On Solid, host spreads no longer redo ref and child work on unrelated
updates:

- A component that spreads its props onto an element creates its children
  once. With `function W(props) @{ <div {...props} /> }`, `<W title={title()}><Child /></W>`
  ran `Child` twice on mount and once more on every title change. The spread
  normalizer read every prop to look for refs, and Solid's `children` getter
  creates the children each time it is read. The normalizer now leaves
  `children` unread, and a copy it makes reads it through the original props
  only when the JSX runtime does.
- An element with several spreads and its own `ref` applies a bag's ref again
  only when that ref changes. In `<input ref={own} {...first()} {...second()} />`,
  an update to `second` called the refs of both bags again. `spread_ref_bags`
  now hands Solid's `spread()` only the refs that changed, and nothing when a
  bag update keeps its ref.
