---
'@tsrx/core': patch
'@tsrx/hono': patch
---

A dynamic tag (`<{props.tag} />`) no longer gets TS2786 (`cannot be used as a JSX component`) in the editor's type view with Hono 4.13. The type-only `Dynamic` helper now returns what a Hono function component returns, which Hono 4.13's `JSX.ElementType` requires (#1075).

A missing or unknown prop on a dynamic tag's component (`const C = Card; <{C} />`) is now reported at the authored `{C}`, on every target. TypeScript reports it on the generated name of the lowered tag, which had no mapping, so `tsrx-tsc` and the editor dropped it.
