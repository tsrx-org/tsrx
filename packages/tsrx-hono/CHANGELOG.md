# @tsrx/hono

## 0.3.1

### Patch Changes

- Updated dependencies
  [[`1668091`](https://github.com/tsrx-org/tsrx/commit/1668091afe1eb8e59bdca59621b11aee3ce40e5c),
  [`760f9fe`](https://github.com/tsrx-org/tsrx/commit/760f9fe5bc5bf51b8eec56743da154f88160a08a),
  [`7e4aaf0`](https://github.com/tsrx-org/tsrx/commit/7e4aaf007deda3af77f24a7daf38ba196802c5d1),
  [`3376fa2`](https://github.com/tsrx-org/tsrx/commit/3376fa2ad40d6ba7cf43845c17e0a10dd130dd89),
  [`440bd21`](https://github.com/tsrx-org/tsrx/commit/440bd21bedc3e32a939f7cd9130bc6e0728ab6cd),
  [`1148a6e`](https://github.com/tsrx-org/tsrx/commit/1148a6e66512d73b21ae36c1497032f9fa6076d4),
  [`462cdbb`](https://github.com/tsrx-org/tsrx/commit/462cdbb17b8f5e2696fe59c02db26313331d7b5b),
  [`522adf4`](https://github.com/tsrx-org/tsrx/commit/522adf487da2e085cd72f4623934e53cde8b335c),
  [`af56597`](https://github.com/tsrx-org/tsrx/commit/af56597e28b606a56a0864bb4401b50520e729fa),
  [`ab88cd8`](https://github.com/tsrx-org/tsrx/commit/ab88cd80e8109ca8273383328ed40de180674dba),
  [`dcf9704`](https://github.com/tsrx-org/tsrx/commit/dcf9704fd1c1e7ead0e608a1faaa4316ce4e462e),
  [`463bd99`](https://github.com/tsrx-org/tsrx/commit/463bd999b2ae1b9c686ad989ff0bd5298964773f),
  [`1c472c2`](https://github.com/tsrx-org/tsrx/commit/1c472c26802cef015346b2a82d1f66863f1c3ca7),
  [`55cb0b1`](https://github.com/tsrx-org/tsrx/commit/55cb0b1640918979802fff5eb053078d21eaf863),
  [`ba3db46`](https://github.com/tsrx-org/tsrx/commit/ba3db468c6b2bf067374ddcb6ded12381b8d9bf3),
  [`a0e9a7a`](https://github.com/tsrx-org/tsrx/commit/a0e9a7a85a2f478fa63b05f085c9952a1fe317b4),
  [`10059ac`](https://github.com/tsrx-org/tsrx/commit/10059ac90e00ab4dbeb6aa26dc96de5b2795672a),
  [`2015571`](https://github.com/tsrx-org/tsrx/commit/20155718ffe8c8d445dd93729168d8a888a5e7bb),
  [`fb920eb`](https://github.com/tsrx-org/tsrx/commit/fb920eb190d03ee81dc4b2b2ee57cddc93333429),
  [`a0f7749`](https://github.com/tsrx-org/tsrx/commit/a0f77497f4370b2ff04412b35f8b3f0a0c0748a8)]:
  - @tsrx/core@0.6.1

## 0.3.0

### Minor Changes

- [#1116](https://github.com/tsrx-org/tsrx/pull/1116)
  [`334af09`](https://github.com/tsrx-org/tsrx/commit/334af09f6686dcc619796c0911debacbe6ab307f)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On React, Preact and
  Hono, the editor now types the `@catch` binding as `unknown` instead of `Error`,
  as Vue already does ([#1076](https://github.com/tsrx-org/tsrx/issues/1076)). The
  binding is the thrown value as it is, which can be a string, `null` or anything
  else. On Hono, `@tsrx/hono/error-boundary` and `@tsrx/hono/dom/error-boundary`
  now declare their own `TsrxErrorBoundary` type over Hono's `ErrorBoundary`,
  whose `fallbackRender` is typed `(error: Error)`.

  Code that type-checked before can now fail: `@catch (e) { <p>{e.message}</p> }`
  reports TS18046 (`'e' is of type 'unknown'`), and an annotation such as
  `@catch (e: Error)` reports TS2322. To migrate, drop the annotation and check
  the value before reading its properties, for example
  `e instanceof Error ? e.message : String(e)`.

- [#1124](https://github.com/tsrx-org/tsrx/pull/1124)
  [`d18720d`](https://github.com/tsrx-org/tsrx/commit/d18720d75e143c26d015d9837fb5d1c860cc0cb9)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - In a `.tsrx` file, and
  any other file with JSX, a `<` where an expression starts begins a generic arrow
  function only where TypeScript's rule for `.tsx` files says it does
  ([#183](https://github.com/tsrx-org/tsrx/issues/183)): a type parameter followed
  by a comma, a default, or a constraint. A lone type parameter without one is now
  a tag, as in TSX, so `<T>(x) => x` no longer compiles or formats, and neither
  does `async <T>(x) => x`, which TypeScript reads as a call. To migrate, add the
  trailing comma: `<T>(x) => x` becomes `<T,>(x) => x`, `async <T>(x) => x`
  becomes `async <T,>(x) => x`, and `<const T>` becomes `<const T,>`. The errors
  for the old forms, an unclosed `<T>` tag and TS7060, now say to add it.

  The rule reads no further than the type parameter, so a generic arrow with a
  constraint compiles whatever its parameters hold (comments, regular expressions,
  template literals), and an element whose text starts like an arrow function,
  such as `<b>(i) => i</b>` or `<script>(i) => i</script>`, is read as an element
  ([#734](https://github.com/tsrx-org/tsrx/issues/734)). A template's render node
  or child is a tag wherever it starts, as before.

  A `.ts`, `.mts`, or `.cts` file has no JSX, as in TypeScript: `<T>(x) => x`
  stays a generic arrow function there, and `<T>x` is now read as a type assertion
  instead of a tag (TS7059 in a `.mts` or `.cts` file).

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

- [#1266](https://github.com/tsrx-org/tsrx/pull/1266)
  [`ced2603`](https://github.com/tsrx-org/tsrx/commit/ced260375637359686e521cce628be3057d455df)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - With Hono's server
  renderer, a class from Hono's `css` helper beside a scoped `<style>` block now
  renders with the scope classes. ``<span class={css`color: red;`} />`` threw
  `ReferenceError: document is not defined` during server rendering. The scope
  classes now join once the `css` promise settles, and the joined class keeps
  Hono's callbacks, so the rule still reaches `<Style />`. A spread's `class` from
  `css` joins the same way.

- [#1195](https://github.com/tsrx-org/tsrx/pull/1195)
  [`46a9b0e`](https://github.com/tsrx-org/tsrx/commit/46a9b0ebef6c308b8f32fd0d8775b05e29b75416)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Hono DOM no longer
  reports `Hono JSX DOM does not support async components` for a component
  registry whose async member is replaced before its use through another name or
  by a built-in. Writing through an alias
  (`const registry = UI; registry.App = …`) or passing the registry to
  `Object.assign`, `Object.defineProperty`, `Object.defineProperties`,
  `Reflect.set` or `Reflect.defineProperty` now counts as replacing its members,
  as `UI.App = …` already did, so the build and the editor stay silent about a
  member they can't prove is still async. An async member that nothing writes is
  still reported, including one read through an alias
  (`const registry = UI; <registry.App />`), one whose registry was only copied
  (`{ ...UI }` or `const { ...copy } = UI`) or used as an `Object.assign` source,
  and one written through `registry ||= UI` (or `??=`, `&&=`) when `registry` is a
  `let` that starts as a value for which that assignment never happens.

- [#1226](https://github.com/tsrx-org/tsrx/pull/1226)
  [`a314547`](https://github.com/tsrx-org/tsrx/commit/a314547cfade0d8e8a8c1b80055181b7565597d4)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Hono DOM no longer
  reports `Hono JSX DOM does not support async components` for a component
  registry that reaches code the check does not follow, which can replace its
  async member before render. Passing the registry to a function (`patch(UI)`) or
  constructor, calling a method on it that isn't an arrow function (`UI.init()`),
  storing it in an object, array or member (`{ ui: UI }`, `[UI]`,
  `holder.ui = UI`), passing it as a component prop, spreading an object that
  holds it onto a component (`<Patch {...{ ui: UI }} />`) or returning it now
  counts as possibly replacing its members, as a write through an alias already
  did; `Object.values`, `Object.entries`, `Object.getOwnPropertyDescriptor`,
  `Object.freeze` and a spread onto a component (`<Patch {...UI} />`) hand on its
  members, so they count as possibly replacing members of those. So does a write
  through an object or array that holds it (`box.ui.App = …`, `list[0].App = …`),
  a `for…of` variable, or a parameter or destructuring default. An async member is
  still reported when its registry is only read, copied with a spread or rest
  element, passed to a built-in that doesn't write, keep or return any of it
  (`console.log`, `JSON.stringify` without a function replacer, `Object.keys` and
  similar), called through an arrow-function member (`UI.App()`), or when only the
  member's own value is passed on (`memo(UI.App)`). A write to a property of an
  async component (`App.displayName = …`, `Object.assign(App, …)`) no longer hides
  it.

- [#1098](https://github.com/tsrx-org/tsrx/pull/1098)
  [`55d2886`](https://github.com/tsrx-org/tsrx/commit/55d2886718cd9134b5c7e7c2ba4129a24d2d94b6)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A dynamic tag
  (`<{props.tag} />`) no longer gets TS2786 (`cannot be used as a JSX component`)
  in the editor's type view with Hono 4.13. The type-only `Dynamic` helper now
  returns what a Hono function component returns, which Hono 4.13's
  `JSX.ElementType` requires
  ([#1075](https://github.com/tsrx-org/tsrx/issues/1075)).

  A missing or unknown prop on a dynamic tag's component
  (`const C = Card; <{C} />`) is now reported at the authored `{C}`, on every
  target. TypeScript reports it on the generated name of the lowered tag, which
  had no mapping, so `tsrx-tsc` and the editor dropped it.

- [#1317](https://github.com/tsrx-org/tsrx/pull/1317)
  [`28440d7`](https://github.com/tsrx-org/tsrx/commit/28440d79a59d6cf54530f386471687f99e914ae8)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The Hono DOM check for
  async components no longer treats `assign` on a local binding named `Object` as
  the built-in `Object.assign`. A value passed after the first argument of such a
  call now counts as possibly written, so an async member the call may replace is
  no longer reported as an async component.

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

- [#1317](https://github.com/tsrx-org/tsrx/pull/1317)
  [`28440d7`](https://github.com/tsrx-org/tsrx/commit/28440d79a59d6cf54530f386471687f99e914ae8)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - An element with its own
  `ref`, then a `key`, then a host spread (`<input ref={r} key="a" {...props} />`)
  keeps its written `key` on Preact and Hono again when the spread bag has a `key`
  too. The binding added for the `ref` went in a spread ahead of `key`, which made
  the JSX compiler pass `key` through `createElement`, where the bag's `key`
  replaced it. The `key` now stays ahead of that spread, as written.

- [#1317](https://github.com/tsrx-org/tsrx/pull/1317)
  [`28440d7`](https://github.com/tsrx-org/tsrx/commit/28440d79a59d6cf54530f386471687f99e914ae8)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The binding that holds
  an element's own `ref` written before a host spread, on React, Preact and Hono,
  now skips any name the module already uses, as spread temporaries do. Before, a
  component declaring `App__ref1` itself got a second `let App__ref1`, which
  failed the build or shadowed the authored value.

- [#1230](https://github.com/tsrx-org/tsrx/pull/1230)
  [`644583f`](https://github.com/tsrx-org/tsrx/commit/644583f0abf521bf04b615e1394d96a3fd1f0d35)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Organize Imports and
  Sort Imports now work in a `.tsrx` module that reads an
  `import.meta.env.platform` flag, with TypeScript 7 and with the TypeScript 5.9
  plugin. They returned no edits there, while Remove Unused Imports worked. The
  compiler appended `export {};` to such a module to keep it a module. Both
  actions also rewrite export declarations, and an edit to code that exists only
  in the generated output made the editor drop the whole action. The marker is now
  added only when the generated code has no import or export of its own
  ([#1207](https://github.com/tsrx-org/tsrx/issues/1207)). `withPlatformTypes`
  takes the generated program as an optional third argument to decide this, and
  keeps adding the marker when it is not passed.

- [#1175](https://github.com/tsrx-org/tsrx/pull/1175)
  [`91d958d`](https://github.com/tsrx-org/tsrx/commit/91d958de44c9e582cd66a5b66aff6bb37ff0ece2)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The compiler now
  imports the components it generates for `@try … @pending`, `@try … @catch` and
  keyed fragment rows under private names (`__Suspense`, `__TsrxErrorBoundary`,
  `__Fragment`). A module can declare its own `Suspense`, `TsrxErrorBoundary` or
  `Fragment` (a type-only import, an import from another module, a local, or a
  `@for` loop variable) without the build failing with "Identifier `Suspense` has
  already been declared", and the generated element no longer renders the authored
  binding in its place. Vue's generated `Suspense` uses the private name too, so
  an authored `import { type Suspense } from 'vue'` no longer leaves it unbound.

  Imports the compiler adds now go after the module's directive prologue, so a
  `'use client'` or `'use server'` directive stays first in a module that uses
  `@pending`, `@catch`, a keyed fragment row or any other construct that needs a
  generated import. Before, the generated imports went above it and turned it into
  a plain string, which Next.js treated as a server component.

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

- [#1198](https://github.com/tsrx-org/tsrx/pull/1198)
  [`14a664d`](https://github.com/tsrx-org/tsrx/commit/14a664d8485a89c9cece8cc2080266cd89cc1329)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On Solid, Vue and Hono
  DOM, whose components can't be async, each `await` in a component is now
  reported once, as TSRX2021 with the target's own message. Before, an `await` in
  a part of the template that renders through a callback (an `@for` body on Solid
  and Vue, an `@try` or `@pending` body on Vue, an `@catch` body on all three, an
  `@if` or `@switch` body with setup statements on Solid) was reported twice: once
  by the target and once by the shared check, whose advice to await the value in
  the component body doesn't apply on these targets. An `@for await` on Vue and
  Hono DOM is no longer also reported as TSRX2024. In collecting mode and in the
  editor, every `await` of a component is now reported, not only the first. An
  `await` in a nested function is still allowed.

  The three messages now live in the error tables in `@tsrx/core/diagnostics`:
  `TARGET_COMPONENT_AWAIT_UNSUPPORTED`
  (`Solid TSRX components do not support \`await\`.`, and the same for Vue) and `HONO_DOM_COMPONENT_AWAIT_UNSUPPORTED`, which keeps Hono DOM's advice to use `use(promise)`with`<Suspense>`. Solid's message was `` `await` is not allowed inside Solid components. `` and Vue's was `` `await`
  is not yet supported in Vue TSRX components. ``.

- [#1228](https://github.com/tsrx-org/tsrx/pull/1228)
  [`f762c09`](https://github.com/tsrx-org/tsrx/commit/f762c09eea9f1071663bdc9d90524f21250132ff)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The last target error
  messages written outside the error tables now come from
  `@tsrx/core/diagnostics`, with their codes unchanged. Hono DOM's error for an
  async component it renders is the new `HONO_DOM_ASYNC_COMPONENT_UNSUPPORTED`
  entry, and now formats `use(promise)` and `<Suspense>` as code. Hono's error for
  `@catch (error, reset)` is the new `TARGET_CATCH_RESET_UNSUPPORTED` entry
  (TSRX2026). Solid's error for the `finally` of a JavaScript `try` that throws in
  a component body raises core's `TEMPLATE_TRY_FINALLY`, so its wording follows
  core's:
  ``Solid TSRX does not support JavaScript `try/finally` in TSRX templates. …``
  (was "in component templates"). When such a `try` has no `catch`, that is now
  its only error. Before, Solid also reported
  ``Solid try statements must have a `pending` or `catch` block.`` over the whole
  statement. Solid's missing-handler check now raises core's
  `TEMPLATE_TRY_HANDLER`.

- [#1114](https://github.com/tsrx-org/tsrx/pull/1114)
  [`c49216e`](https://github.com/tsrx-org/tsrx/commit/c49216e86d15b68c4d84f8763691418d74ad8744)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On React, Preact and
  Hono, a `@try` body's setup statements now run inside its boundary, as they
  already do on Solid and Vue. A synchronous throw in the body, such as
  `const data = load();`, renders the `@catch` fallback instead of escaping the
  boundary, and `use(promise)` called in the body shows the `@pending` fallback
  instead of leaving the root blank
  ([#510](https://github.com/tsrx-org/tsrx/issues/510)). The compiled body renders
  through a new `TsrxTryBody` component from the new `try-body` runtime modules
  (`@tsrx/react/try-body`, `@tsrx/preact/try-body`, `@tsrx/hono/try-body` and the
  matching `-runtime` packages). These modules import nothing, so a `@try` with
  only `@pending` still works in React Server Components. Each `@try` site is
  keyed, so two `@try` blocks rendered in the same place, such as the arms of an
  `@if`, no longer share boundary state or body hooks. A body that uses `await` or
  `yield` still runs inline in the enclosing function, which has to settle it.

  `@catch` now also catches a thrown `null` on React and Preact
  ([#847](https://github.com/tsrx-org/tsrx/issues/847)). Preact itself turns a
  `null` or `undefined` thrown while rendering into a `TypeError`, so on Preact
  the value arrives unchanged only when it is thrown from an effect.

- Updated dependencies
  [[`2bc4f1f`](https://github.com/tsrx-org/tsrx/commit/2bc4f1fc5fcb9863c926ab3d01b0407e89bbf639),
  [`fb35a0b`](https://github.com/tsrx-org/tsrx/commit/fb35a0bf5bbea972889e2024b535d0fee3227856),
  [`28440d7`](https://github.com/tsrx-org/tsrx/commit/28440d79a59d6cf54530f386471687f99e914ae8),
  [`2646239`](https://github.com/tsrx-org/tsrx/commit/26462399753081501e78478de7495d15775e411e),
  [`6eaee99`](https://github.com/tsrx-org/tsrx/commit/6eaee992105984b13c38f9de4edfd6ca99eae399),
  [`972010b`](https://github.com/tsrx-org/tsrx/commit/972010b3654c907baa25cf2f03e3cad9b3d6c6fd),
  [`dac81a4`](https://github.com/tsrx-org/tsrx/commit/dac81a418448476aa4ab60999096dc629627c9b4),
  [`677d574`](https://github.com/tsrx-org/tsrx/commit/677d5743b8cb3d3cd57504ef81f6323ef45b8399),
  [`72956b0`](https://github.com/tsrx-org/tsrx/commit/72956b0d9a4a55c56b210b1b7669f7e04a77709c),
  [`fe2c377`](https://github.com/tsrx-org/tsrx/commit/fe2c377664bdcac510bcd137b6468bec7efe9eeb),
  [`6297ffa`](https://github.com/tsrx-org/tsrx/commit/6297ffa6527f297de69edb95af7a74a87b804970),
  [`25e5844`](https://github.com/tsrx-org/tsrx/commit/25e58444734d535385f2ca4310445b34286369cb),
  [`8c6d037`](https://github.com/tsrx-org/tsrx/commit/8c6d037fdd16d28d871126bf48fba4b2583d9bbf),
  [`54e7644`](https://github.com/tsrx-org/tsrx/commit/54e7644d256f5506fbde84e35ee5e827aaef15ad),
  [`9d8ea3e`](https://github.com/tsrx-org/tsrx/commit/9d8ea3e61a0ed083af98269f703bb73e91421e64),
  [`73c170b`](https://github.com/tsrx-org/tsrx/commit/73c170b4d14f961ce49080c604e233886e71e79d),
  [`129825c`](https://github.com/tsrx-org/tsrx/commit/129825ce427fb80b31c6fcbb148d48781a83485f),
  [`c28d0b7`](https://github.com/tsrx-org/tsrx/commit/c28d0b7356b9c4456cbe4009c5ea2d38260d7660),
  [`827030c`](https://github.com/tsrx-org/tsrx/commit/827030cd1441ec3156414a54a1ab6d3de1f4c34b),
  [`b620e02`](https://github.com/tsrx-org/tsrx/commit/b620e02c284bfdf59c105c2e5d71b14f0cc84228),
  [`d0a00dc`](https://github.com/tsrx-org/tsrx/commit/d0a00dc54713b459a208fb2e044158a46b0143da),
  [`d5015d2`](https://github.com/tsrx-org/tsrx/commit/d5015d25b33980d0509ecccf04a341081fee70db),
  [`4d1def9`](https://github.com/tsrx-org/tsrx/commit/4d1def98977820da6206df0c189a7f525203298e),
  [`6165298`](https://github.com/tsrx-org/tsrx/commit/6165298529f192d72825c7905973ae2acc881921),
  [`ee70085`](https://github.com/tsrx-org/tsrx/commit/ee700855c0c7e14b58163f4693c1797be7e96772),
  [`33022ba`](https://github.com/tsrx-org/tsrx/commit/33022ba2356f9c375242b6edc63ce65fd6215b89),
  [`66a0791`](https://github.com/tsrx-org/tsrx/commit/66a079126a2604436eb2c934ad88f8b78c7c7bc5),
  [`2b465b4`](https://github.com/tsrx-org/tsrx/commit/2b465b432b515c07047e3eadeb66ff34df95de2d),
  [`8d1541b`](https://github.com/tsrx-org/tsrx/commit/8d1541ba83643e51f86b8f46d8034c56bd70d17c),
  [`3603935`](https://github.com/tsrx-org/tsrx/commit/36039352946b9466f337f00dbc4e0662ba78a395),
  [`c7dc4ef`](https://github.com/tsrx-org/tsrx/commit/c7dc4efa939153f7b800500f1ebdc71093066340),
  [`d18720d`](https://github.com/tsrx-org/tsrx/commit/d18720d75e143c26d015d9837fb5d1c860cc0cb9),
  [`9f90c6a`](https://github.com/tsrx-org/tsrx/commit/9f90c6ae8d85f4a65853d42382f5280e504c08f8),
  [`02e39f6`](https://github.com/tsrx-org/tsrx/commit/02e39f6bf7f0941bb5b7226a02cfadeb5f9ff264),
  [`a09bc3d`](https://github.com/tsrx-org/tsrx/commit/a09bc3dffac142c0a8adc347b0683f333b78a705),
  [`bbf7092`](https://github.com/tsrx-org/tsrx/commit/bbf70925ae7944ebba8275b2090247c1e333fe54),
  [`964899b`](https://github.com/tsrx-org/tsrx/commit/964899bd268e026dfe5f4832fb44c7cbb0b42141),
  [`55d2886`](https://github.com/tsrx-org/tsrx/commit/55d2886718cd9134b5c7e7c2ba4129a24d2d94b6),
  [`9ff7b5d`](https://github.com/tsrx-org/tsrx/commit/9ff7b5d5f80e7697896d91d5674ccccb389a890d),
  [`418dc53`](https://github.com/tsrx-org/tsrx/commit/418dc530f0897c9c9f54d61eed1269490d3b29aa),
  [`80316d9`](https://github.com/tsrx-org/tsrx/commit/80316d94773c91a182d15e3bca5e7965ebc225b0),
  [`28440d7`](https://github.com/tsrx-org/tsrx/commit/28440d79a59d6cf54530f386471687f99e914ae8),
  [`135ce77`](https://github.com/tsrx-org/tsrx/commit/135ce776f67596af641c8f2772d0321dbd73274e),
  [`28440d7`](https://github.com/tsrx-org/tsrx/commit/28440d79a59d6cf54530f386471687f99e914ae8),
  [`28440d7`](https://github.com/tsrx-org/tsrx/commit/28440d79a59d6cf54530f386471687f99e914ae8),
  [`3c510ee`](https://github.com/tsrx-org/tsrx/commit/3c510ee11929af366393ce5aa582d72c1c38d3a8),
  [`f38319a`](https://github.com/tsrx-org/tsrx/commit/f38319a6a0f5a133ca0eb9efc864d9e3c69bee4f),
  [`7484f21`](https://github.com/tsrx-org/tsrx/commit/7484f2135be256f099f6e27af704e894b09ee260),
  [`21edc74`](https://github.com/tsrx-org/tsrx/commit/21edc743be4622090b007d015c2f0d2699248777),
  [`3ef0076`](https://github.com/tsrx-org/tsrx/commit/3ef00761631d95ef9fcccbae2673df371d1a4c0d),
  [`15899ed`](https://github.com/tsrx-org/tsrx/commit/15899ed7a3e324f842e5f1662ac3b2c53dbf2605),
  [`b2af266`](https://github.com/tsrx-org/tsrx/commit/b2af26663e24648ca777a6893b2e66b67d5c4d28),
  [`6dbda19`](https://github.com/tsrx-org/tsrx/commit/6dbda190b1fa875d4d196b80c0dcc2903ad41b72),
  [`059ba30`](https://github.com/tsrx-org/tsrx/commit/059ba30018bb3a74d7fbaf2de2d88068c8b30636),
  [`829de73`](https://github.com/tsrx-org/tsrx/commit/829de739887b29e42dea5328b5fb370edf5bc58e),
  [`2aa4bf8`](https://github.com/tsrx-org/tsrx/commit/2aa4bf8b1e38e8be96e149a2b5ba5b6d3c727164),
  [`da9bec8`](https://github.com/tsrx-org/tsrx/commit/da9bec849cd988e39637654951864d1dba98cfc9),
  [`4bdbe57`](https://github.com/tsrx-org/tsrx/commit/4bdbe572d5e5e0ac4a746248f7b4a9109f52e02d),
  [`0fc3819`](https://github.com/tsrx-org/tsrx/commit/0fc3819e6c91a9cc8a2723737dd47f72374ae25f),
  [`357bbcc`](https://github.com/tsrx-org/tsrx/commit/357bbcc9967848cd48a3ddcc59a4b10ed59db3a1),
  [`644583f`](https://github.com/tsrx-org/tsrx/commit/644583f0abf521bf04b615e1394d96a3fd1f0d35),
  [`91d958d`](https://github.com/tsrx-org/tsrx/commit/91d958de44c9e582cd66a5b66aff6bb37ff0ece2),
  [`e0c07b5`](https://github.com/tsrx-org/tsrx/commit/e0c07b55b199acc4fe05b705255e79020b500376),
  [`6b60554`](https://github.com/tsrx-org/tsrx/commit/6b60554c73958e7b2d00f385760d533031417f1f),
  [`6b207b6`](https://github.com/tsrx-org/tsrx/commit/6b207b65e8a339d5fe301c60e72db271ffb9a572),
  [`2473538`](https://github.com/tsrx-org/tsrx/commit/247353854e918f119dafe88f6474a2738cb82ed8),
  [`baf1452`](https://github.com/tsrx-org/tsrx/commit/baf1452ef56f7e481112dd7138a69f9010f113c7),
  [`ab3d989`](https://github.com/tsrx-org/tsrx/commit/ab3d989a68c1c2d68a2d0bfa2a94c4b9019f3f6e),
  [`bb15638`](https://github.com/tsrx-org/tsrx/commit/bb156380f69d2a7fe23d7522a02580d3f4d276af),
  [`e9330ea`](https://github.com/tsrx-org/tsrx/commit/e9330ea841e6113e10be39980aae7c0ebfd4b63a),
  [`190f797`](https://github.com/tsrx-org/tsrx/commit/190f7970cf968c978b3e5df37b4e3a97c4e7efa5),
  [`0ee439a`](https://github.com/tsrx-org/tsrx/commit/0ee439a5d94e071ecae594229f61e9b5ee022296),
  [`56dd6f5`](https://github.com/tsrx-org/tsrx/commit/56dd6f573f9c7c822db9d33313317bed16f7fa45),
  [`10a8901`](https://github.com/tsrx-org/tsrx/commit/10a89015088a283db1f067ffe7803fef4e621859),
  [`1589310`](https://github.com/tsrx-org/tsrx/commit/1589310147fa30e065a10199e75092813ed4bb53),
  [`04ea4f0`](https://github.com/tsrx-org/tsrx/commit/04ea4f0bb85bc3fe25d09366cf04e70d809cc66e),
  [`0546961`](https://github.com/tsrx-org/tsrx/commit/0546961247f011b32370c6c16be3961b2bb5f533),
  [`42e3e49`](https://github.com/tsrx-org/tsrx/commit/42e3e4934d2beaa86d5048c303dfa27498599fec),
  [`70825fb`](https://github.com/tsrx-org/tsrx/commit/70825fb73774dce8753fcff7b6a8bbcdebe3a7fb),
  [`14a664d`](https://github.com/tsrx-org/tsrx/commit/14a664d8485a89c9cece8cc2080266cd89cc1329),
  [`f762c09`](https://github.com/tsrx-org/tsrx/commit/f762c09eea9f1071663bdc9d90524f21250132ff),
  [`ed8c38c`](https://github.com/tsrx-org/tsrx/commit/ed8c38c9fd948270d1136bf269f896402c0d359a),
  [`c07323a`](https://github.com/tsrx-org/tsrx/commit/c07323a54009fc3fbf95503de00d50ddb2b00725),
  [`4344150`](https://github.com/tsrx-org/tsrx/commit/4344150cc4786dd717c1df722370e519ad349647),
  [`c49216e`](https://github.com/tsrx-org/tsrx/commit/c49216e86d15b68c4d84f8763691418d74ad8744),
  [`fb35a0b`](https://github.com/tsrx-org/tsrx/commit/fb35a0bf5bbea972889e2024b535d0fee3227856),
  [`910dbae`](https://github.com/tsrx-org/tsrx/commit/910dbaea2d709ff2f53bf800042c8914bd336939),
  [`d3e8fe4`](https://github.com/tsrx-org/tsrx/commit/d3e8fe44c53fdc64030307dbaaca1448d591cc2e),
  [`e423279`](https://github.com/tsrx-org/tsrx/commit/e423279be7250a493c555bd98e243db4540d654e),
  [`5391890`](https://github.com/tsrx-org/tsrx/commit/539189010bd47564395b7ab2c7108e2b9cc53f76),
  [`5552aa5`](https://github.com/tsrx-org/tsrx/commit/5552aa5ff936fabbec7ee652155df64905968c6a),
  [`4885ba3`](https://github.com/tsrx-org/tsrx/commit/4885ba3808edf0b2a74bb84b880b9c7f4966e5de),
  [`1e58a65`](https://github.com/tsrx-org/tsrx/commit/1e58a65f2be6ff7d3aee1f4bff521d172b997159),
  [`228d7bd`](https://github.com/tsrx-org/tsrx/commit/228d7bd028e879cde8b481a0209d1c3449380c5f),
  [`5422ee1`](https://github.com/tsrx-org/tsrx/commit/5422ee180deb0422f0359629b0cdbf5533abf07b),
  [`c19818c`](https://github.com/tsrx-org/tsrx/commit/c19818ce37642c4508fb2ffd41a8325367d46c36),
  [`ab5a0ff`](https://github.com/tsrx-org/tsrx/commit/ab5a0ff13138746ade811808f27f52d34668ae3f),
  [`04ef167`](https://github.com/tsrx-org/tsrx/commit/04ef16724d4c3d0a85cebef45fbd081673987fa0),
  [`0246e95`](https://github.com/tsrx-org/tsrx/commit/0246e95f983c2efd83e3e99100d00a5ba24c9233)]:
  - @tsrx/core@0.6.0

## 0.2.5

### Patch Changes

- Updated dependencies
  [[`0a967fc`](https://github.com/tsrx-org/tsrx/commit/0a967fcc3df20b9e9e22921ca90d604dd93cf7ec),
  [`5d7314a`](https://github.com/tsrx-org/tsrx/commit/5d7314a0615d1dfcf5ba36cf832d7b4b656885e8),
  [`a420dd1`](https://github.com/tsrx-org/tsrx/commit/a420dd1bd2e3fe7d03d4e93eb666d7d070e7bdb5),
  [`5ce0b5f`](https://github.com/tsrx-org/tsrx/commit/5ce0b5fdff3f86abf578a685869d63b8dfb61f60)]:
  - @tsrx/core@0.5.5

## 0.2.4

### Patch Changes

- Updated dependencies
  [[`885adfb`](https://github.com/tsrx-org/tsrx/commit/885adfb87ddf6907d46e8a98267bdfdad5103d76),
  [`87dda2d`](https://github.com/tsrx-org/tsrx/commit/87dda2d5c8d6154ffe32e7494aaadfc8ac7a27aa),
  [`d2f42e8`](https://github.com/tsrx-org/tsrx/commit/d2f42e8e8403c1653c2928ac7b92c71ee04b9e42),
  [`7accf3c`](https://github.com/tsrx-org/tsrx/commit/7accf3c7fb0d56288827c1804a2d2c1fd1120bff)]:
  - @tsrx/core@0.5.4

## 0.2.3

### Patch Changes

- [#985](https://github.com/tsrx-org/tsrx/pull/985)
  [`5abd474`](https://github.com/tsrx-org/tsrx/commit/5abd474b108bdd780cece1e88e02ccfec265aad4)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Stop moving hooks out of
  template control flow for Vue, Solid and Hono DOM. A hook (or, on Vue, a
  `ref()`, `computed()` or similar call) inside an `@if`, `@for`, `@switch` or
  `@try` body now stays in that body, as it already does for React and Preact, so
  the Rules of Hooks apply as they do in TSX. Give hook state that belongs to a
  branch its own component.

  The type-only output for editors no longer declares an untyped
  `let <Component>__StatementBodyHook<N>;` cache, which TypeScript 7 reported as
  TS7034 and TS7005 under `noImplicitAny`.

  Platform authors: the `moduleScopedHookComponents` and `isTopLevelSetupCall`
  platform hooks, the `moduleScopedHookComponents` transform option, and the
  `planSwitchLift`, `cloneSwitchHelperInvocation` and
  `rewriteLoopContinuesToBareReturns` exports are removed. `createHookSafeHelper`
  now takes `(bodyNodes, sourceNode, ctx, options)`, and the new
  `summarize_switch_case` export returns a `@switch` case's own body.

- Updated dependencies
  [[`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee),
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee),
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee),
  [`5abd474`](https://github.com/tsrx-org/tsrx/commit/5abd474b108bdd780cece1e88e02ccfec265aad4),
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee),
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee),
  [`f518cb9`](https://github.com/tsrx-org/tsrx/commit/f518cb91a120e8a368cece21efbc954135f99dfe)]:
  - @tsrx/core@0.5.3

## 0.2.2

### Patch Changes

- Updated dependencies
  [[`a836f17`](https://github.com/tsrx-org/tsrx/commit/a836f1730d868f4a06b6de019d5c6ff1112db34e)]:
  - @tsrx/core@0.5.2

## 0.2.1

### Patch Changes

- Updated dependencies
  [[`b213995`](https://github.com/tsrx-org/tsrx/commit/b213995b75c1c294d76efc20445e450b3b876eb7)]:
  - @tsrx/core@0.5.1

## 0.2.0

### Minor Changes

- [#790](https://github.com/tsrx-org/tsrx/pull/790)
  [`c70964d`](https://github.com/tsrx-org/tsrx/commit/c70964d76055f1bea742bc15b66044042ef5bfcd)
  Thanks [@leonidaz](https://github.com/leonidaz)! - A `<script>` element is raw
  text, like `<style>`, in templates and in plain JSX. Its body is `content`,
  taken as written, and the element has no children: the `JSXText` child that
  mirrored the body is gone. None of JSX text's rules apply to the body: comments,
  `<`, `>`, character references, and line breaks stay as written, and
  `<script>{code}</script>` is a script whose text is `{code}`, not an expression
  container.

  Each target now outputs the body in the form that renders it exactly, on the
  client and in server HTML:

  - React: `<script>{"…"}</script>`, a string child.
  - Preact and Hono: `<script dangerouslySetInnerHTML={{ __html: "…" }} />`.
  - Solid: `<script innerHTML={"…"} />`.
  - Vue: `<script v-html={"…"} />`.

  Before, the body compiled to JSX text: its lines were joined, so a `// c` line
  commented out the rest of the script, and `&amp;` rendered `&`. In Solid and
  Vue, a `<` rendered `&lt;`. `<script>{code}</script>` threw
  `ReferenceError: code is not defined`. Whether a script runs is still each
  target's decision: a client render runs it in Preact and `hono/jsx/dom`, not in
  React, Solid, and Vue, and server HTML runs it.

  A body ends where HTML ends it: at `</script`, optional whitespace, and `>`, so
  `</script >` closes it. Any other `</script` in the body, in any letter case
  (`</SCRIPT>`), is the `tsrx-script-end-tag-in-body` error, with a hint to write
  `<\/script`. A body of only whitespace outputs an empty script.

  The TypeScript plugin's fallback for a file that doesn't compile ends a body
  where the parser does.

### Patch Changes

- [#950](https://github.com/tsrx-org/tsrx/pull/950)
  [`9cfadf4`](https://github.com/tsrx-org/tsrx/commit/9cfadf4c00dfee8cf546fe1ddbb68cda039d06a1)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Define each error message
  `@tsrx/core` reports once, with its code
  ([#947](https://github.com/tsrx-org/tsrx/issues/947)). The messages and codes
  don't change.

  - `@tsrx/core` exports the errors it reports as `TSRX_ERRORS`, for TSRX's own
    codes, and `TS_ERRORS`, for mistakes TypeScript also reports. An entry is
    `{ code, message }`, or, when its message takes values, a function of them
    that gives one, with the `code` too:
    `TS_ERRORS.MODIFIER_MUST_PRECEDE('export', 'abstract')`.
  - `error()` also takes an entry in place of a message and code.
  - The parser, the analysis and the transform give each error its code where they
    raise it, instead of looking it up by its message. Only acorn's and
    acorn-typescript's own messages are still looked up.
  - The `TSRX_*_ERROR` message exports are the messages of the matching entries.

  `@tsrx/solid`, `@tsrx/vue` and `@tsrx/hono` pass their own errors' codes where
  they raise them, and `@tsrx/prettier-plugin` finds a modifier before `export` by
  its position instead of its message.

- Updated dependencies
  [[`00d47ed`](https://github.com/tsrx-org/tsrx/commit/00d47edc7469deb1fffc229c642136dd35abbb86),
  [`1b3bbe5`](https://github.com/tsrx-org/tsrx/commit/1b3bbe5722dec196f54632e768a920904581568a),
  [`20b17fd`](https://github.com/tsrx-org/tsrx/commit/20b17fd8b8a255e1b32eef17183f710b5b04d4af),
  [`bf793b1`](https://github.com/tsrx-org/tsrx/commit/bf793b13bdc05169b98a7c452df37ae2af4ca953),
  [`9cfadf4`](https://github.com/tsrx-org/tsrx/commit/9cfadf4c00dfee8cf546fe1ddbb68cda039d06a1),
  [`42d62c7`](https://github.com/tsrx-org/tsrx/commit/42d62c703d55fb73c49637ad6ee1e79ffe64e5d9),
  [`de88f59`](https://github.com/tsrx-org/tsrx/commit/de88f59036b5ff6824d85b15d032f79d0b9e36bc),
  [`21bb71e`](https://github.com/tsrx-org/tsrx/commit/21bb71eb3ce94d0ba187b59bf5df9f7902582a49),
  [`f78fada`](https://github.com/tsrx-org/tsrx/commit/f78fadacacff187b666014af086a7b0f3d01430c),
  [`b52c55f`](https://github.com/tsrx-org/tsrx/commit/b52c55f38126ecc76b61dd47c4e8a5aee6c0687e),
  [`454de56`](https://github.com/tsrx-org/tsrx/commit/454de565b60207d4daa8f649e02f3d34deea5ac6),
  [`1fe134b`](https://github.com/tsrx-org/tsrx/commit/1fe134b6316c0fd39688b012ebaaee125a9d2676),
  [`c70964d`](https://github.com/tsrx-org/tsrx/commit/c70964d76055f1bea742bc15b66044042ef5bfcd),
  [`1555269`](https://github.com/tsrx-org/tsrx/commit/1555269944da6e0bdbc7623afea8339d8b737af4),
  [`83c64d3`](https://github.com/tsrx-org/tsrx/commit/83c64d3073e532afdc13c60e25862e316e3e6248),
  [`3aa3b30`](https://github.com/tsrx-org/tsrx/commit/3aa3b30e7eda90482bd933cf6484d6beed60f742),
  [`fec1d81`](https://github.com/tsrx-org/tsrx/commit/fec1d8133898c043ebf71717f5b666c6357b99b6),
  [`0212b6f`](https://github.com/tsrx-org/tsrx/commit/0212b6f5eee220a90014eb57eb34926b1e71b8a9),
  [`c3a3200`](https://github.com/tsrx-org/tsrx/commit/c3a320061861625161f58380d26f2eb61c110fcc),
  [`87df3f4`](https://github.com/tsrx-org/tsrx/commit/87df3f4dac6064b33fbce4f0d7994fd2f31269c6),
  [`41be7e8`](https://github.com/tsrx-org/tsrx/commit/41be7e80e576b548448ee836b0e14d9747e63512),
  [`fcc3dc8`](https://github.com/tsrx-org/tsrx/commit/fcc3dc8151d9da9ae7813854de6876aa69c655f6),
  [`d9e9110`](https://github.com/tsrx-org/tsrx/commit/d9e911015458d677a342f70699e4ce45406b785b),
  [`1091170`](https://github.com/tsrx-org/tsrx/commit/10911705ab6ab4203c42f4bf329f00b16334fc00),
  [`4005d38`](https://github.com/tsrx-org/tsrx/commit/4005d382dba64b7b2e570b3b135a1687139d7aba),
  [`2c964db`](https://github.com/tsrx-org/tsrx/commit/2c964dbe23fe1bdae42e9f9c6329dc3bf1ec03b8),
  [`8eeec66`](https://github.com/tsrx-org/tsrx/commit/8eeec666600f8fc431f78c0040103a1c1314ce09),
  [`c8ec9cc`](https://github.com/tsrx-org/tsrx/commit/c8ec9cc0bfa3c1986ac23f6e3bd67cddf971848b),
  [`c9469b3`](https://github.com/tsrx-org/tsrx/commit/c9469b3bfe1ab5fd1f8ed615fe84ba094ac8ffac),
  [`d746930`](https://github.com/tsrx-org/tsrx/commit/d7469303cbc6ca6c4679251a0ee30eda04f744c8),
  [`e3a627a`](https://github.com/tsrx-org/tsrx/commit/e3a627ae47a5b7440959e174eeb78c07778f6148),
  [`c4fa258`](https://github.com/tsrx-org/tsrx/commit/c4fa258840b04b226f9f527d22b8b5401bdb13af),
  [`b98651c`](https://github.com/tsrx-org/tsrx/commit/b98651c0173b3cacc9d53650a6625e08afedb48f),
  [`d16852a`](https://github.com/tsrx-org/tsrx/commit/d16852a725f7ed3114ba52a9f78b7fec163c4169),
  [`5508243`](https://github.com/tsrx-org/tsrx/commit/5508243824b9984184dd936684a76e67d669d931),
  [`3ea944c`](https://github.com/tsrx-org/tsrx/commit/3ea944c41c0fb35d9118f337cfa68cee1b1424ac),
  [`d1785a1`](https://github.com/tsrx-org/tsrx/commit/d1785a10fda6517901795dc19e8560a09d1bb50e),
  [`f73b676`](https://github.com/tsrx-org/tsrx/commit/f73b676036673cb81975dae7f50ae65c6e4af358),
  [`4701beb`](https://github.com/tsrx-org/tsrx/commit/4701beb167f160945836bb9cc122aa6779bd682d),
  [`4b38c47`](https://github.com/tsrx-org/tsrx/commit/4b38c47d28e84437e074306c31d90324ccac4ffa),
  [`4a5d385`](https://github.com/tsrx-org/tsrx/commit/4a5d3859e47e6a9ad82cb8a7343f52b56bf23218),
  [`b3f3b03`](https://github.com/tsrx-org/tsrx/commit/b3f3b0384ac7ac94dcc4c6efb6b1c455433cd1bc),
  [`1dd7288`](https://github.com/tsrx-org/tsrx/commit/1dd728863fa9f945c972e94b85925e62854ede52),
  [`a5beb97`](https://github.com/tsrx-org/tsrx/commit/a5beb9773e9169d546a1a10623806ea2ec811404),
  [`944a943`](https://github.com/tsrx-org/tsrx/commit/944a943394c9fea12ea72a4e871726c172613136),
  [`9338fdd`](https://github.com/tsrx-org/tsrx/commit/9338fdd35760c4743cf1a79373c8dd2e27849e3b),
  [`2933f42`](https://github.com/tsrx-org/tsrx/commit/2933f427c289a958d108208262716d828d7dbd67),
  [`d02b7e6`](https://github.com/tsrx-org/tsrx/commit/d02b7e6119462890b27f4506d9c5d8eb5258e650),
  [`a7327be`](https://github.com/tsrx-org/tsrx/commit/a7327be124f3a5f8870acd28b46b67aac9d9691d),
  [`d1f89bd`](https://github.com/tsrx-org/tsrx/commit/d1f89bdd27e60ed41b103e546b7b8c280f24fff8),
  [`e82305f`](https://github.com/tsrx-org/tsrx/commit/e82305f84078a5f21f902a30b5cd65e8cb7f633f),
  [`94b9f91`](https://github.com/tsrx-org/tsrx/commit/94b9f91a6279cd3ff03f9c9bf54fe39cf64835e0),
  [`883a8b6`](https://github.com/tsrx-org/tsrx/commit/883a8b622c5e830433244155e13029038fae26a7),
  [`935dfe4`](https://github.com/tsrx-org/tsrx/commit/935dfe4242a07abf54d994afe3e87b9582c3ac2a),
  [`927aa91`](https://github.com/tsrx-org/tsrx/commit/927aa91ae42f06dca2a1a8809bc4149600eb60c9),
  [`3a33f71`](https://github.com/tsrx-org/tsrx/commit/3a33f7154fb8995e5cd5dc60847c8b07ce98eee9),
  [`fd9481c`](https://github.com/tsrx-org/tsrx/commit/fd9481c43470daf1cb335b74772b97886f0d8646),
  [`b51a77e`](https://github.com/tsrx-org/tsrx/commit/b51a77e08ebf686ca23eddcee6ae2ac26128e58a),
  [`3a355da`](https://github.com/tsrx-org/tsrx/commit/3a355daf22b4f9973e0e63f875de7c03fc0a2c45)]:
  - @tsrx/core@0.5.0

## 0.1.8

### Patch Changes

- Updated dependencies
  [[`dcc53cb`](https://github.com/tsrx-org/tsrx/commit/dcc53cba3da00d5f9c155ae48c11cc89764b8333),
  [`bc68cb9`](https://github.com/tsrx-org/tsrx/commit/bc68cb947f616fb83c45f35977156d9a51b6cba7),
  [`36e131a`](https://github.com/tsrx-org/tsrx/commit/36e131ab416f96647a6b2fbe8b6c2dcdc7a39f6c),
  [`ce6bd8d`](https://github.com/tsrx-org/tsrx/commit/ce6bd8dae8693096f344c5b0b9bfa9abe66cdcdf),
  [`baaad3d`](https://github.com/tsrx-org/tsrx/commit/baaad3db8a5ec9add8c584351c2d2040bdee6f49),
  [`e927446`](https://github.com/tsrx-org/tsrx/commit/e9274468033a347f4b54b4c5b0a37e725f242da6),
  [`68d5218`](https://github.com/tsrx-org/tsrx/commit/68d5218d154c3090fe5b40dec5c254db0a780efe),
  [`3b3e128`](https://github.com/tsrx-org/tsrx/commit/3b3e12800e419cadd5e59a9738d724d14e0bd5ee),
  [`b30a4ed`](https://github.com/tsrx-org/tsrx/commit/b30a4ed8769958b86fda39d1492a35b4a229d363),
  [`bff5325`](https://github.com/tsrx-org/tsrx/commit/bff53256b05142b033d7e1753862e518901bc15f),
  [`a7246b9`](https://github.com/tsrx-org/tsrx/commit/a7246b96d409708f3dedcab75f0dc045240e29c8),
  [`24f0184`](https://github.com/tsrx-org/tsrx/commit/24f018462d33856dae1f0452e1432a8a5a535a55),
  [`cb59a43`](https://github.com/tsrx-org/tsrx/commit/cb59a4378cf2403eef1b895343f92648e3112f3b),
  [`b0cb8dd`](https://github.com/tsrx-org/tsrx/commit/b0cb8ddb72bdd2804ae7aad06bb6cc2e83fd2bec),
  [`e404adf`](https://github.com/tsrx-org/tsrx/commit/e404adfa3bd3961092d593d01a20ea7edbe6bd72),
  [`3e09ec2`](https://github.com/tsrx-org/tsrx/commit/3e09ec26a6783ddc8d3b19bdf38bed7c27249a08),
  [`c491400`](https://github.com/tsrx-org/tsrx/commit/c49140047c104cb0e46a3e6736e3fb275753548f),
  [`d734bfa`](https://github.com/tsrx-org/tsrx/commit/d734bfa8178bda5708b171a32917913b5f56f023),
  [`b932928`](https://github.com/tsrx-org/tsrx/commit/b93292872bfa355a4a1adec58de1be5c8890d9e5),
  [`b4ea5ca`](https://github.com/tsrx-org/tsrx/commit/b4ea5ca80ca4d258d808840c514e4afd898bab71),
  [`0c33754`](https://github.com/tsrx-org/tsrx/commit/0c33754e4e32d92302c11fb6a45f056f67f8e0d4),
  [`dbe1851`](https://github.com/tsrx-org/tsrx/commit/dbe18512a4e41a2535dd605ebcea1a5188c8ee5e),
  [`62ef14a`](https://github.com/tsrx-org/tsrx/commit/62ef14a7cbf2a2984849889f52e59d17babd4d2d),
  [`3d9fd90`](https://github.com/tsrx-org/tsrx/commit/3d9fd90d3e052eba3a468101e7497db21fc2e3e7)]:
  - @tsrx/core@0.4.0

## 0.1.7

### Patch Changes

- Updated dependencies
  [[`ca86115`](https://github.com/tsrx-org/tsrx/commit/ca86115f91e9aec052bff27809b7439fd6fa7dbd),
  [`06a9c5c`](https://github.com/tsrx-org/tsrx/commit/06a9c5c699961c7ac1def5196229cc65704f358d)]:
  - @tsrx/core@0.3.3

## 0.1.6

### Patch Changes

- Updated dependencies
  [[`c426225`](https://github.com/tsrx-org/tsrx/commit/c42622548a877bc5a1d2741c96534447679f2ae5)]:
  - @tsrx/core@0.3.2

## 0.1.5

### Patch Changes

- Updated dependencies
  [[`b12105e`](https://github.com/tsrx-org/tsrx/commit/b12105e60a077559e55f59940cb25c0dd73eda8a)]:
  - @tsrx/core@0.3.1

## 0.1.4

### Patch Changes

- [#211](https://github.com/tsrx-org/tsrx/pull/211)
  [`8916c70`](https://github.com/tsrx-org/tsrx/commit/8916c7091156023e716c0d75f0be4a8465c6d5c4)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Adding a `ref` to a host
  element with a spread no longer changes the order in which its attributes are
  evaluated on React, Preact, and Hono. In
  `<div data-first={next()} {...{ 'data-second': next() }} ref={cb} />` the
  compiler evaluated the spread in a declaration before the element, so
  `data-second` got `1` and `data-first` got `2`; a spread on a nested element
  also ran before its ancestors' attributes. The spread's props bag is now
  assigned where it is spread, `{...(bag = normalize(expr))}`, and the element's
  `ref` reads `bag?.ref` afterward, as before.

  Platforms opt in with the new `jsx.hostSpreadRefBinding: 'in-place'` option.
  Solid and Vue keep the declaration: their compiled JSX evaluates attributes in
  its own order, and Solid reads `ref` before the spread.

- Updated dependencies
  [[`3d6fa8c`](https://github.com/tsrx-org/tsrx/commit/3d6fa8cadecf5c550231101a899960e53796483f),
  [`5272aec`](https://github.com/tsrx-org/tsrx/commit/5272aece1c9f0cf2b07cc0f80607b2e8a470b433),
  [`f1a21f6`](https://github.com/tsrx-org/tsrx/commit/f1a21f65557a19d5069f8985dee887ca079e5c4e),
  [`61fc4d6`](https://github.com/tsrx-org/tsrx/commit/61fc4d69cc3807ca9ca423a128c0e7854d1bb36b),
  [`ae4131c`](https://github.com/tsrx-org/tsrx/commit/ae4131c5054e77b4bb1c9ac020c1c827de6ddc5c),
  [`fb52feb`](https://github.com/tsrx-org/tsrx/commit/fb52febb0661dd111e15d55b918236125ab65385),
  [`bbfe88e`](https://github.com/tsrx-org/tsrx/commit/bbfe88e058bc6eefc9c9f08acf1df61e20d44170),
  [`9e25e90`](https://github.com/tsrx-org/tsrx/commit/9e25e90a34724b1b89b7a7735dee737d91bfd0c9),
  [`3bbc283`](https://github.com/tsrx-org/tsrx/commit/3bbc283debdd6e34d598e127259dff27ee154998),
  [`f8bb16d`](https://github.com/tsrx-org/tsrx/commit/f8bb16dfe59309aa4fe19e10e2412c132d29f0d9),
  [`676d943`](https://github.com/tsrx-org/tsrx/commit/676d94395c6561d3f2f7febad1c42fb40b7b0221),
  [`8916c70`](https://github.com/tsrx-org/tsrx/commit/8916c7091156023e716c0d75f0be4a8465c6d5c4),
  [`73c956c`](https://github.com/tsrx-org/tsrx/commit/73c956cf9ea739e948ca2498dcc85fdd2b5954c5),
  [`69b5a33`](https://github.com/tsrx-org/tsrx/commit/69b5a3359edc09ec90b16a721f2f00909f3e4f21),
  [`4cf5823`](https://github.com/tsrx-org/tsrx/commit/4cf5823525daaf683b80a40037d0b7c3c2538b91),
  [`3a13af2`](https://github.com/tsrx-org/tsrx/commit/3a13af2550939c9615048e1b95f6c77ba6dca6d9),
  [`c37eb95`](https://github.com/tsrx-org/tsrx/commit/c37eb95572ec79a369300f4fa69e3a71d76b2703),
  [`3372724`](https://github.com/tsrx-org/tsrx/commit/3372724784db8b8de9ff918b3a048279a587f43d),
  [`6490e51`](https://github.com/tsrx-org/tsrx/commit/6490e519634a5697310b073495033ecbca05e457)]:
  - @tsrx/core@0.3.0

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @tsrx/core@0.2.4

## 0.1.2

### Patch Changes

- Updated dependencies
  [[`ba0be2d`](https://github.com/tsrx-org/tsrx/commit/ba0be2dd06c7b707912a067c20e276c4428a905b)]:
  - @tsrx/core@0.2.3

## 0.1.1

### Patch Changes

- [#92](https://github.com/tsrx-org/tsrx/pull/92)
  [`0e3f36f`](https://github.com/tsrx-org/tsrx/commit/0e3f36fb824e3fa7a74f3464b24a36679052872d)
  Thanks [@kotarotaniguchi0523](https://github.com/kotarotaniguchi0523)! - Add
  Hono server and DOM compiler targets with Vite and Bun integrations. The
  compilers and build integrations support the shared compile-time platform flags;
  DOM editor selection remains explicit, and DOM async-component validation stays
  conservative and same-module.

  Respect later object-property overrides during DOM async-component validation,
  and add server/DOM targets and supported examples to the website playground.
