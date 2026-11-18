# @tsrx/runtime

## 0.2.5

### Patch Changes

- [#1258](https://github.com/tsrx-org/tsrx/pull/1258)
  [`2bc4f1f`](https://github.com/tsrx-org/tsrx/commit/2bc4f1fc5fcb9863c926ab3d01b0407e89bbf639)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A ref list written on
  an element, `ref={[a, b]}`, now calls every ref in it on React, Preact, Hono and
  Vue, as it already did on Solid. These runtimes take a single ref, so the
  compiler passes the list to `__mergeRefs`: React and Hono share the merged ref
  through `merge_element_refs`'s cache, so an inline list is applied once, and
  Preact gets a new callback per render, as its merged refs already do. A list can
  nest, and a falsy entry such as the `false` of `cond && cb` is left out. Beside
  a spread, Preact and Vue no longer drop the list.

  The public `mergeRefs` now reads a ref list as the refs in it and leaves out a
  value that is not a ref instead of throwing, and its type takes lists and the
  falsy `false`, `0` and `''` of `cond && cb`, so the editor accepts
  `ref={[a, b]}` on every target. `merge_element_refs` merges a lone ref object
  from a list rather than giving it back. The `MULTIPLE_REFS` hint no longer
  limits `ref={[a, b]}` to some targets.

- [#1132](https://github.com/tsrx-org/tsrx/pull/1132)
  [`bf6d334`](https://github.com/tsrx-org/tsrx/commit/bf6d3349a59f8ec1769d5a2f789801af7cd74ff7)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - `@for` on React,
  Preact, and Hono now reads its source the way `for...of` does. An array with its
  own `Symbol.iterator`, including an array subclass that overrides it, renders
  the items its iterator yields instead of its indexed items, and an empty array
  whose iterator yields items no longer renders `@empty`. A `Symbol.iterator`
  getter is read once instead of twice. One difference from `for...of` stays as
  before: the loop pulls the next item before it renders the current one, so it
  knows which item is last. `map_iterable` and `map_iterable_async` now infer the
  item type from every member of a union source, so `@for` over
  `string[] | number[]` type-checks with `string | number` items.

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

- [#1266](https://github.com/tsrx-org/tsrx/pull/1266)
  [`ced2603`](https://github.com/tsrx-org/tsrx/commit/ced260375637359686e521cce628be3057d455df)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - With Hono's server
  renderer, a class from Hono's `css` helper beside a scoped `<style>` block now
  renders with the scope classes. ``<span class={css`color: red;`} />`` threw
  `ReferenceError: document is not defined` during server rendering. The scope
  classes now join once the `css` promise settles, and the joined class keeps
  Hono's callbacks, so the rule still reaches `<Style />`. A spread's `class` from
  `css` joins the same way.

- [#1109](https://github.com/tsrx-org/tsrx/pull/1109)
  [`9ff7b5d`](https://github.com/tsrx-org/tsrx/commit/9ff7b5d5f80e7697896d91d5674ccccb389a890d)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On React, Preact, and
  Hono, a host spread and a `ref` beside it are now evaluated as they are in plain
  TSX:

  - A getter in a spread bag is read once. In
    `<input {...bag} data-reads={reads} />` with
    `get title() { return String(++reads); }`, the element rendered
    `title="2" data-reads="2"`: the spread normalizer read every getter, handed
    back the original bag, and the JSX runtime read the getters again. The
    runtime's new `copy_spread_props` and `copy_spread_props_for_ref_attr` return
    the normalized copy instead, and these targets import them in place of
    `normalize_spread_props` and `normalize_spread_props_for_ref_attr`. Solid and
    Vue keep the original bag, which their compiled JSX reads property by
    property.
  - A `ref` expression is evaluated where it is written. In
    `<div ref={initRef()} {...{ 'data-ready': String(ready) }} />`, where
    `initRef()` sets `ready`, the element rendered `data-ready="false"`: the
    merged `ref` attribute moved after the spread and every later attribute. The
    merged `ref` now stays where the element's own `ref` is written, and reads the
    ref of a bag spread after it when the ref is applied.

  A custom platform with `jsx.hostSpreadRefBinding: 'in-place'` now imports
  `copy_spread_props` and `copy_spread_props_for_ref_attr` from its
  `imports.refProp` module, so that module must export them. `@tsrx/runtime/ref`
  and every first-party `*/ref` module re-export them.

- [#1168](https://github.com/tsrx-org/tsrx/pull/1168)
  [`6b207b6`](https://github.com/tsrx-org/tsrx/commit/6b207b65e8a339d5fe301c60e72db271ffb9a572)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A host element with
  scoped styles keeps the class a props spread passes it. Beside a `<style>`
  block, `<span {...props} />` used to render only the scope hash and drop
  `props.className`, and `<span className="base" {...props} />` dropped the scope
  hash. Both now render the spread's class followed by the scope classes, which is
  what plain JSX renders plus the scope hash, on React, Preact, Solid, and Hono.
  Vue already joined them. On Preact and Hono, a spread's `className` written
  before a scoped `class` attribute no longer replaces that attribute
  ([#722](https://github.com/tsrx-org/tsrx/issues/722)).

- [#1232](https://github.com/tsrx-org/tsrx/pull/1232)
  [`2473538`](https://github.com/tsrx-org/tsrx/commit/247353854e918f119dafe88f6474a2738cb82ed8)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Scoped style classes
  now join an element's class the way its target renders that class. Beside a
  `<style>` block, `<div className={props.c} />` rendered
  `class="undefined tsrx-…"` when `c` was unset, and on Solid and Vue
  `class={{ active: on }}` rendered `[object Object] tsrx-…` and
  `class={['a', on && 'b']}` rendered `a,false tsrx-…`. A class that may not be a
  string now joins through the runtime's new `join_scope_class`, which follows the
  target's rendering, set by the new `jsx.classValue` platform option:

  - React and Hono DOM leave out `null`, `undefined`, `true` and `false`, Preact
    renders `true` as text, and Hono's server renders `true` and `false` as text.
    Any other value joins as text.
  - Solid and Vue keep an object or a list class, and leave out other values that
    are not strings, such as numbers and functions.
  - A props spread's class joins the same way on each target.
  - A class that is always a string (a template literal, a choice between string
    literals, a `$class` read) still joins as text, and the editor's type-only
    output is unchanged.

  On Solid and Vue, an authored `className` attribute on an intrinsic element now
  compiles to `class`, joined with a `class` attribute (or, with a spread between
  them, kept in its place, so the target handles them as two `class` attributes:
  Solid keeps the last, Vue joins them), so React-style source keeps its class
  with or without scoped styles. Solid ignored `className`, and Vue rendered a
  static one as a `classname` attribute. The editor checks it as `class` too, so
  it no longer reports that `className` doesn't exist on these targets' elements,
  and hover, rename and go-to-definition still point at the authored `className`.
  Components, member and dynamic tags (which may be components) and spread bags
  keep `className` as written.

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

- [#1239](https://github.com/tsrx-org/tsrx/pull/1239)
  [`384972f`](https://github.com/tsrx-org/tsrx/commit/384972fcdd5eaeb09b92a852bb3d9ee186689286)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On React, Preact, Hono
  and Vue, a host spread whose bag's `ref` is a ref list now calls every ref in
  it. `<input {...{ title, ref: [a, b] }} />` called neither `a` nor `b`: the
  spread normalizer passed a lone list to the framework as is, and React warned
  "Unexpected ref object". Beside the element's own ref, Preact and Vue also
  dropped the list. The normalizer now merges a list even when it is the bag's
  only ref, as it already did beside a `create_ref_prop` ref prop. A list of one
  ref object is merged as well, so a `{ value }` ref is written as such rather
  than read as the framework's own kind of ref object. On React and Hono the
  merged ref is shared as `merge_element_refs` shares it, so an inline list
  written each render is applied once. Solid is unchanged, because its spread
  applies a ref list itself.

- [#1218](https://github.com/tsrx-org/tsrx/pull/1218)
  [`0ee439a`](https://github.com/tsrx-org/tsrx/commit/0ee439a5d94e071ecae594229f61e9b5ee022296)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On React and Hono, a
  host spread whose bag carries several refs, such as a `ref` and a ref prop made
  with `create_ref_prop`, no longer detaches and reattaches them on every render.
  In `<div {...{ title, ref: a, extra: named }} />`, each update ran `a(null)`,
  `named(null)`, `a(el)` and `named(el)`, with or without a `ref` of the element's
  own, because the spread normalizer merged the bag's refs into a new callback
  each time. On these targets it now merges them as `merge_element_refs` does, so
  a new bag carrying the same refs gets the same `ref`, and its refs are applied
  again only when one of them changes. `merge_element_refs` now also keys a ref
  list by the refs in it, so an inline `ref: [a, b]` written each render is
  applied once as well, and a list whose refs change is applied again.

  Preact is unchanged, for the reason given for `merge_element_refs`. A custom
  platform that sets `jsx.shareMergedRefs` with `hostSpreadRefBinding: 'in-place'`
  imports the runtime's new `copy_spread_props_sharing_refs` and
  `copy_spread_props_for_ref_attr_sharing_refs` from its `imports.refProp` module,
  which `@tsrx/runtime/ref` and the first-party `*/ref` modules export.

- [#1176](https://github.com/tsrx-org/tsrx/pull/1176)
  [`56dd6f5`](https://github.com/tsrx-org/tsrx/commit/56dd6f573f9c7c822db9d33313317bed16f7fa45)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On React and Hono, an
  element with its own `ref` and a host spread no longer detaches and reattaches
  its refs on every render. In `<input ref={log} {...props.rest} />`, every update
  called `log` with `null` and then with the element again, because the merged
  `ref` was a new callback each time. These targets now merge with the runtime's
  new `merge_element_refs`, which returns a single ref as itself and the same
  callback for the same refs, so a ref is applied again only when one of the refs
  changes, as in plain TSX. A value that is not a ref, such as the `false` of
  `ref={cond && cb}`, is left out.

  Preact is unchanged: it stores a ref's cleanup on the callback itself, so
  elements that shared one merged callback would run each other's cleanups. It
  keeps a new `mergeRefs` callback per element and render.

  A `ref` written before a spread is still evaluated where it is written: it is
  assigned to a binding there, and the merged `ref` follows the spreads. The new
  `jsx.shareMergedRefs` platform option selects `merge_element_refs`; a custom
  platform that sets it imports `merge_element_refs` from its `imports.mergeRefs`
  module, which `@tsrx/runtime/ref` and the first-party `*/ref` modules export.

## 0.2.4

### Patch Changes

- [#233](https://github.com/tsrx-org/tsrx/pull/233)
  [`baaad3d`](https://github.com/tsrx-org/tsrx/commit/baaad3db8a5ec9add8c584351c2d2040bdee6f49)
  Thanks [@leonidaz](https://github.com/leonidaz)! - A host element with a spread
  and a `ref` in a plain-JS expression position (a ternary arm, a declarator init,
  or a callback such as `items.map((item) => <li {...item} ref={cb} />)`) no
  longer throws a `ReferenceError` when it renders. Its generated spread binding
  was declared only in the type-only print, so the runtime output referenced a
  name that was never declared. The element is now wrapped in the same
  `(() => { let bag = …; return <li {...bag} … />; })()` closure on every target.

  The element's spread and ref are also lowered once instead of twice, which
  nested a second normalize call and merged ref around the first. On Solid, an
  element in a `.map()` callback inside a template no longer hoists its normalize
  call out of the callback, where the callback's parameter is not in scope. The
  same holds on every target for an element in a callback inside another element's
  spread argument, such as
  `<List {...{ items: items.map((item) => <li {...item} ref={cb} />) }} />`.

  The same elements no longer report a type error in the editor or `tsrx-tsc`.
  `normalize_spread_props_for_ref_attr` now declares the merged `ref` its result
  carries, as the new `SpreadRefProps` type, so the compiler's `bag?.ref` read
  type-checks for any props bag. Solid elements inside templates now use this
  normalizer too when they carry a `ref`, as core's lowering already did.

## 0.2.3

### Patch Changes

- [#212](https://github.com/tsrx-org/tsrx/pull/212)
  [`3d6fa8c`](https://github.com/tsrx-org/tsrx/commit/3d6fa8cadecf5c550231101a899960e53796483f)
  Thanks [@leonidaz](https://github.com/leonidaz)! - An async component can now
  `await` inside `@for`, `@empty`, `@switch`, and `@if` bodies on React, Preact,
  and the Hono server target. These bodies compile to callbacks and IIFEs that
  were not async, so the output was invalid: builds failed with "`await` is only
  allowed within async functions" and editors reported TS1308. The compiler now
  makes those generated functions async and awaits them in the component. A loop
  body with an `await` compiles to the new `map_iterable_async` runtime helper,
  which finishes one item before it starts the next, like a `for...of` loop in an
  async function. An `await` in a `@catch` body is now reported at the `await`
  itself, because the target calls that fallback during rendering and cannot wait
  for its result.

- [#201](https://github.com/tsrx-org/tsrx/pull/201)
  [`af6475e`](https://github.com/tsrx-org/tsrx/commit/af6475e7ec2a430d9ef5675d0cd512457572fb16)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Render conditional host
  spreads such as `<input {...(enabled && { disabled: true })} />` when the
  condition is false. `normalize_spread_props` now passes every non-object value
  through unchanged instead of throwing `Reflect.ownKeys called on non-object`, so
  `false`, `0`, and `''` spread to nothing as they do in native JSX, and
  `normalize_spread_props_for_ref_attr` returns an empty bag for `null` or
  `undefined` so an element with both a `ref` and a nullish spread no longer
  throws reading `.ref`. The helper types accept the falsy values TypeScript
  allows in a JSX spread, so editors stop reporting them as errors.

## 0.2.2

### Patch Changes

- [#112](https://github.com/tsrx-org/tsrx/pull/112)
  [`ca84d73`](https://github.com/tsrx-org/tsrx/commit/ca84d7333621ad809593add9f8202c9a16cc6ce3)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Reduce mount and
  cleanup overhead for `mergeRefs(a, b)`, including composed spread refs. Track
  the two cleanup steps directly instead of allocating a cleanup array on each
  mount, while preserving single-pass object-ref classification, callback and
  cleanup order, and thrown-error behavior.

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
