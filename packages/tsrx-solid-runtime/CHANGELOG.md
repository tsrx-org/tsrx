# @tsrx/solid-runtime

## 0.1.13

### Patch Changes

- [#1134](https://github.com/tsrx-org/tsrx/pull/1134)
  [`2b465b4`](https://github.com/tsrx-org/tsrx/commit/2b465b432b515c07047e3eadeb66ff34df95de2d)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - `@for` on Solid now
  accepts any iterable, as on React, Preact, and Hono. A `Set`, a `Map` iterator,
  a generator, or an array with its own iterator no longer throws
  `newItems.slice is not a function` and halts Solid's reactivity; the loop reads
  the source the way `for...of` does and hands `<For>` the resulting array. Arrays
  with the built-in iterator, including store arrays, reach `<For>` as they are.
  The helpers `for_items` and `for_keyed_rows` come from the new
  `@tsrx/solid/iterable` and `@tsrx/solid-runtime/iterable` subpaths, and
  `@tsrx/runtime/iterable` gains `iterable_to_array`.

  A Solid `@for` whose key reads its declared index, as in
  `@for (const item of items(); index i; key i)`, no longer throws
  `ReferenceError: i is not defined` when the list updates. Solid's `keyed`
  callback receives the item alone, so such a loop now computes each key from the
  item and its index up front and renders those rows. A sparse array renders its
  holes as `undefined` items instead of halting Solid's reactivity.

  A Solid `@for` that destructures its item in a loop with a key or an index, as
  in `@for (const { id } of items(); key id)`, now renders the item's values
  instead of `undefined`, and the destructured names follow the row when Solid
  reuses it for another item or an item replaced under the same key. A
  destructured component used as a tag (`<Icon />`) renders through Solid's
  `dynamic`, so it follows the row too.

- [#1227](https://github.com/tsrx-org/tsrx/pull/1227)
  [`0ca1023`](https://github.com/tsrx-org/tsrx/commit/0ca10232569e9beaad7d1d0d53d209e6520385fa)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On Solid, an element
  with several spreads and its own `ref` no longer applies a bag's refs again when
  the bag carries more than one ref and they stay the same. In
  `<input ref={own} {...first()} {...second()} />`, a `first` of
  `{ title, ref: a, extra: named }`, with `named` made by `create_ref_prop`,
  called `a` and `named` again on every update to `first`, because the bag's refs
  merged into a new callback each time. `spread_ref_bags` now merges them with the
  runtime's new `normalize_spread_props_sharing_refs`, which gives a new bag
  carrying the same refs the same `ref`, so they are applied again only when one
  of them changes.

- [#1107](https://github.com/tsrx-org/tsrx/pull/1107)
  [`e9330ea`](https://github.com/tsrx-org/tsrx/commit/e9330ea841e6113e10be39980aae7c0ebfd4b63a)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On Solid, a host
  element with spreads and its own `ref` now behaves as it does in plain Solid
  TSX:

  - `ref={el}` assigns the element to `el`. Before, the compiler put the ref in an
    array with the spreads' refs, and Solid only calls the functions in an array,
    so `el` stayed `undefined`.
  - A `ref` inside a spread is called once. Before, it was called twice (`bag`,
    `own`, `bag`): once through the element's ref array and again by Solid's
    `spread()`.
  - The spread updates when its expression changes, as in
    `<button {...bag()} ref={cb} />`. Before, the bag was read once in a setup
    declaration, so its attributes kept their first values.

  The element now keeps its `ref` as written, and Solid's `spread()` applies the
  spreads' refs. One spread is normalized in place. Solid keeps only the last of
  several spreads' refs, so an element with more than one spread goes through the
  Solid runtime's new `spread_ref_bags`: each bag is normalized lazily in a memo,
  its spread gets it without its `ref`, and one more spread carries every bag's
  ref, so each of them still applies, in order, after the element's own. A bag
  that gains or loses a ref while mounted updates, and the bags stay reactive
  without rebuilding the element's children. The new
  `jsx.hostSpreadRefStrategy: 'spread'` platform option selects this lowering.

- [#1185](https://github.com/tsrx-org/tsrx/pull/1185)
  [`153b526`](https://github.com/tsrx-org/tsrx/commit/153b5267ad6445abdb81f85d5ad32409d6101d7e)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On Solid, host spreads
  no longer redo ref and child work on unrelated updates:

  - A component that spreads its props onto an element creates its children once.
    With `function W(props) @{ <div {...props} /> }`,
    `<W title={title()}><Child /></W>` ran `Child` twice on mount and once more on
    every title change. The spread normalizer read every prop to look for refs,
    and Solid's `children` getter creates the children each time it is read. The
    normalizer now leaves `children` unread, and a copy it makes reads it through
    the original props only when the JSX runtime does.
  - An element with several spreads and its own `ref` applies a bag's ref again
    only when that ref changes. In
    `<input ref={own} {...first()} {...second()} />`, an update to `second` called
    the refs of both bags again. `spread_ref_bags` now hands Solid's `spread()`
    only the refs that changed, and nothing when a bag update keeps its ref.

- Updated dependencies
  [[`2bc4f1f`](https://github.com/tsrx-org/tsrx/commit/2bc4f1fc5fcb9863c926ab3d01b0407e89bbf639),
  [`bf6d334`](https://github.com/tsrx-org/tsrx/commit/bf6d3349a59f8ec1769d5a2f789801af7cd74ff7),
  [`2b465b4`](https://github.com/tsrx-org/tsrx/commit/2b465b432b515c07047e3eadeb66ff34df95de2d),
  [`ced2603`](https://github.com/tsrx-org/tsrx/commit/ced260375637359686e521cce628be3057d455df),
  [`9ff7b5d`](https://github.com/tsrx-org/tsrx/commit/9ff7b5d5f80e7697896d91d5674ccccb389a890d),
  [`6b207b6`](https://github.com/tsrx-org/tsrx/commit/6b207b65e8a339d5fe301c60e72db271ffb9a572),
  [`2473538`](https://github.com/tsrx-org/tsrx/commit/247353854e918f119dafe88f6474a2738cb82ed8),
  [`0ca1023`](https://github.com/tsrx-org/tsrx/commit/0ca10232569e9beaad7d1d0d53d209e6520385fa),
  [`153b526`](https://github.com/tsrx-org/tsrx/commit/153b5267ad6445abdb81f85d5ad32409d6101d7e),
  [`384972f`](https://github.com/tsrx-org/tsrx/commit/384972fcdd5eaeb09b92a852bb3d9ee186689286),
  [`0ee439a`](https://github.com/tsrx-org/tsrx/commit/0ee439a5d94e071ecae594229f61e9b5ee022296),
  [`56dd6f5`](https://github.com/tsrx-org/tsrx/commit/56dd6f573f9c7c822db9d33313317bed16f7fa45)]:
  - @tsrx/runtime@0.2.5

## 0.1.12

### Patch Changes

- Updated dependencies
  [[`baaad3d`](https://github.com/tsrx-org/tsrx/commit/baaad3db8a5ec9add8c584351c2d2040bdee6f49)]:
  - @tsrx/runtime@0.2.4

## 0.1.11

### Patch Changes

- Updated dependencies
  [[`3d6fa8c`](https://github.com/tsrx-org/tsrx/commit/3d6fa8cadecf5c550231101a899960e53796483f),
  [`af6475e`](https://github.com/tsrx-org/tsrx/commit/af6475e7ec2a430d9ef5675d0cd512457572fb16)]:
  - @tsrx/runtime@0.2.3

## 0.1.10

### Patch Changes

- Updated dependencies
  [[`ca84d73`](https://github.com/tsrx-org/tsrx/commit/ca84d7333621ad809593add9f8202c9a16cc6ce3)]:
  - @tsrx/runtime@0.2.2

## 0.1.9

### Patch Changes

- Updated dependencies
  [[`449338e`](https://github.com/tsrx-org/tsrx/commit/449338e4f17ff0e0d0814a1e8dcb8745c5771589)]:
  - @tsrx/runtime@0.2.1

## 0.1.8

### Patch Changes

- Updated dependencies
  [[`6ac7e34`](https://github.com/tsrx-org/tsrx/commit/6ac7e3422a71f19f7defb5dd7df3e8df5d089bfe),
  [`734023b`](https://github.com/tsrx-org/tsrx/commit/734023bbee936d50c67c85396014ad2373f5c550),
  [`dcc0283`](https://github.com/tsrx-org/tsrx/commit/dcc0283a7470773f8a169c8750344ad147c30c99),
  [`79c1359`](https://github.com/tsrx-org/tsrx/commit/79c1359650d7e74914e818bbf179b6a41d06370c),
  [`c2bdb3d`](https://github.com/tsrx-org/tsrx/commit/c2bdb3dbd94f9db0a0a075bc53072da343d73091)]:
  - @tsrx/runtime@0.2.0

## 0.1.7

### Patch Changes

- Updated dependencies
  [[`6908ee3`](https://github.com/tsrx-org/tsrx/commit/6908ee3496562e3c989f2f360cc8a848c2e5ff50)]:
  - @tsrx/runtime@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies
  [[`4d8bc9b`](https://github.com/tsrx-org/tsrx/commit/4d8bc9b8ef0b401f4fb0b4186368fdc8895804b2),
  [`8cf6514`](https://github.com/tsrx-org/tsrx/commit/8cf6514f6fecc04e8fb5b9c37c92424f3f8e3532)]:
  - @tsrx/runtime@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies
  [[`de31ea4`](https://github.com/tsrx-org/tsrx/commit/de31ea41a346e072de42bef3b36716077c681ea8),
  [`e3eaa41`](https://github.com/tsrx-org/tsrx/commit/e3eaa419915db5525829b3a401642c4ffcb16433),
  [`20ff7d5`](https://github.com/tsrx-org/tsrx/commit/20ff7d5ca7c03642e51280690f1e1c875bf75848),
  [`ebab7e0`](https://github.com/tsrx-org/tsrx/commit/ebab7e06fc19b3fe596d6024ea98e75bcd8376a5)]:
  - @tsrx/runtime@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies
  [[`f16c113`](https://github.com/tsrx-org/tsrx/commit/f16c1138d1ac9969afe39696ebf9b41579bb27c5)]:
  - @tsrx/runtime@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies
  [[`544ae9a`](https://github.com/tsrx-org/tsrx/commit/544ae9a51f17a39e66cf0eceea862f8b30307047)]:
  - @tsrx/runtime@0.1.3

## 0.1.2

### Patch Changes

- Republish the TSRX runtime packages from the dedicated TSRX repository so their
  npm metadata and provenance identify `tsrx-org/tsrx`.

- Updated dependencies:
  - @tsrx/runtime@0.1.2

## 0.1.1

### Patch Changes

- [#1398](https://github.com/Ripple-TS/ripple/pull/1398)
  [`6d3417e`](https://github.com/Ripple-TS/ripple/commit/6d3417eb3852a9f0085b273f07079a3b12323712)
  Thanks [@aleclarson](https://github.com/aleclarson)! - Split compiler-emitted
  helpers into shared and renderer-specific runtime packages, and add opt-in
  direct runtime imports across supported build integrations.
- Updated dependencies
  [[`2aa2b6f`](https://github.com/Ripple-TS/ripple/commit/2aa2b6f4beff43b61badd1fb7d11433e9e4f52b3),
  [`6d3417e`](https://github.com/Ripple-TS/ripple/commit/6d3417eb3852a9f0085b273f07079a3b12323712)]:
  - @tsrx/runtime@0.1.1
