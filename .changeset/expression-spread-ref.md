---
'@tsrx/core': patch
'@tsrx/solid': patch
'@tsrx/runtime': patch
---

A host element with a spread and a `ref` in a plain-JS expression position
(a ternary arm, a declarator init, or a callback such as
`items.map((item) => <li {...item} ref={cb} />)`) no longer throws a
`ReferenceError` when it renders. Its generated spread binding was declared
only in the type-only print, so the runtime output referenced a name that was
never declared. The element is now wrapped in the same
`(() => { let bag = …; return <li {...bag} … />; })()` closure on every target.

The element's spread and ref are also lowered once instead of twice, which
nested a second normalize call and merged ref around the first. On Solid, an
element in a `.map()` callback inside a template no longer hoists its
normalize call out of the callback, where the callback's parameter is not in
scope.

The same elements no longer report a type error in the editor or `tsrx-tsc`.
`normalize_spread_props_for_ref_attr` now declares the merged `ref` its result
carries, as the new `SpreadRefProps` type, so the compiler's `bag?.ref` read
type-checks for any props bag. Solid elements inside templates now use this
normalizer too when they carry a `ref`, as core's lowering already did.
