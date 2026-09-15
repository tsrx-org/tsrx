# @tsrx/runtime

## 0.2.1

### Patch Changes

- [#116](https://github.com/tsrx-org/tsrx/pull/116)
  [`449338e`](https://github.com/tsrx-org/tsrx/commit/449338e4f17ff0e0d0814a1e8dcb8745c5771589)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Classify object refs in
  one pass inside `mergeRefs`, `apply_ref_value`, and `collect_ref_cleanups`. The
  DOM-node check previously ran once per `current`/`value` key probe, so
  value-style and non-ref objects paid for it twice per application. Array-valued
  refs now collect flat cleanup pairs instead of allocating a closure per item.

## 0.2.0

### Minor Changes

- [#110](https://github.com/tsrx-org/tsrx/pull/110)
  [`dcc0283`](https://github.com/tsrx-org/tsrx/commit/dcc0283a7470773f8a169c8750344ad147c30c99)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Remove the unused
  `exclude_prop_from_object` language helper (also re-exported from
  `@tsrx/core/runtime/language-helpers`). Its last in-repo callers, the Solid and
  Vue `<Dynamic>` runtime wrappers, were replaced by compiler lowering; props are
  plain objects, so a `const { is, ...rest } = props` spread covers the remaining
  use.

- [#113](https://github.com/tsrx-org/tsrx/pull/113)
  [`79c1359`](https://github.com/tsrx-org/tsrx/commit/79c1359650d7e74914e818bbf179b6a41d06370c)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Remove the `array_slice` and
  `iterable_array_from` language helpers (also re-exported from
  `@tsrx/core/runtime/language-helpers`) and the `buildFallback` AST utility. They
  only backed lazy destructuring and the `extractPaths` lowering, both removed;
  their last consumer, the Ripple compiler, now lowers rest and default patterns
  with native destructuring.

### Patch Changes

- [#109](https://github.com/tsrx-org/tsrx/pull/109)
  [`6ac7e34`](https://github.com/tsrx-org/tsrx/commit/6ac7e3422a71f19f7defb5dd7df3e8df5d089bfe)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Speed up
  `normalize_spread_props` by checking own-property enumerability with
  `propertyIsEnumerable` instead of materializing a descriptor object per key,
  preserving the same own-key, descriptor-trap, and getter observation order for
  every source shape.

- [#104](https://github.com/tsrx-org/tsrx/pull/104)
  [`734023b`](https://github.com/tsrx-org/tsrx/commit/734023bbee936d50c67c85396014ad2373f5c550)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Speed up `mergeRefs`
  and `merge_ref_props` mount and unmount by tracking pending cleanups as flat
  tagged entries instead of allocating a closure per ref, preserving callback
  order, cleanup order, and thrown-error behavior.

- [#108](https://github.com/tsrx-org/tsrx/pull/108)
  [`c2bdb3d`](https://github.com/tsrx-org/tsrx/commit/c2bdb3dbd94f9db0a0a075bc53072da343d73091)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Speed up
  `normalize_spread_props` on ref-bearing spreads by passing a single collected
  ref through unchanged and composing multi-ref lists in place, instead of always
  spreading refs into a fresh arguments array for `merge_ref_props`. Merge order,
  cleanup order, and `merge_ref_props`' public behavior are unchanged.

## 0.1.7

### Patch Changes

- [#93](https://github.com/tsrx-org/tsrx/pull/93)
  [`6908ee3`](https://github.com/tsrx-org/tsrx/commit/6908ee3496562e3c989f2f360cc8a848c2e5ff50)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Export
  `property_is_enumerable` from the language helpers module.

## 0.1.6

### Patch Changes

- [#88](https://github.com/tsrx-org/tsrx/pull/88)
  [`4d8bc9b`](https://github.com/tsrx-org/tsrx/commit/4d8bc9b8ef0b401f4fb0b4186368fdc8895804b2)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Speed up `map_iterable` for
  `Set`, `Map`, and other non-array iterables by walking them with `for...of` one
  item behind, storing single-node results without a helper call, and
  preallocating the result from a real `Set` or `Map` size. The size is only a
  capacity hint, so `is_last` and callbacks that mutate the collection behave
  exactly as before. As a side effect of `for...of`, a generator source is now
  closed when the callback throws.

- [#86](https://github.com/tsrx-org/tsrx/pull/86)
  [`8cf6514`](https://github.com/tsrx-org/tsrx/commit/8cf6514f6fecc04e8fb5b9c37c92424f3f8e3532)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fix `map_iterable` passing
  `undefined` items, skipping added entries, and reporting `is_last` early when a
  callback mutates the `Set` or `Map` being iterated. `Set` and `Map` walk the
  peek-ahead iterator path again; arrays keep the preallocated fast path.

## 0.1.5

### Patch Changes

- [#66](https://github.com/tsrx-org/tsrx/pull/66)
  [`de31ea4`](https://github.com/tsrx-org/tsrx/commit/de31ea41a346e072de42bef3b36716077c681ea8)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Speed up
  `iterable_array_from` for non-array length-bearing values by copying indexed
  elements instead of walking the iterator protocol or allocating via
  `Array.from().slice()`.

- [#59](https://github.com/tsrx-org/tsrx/pull/59)
  [`e3eaa41`](https://github.com/tsrx-org/tsrx/commit/e3eaa419915db5525829b3a401642c4ffcb16433)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Speed up
  `iterable_array_from` for arrays by copying indexed elements instead of walking
  the iterator protocol.

- [#67](https://github.com/tsrx-org/tsrx/pull/67)
  [`20ff7d5`](https://github.com/tsrx-org/tsrx/commit/20ff7d5ca7c03642e51280690f1e1c875bf75848)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Speed up `map_iterable`
  for the common single-node `@for` body by preallocating after the first mapped
  value, and use `Set`/`Map` size so `is_last` does not require peeking the next
  iterator result.

- [#69](https://github.com/tsrx-org/tsrx/pull/69)
  [`ebab7e0`](https://github.com/tsrx-org/tsrx/commit/ebab7e06fc19b3fe596d6024ea98e75bcd8376a5)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Avoid allocating a
  second array when merging three or more refs while preserving ref order,
  identity, and cleanup behavior.

## 0.1.4

### Patch Changes

- [#42](https://github.com/tsrx-org/tsrx/pull/42)
  [`f16c113`](https://github.com/tsrx-org/tsrx/commit/f16c1138d1ac9969afe39696ebf9b41579bb27c5)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Avoid allocating a ref
  accumulator when spread props contain no compiler-generated refs.

## 0.1.3

### Patch Changes

- [#35](https://github.com/tsrx-org/tsrx/pull/35)
  [`544ae9a`](https://github.com/tsrx-org/tsrx/commit/544ae9a51f17a39e66cf0eceea862f8b30307047)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Speed up the common
  two-ref merge path without changing ref ordering or cleanup behavior.

## 0.1.2

### Patch Changes

- Republish the TSRX runtime packages from the dedicated TSRX repository so their
  npm metadata and provenance identify `tsrx-org/tsrx`.

## 0.1.1

### Patch Changes

- [#1427](https://github.com/Ripple-TS/ripple/pull/1427)
  [`2aa2b6f`](https://github.com/Ripple-TS/ripple/commit/2aa2b6f4beff43b61badd1fb7d11433e9e4f52b3)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Align iterable helper types
  with runtime and compiler support for iterators and empty fallbacks, and expose
  a shared compiler-side runtime import mode type.

- [#1398](https://github.com/Ripple-TS/ripple/pull/1398)
  [`6d3417e`](https://github.com/Ripple-TS/ripple/commit/6d3417eb3852a9f0085b273f07079a3b12323712)
  Thanks [@aleclarson](https://github.com/aleclarson)! - Split compiler-emitted
  helpers into shared and renderer-specific runtime packages, and add opt-in
  direct runtime imports across supported build integrations.
