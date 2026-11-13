# @tsrx/vue

## 0.4.0

### Minor Changes

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

- [#1296](https://github.com/tsrx-org/tsrx/pull/1296)
  [`00a238c`](https://github.com/tsrx-org/tsrx/commit/00a238cc95013ca90e1fc2bd5fbb47b80c942664)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The Vue packages now
  need `vue` 3.6 or later, including 3.6.0's prereleases (`>=3.6.0-0`), and
  `vue-jsx-vapor` 3.2.27 or a later stable release (`>=3.2.27`). Until Vue 3.6.0
  is stable, install it as `"vue@^3.6.0-0"`.

  - Vue 3.5 has no Vapor, so a Vue 3.5 project never built. Under npm, the old
    `vue >=3.5` also rejected every Vue 3.6 prerelease, so the documented
    `npm install` failed with ERESOLVE whichever Vue it named.
  - `vue-jsx-vapor` 3.2.27 is the first release that fixes both a dev worker that
    imports a module exporting a function
    ([#186](https://github.com/tsrx-org/tsrx/issues/186)) and the space after an
    element that a `{…}` container renders last
    ([#870](https://github.com/tsrx-org/tsrx/issues/870)).
  - A project on `vue-jsx-vapor` 3.2.26 or earlier now gets an unmet peer warning
    from pnpm, and an install error under pnpm's `strict-peer-dependencies`. That
    is why this is a minor release.

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

- [#1085](https://github.com/tsrx-org/tsrx/pull/1085)
  [`4d1def9`](https://github.com/tsrx-org/tsrx/commit/4d1def98977820da6206df0c189a7f525203298e)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Require esrap 2.4 and
  pass it the parser's tokens for editor output. esrap 2.4 removed the
  `boundaryTokens` option that kept the keywords and punctuation of the generated
  TypeScript mapped. A fresh install of `@tsrx/core` already got esrap 2.4, so
  `async` and `function` keywords, Vue's imports, interface declarations, and
  lowered dynamic tags lost their editor mappings. Single type parameters also
  printed as `<T,>` everywhere.

  A generic arrow function with one type parameter now compiles to `<T,>(…) => …`,
  which TypeScript reads as an arrow function in TSX instead of a JSX tag
  ([#707](https://github.com/tsrx-org/tsrx/issues/707)). Other type parameter
  lists print as written. Parameter decorators
  ([#606](https://github.com/tsrx-org/tsrx/issues/606)) and the type arguments of
  a tagged template ([#272](https://github.com/tsrx-org/tsrx/issues/272)) are no
  longer dropped from the compiled output. An array pattern parameter with a type
  annotation no longer prints the annotation twice: on esrap 2.4,
  `function f([a]: number[]) {}` compiled to
  `function f([a]: number[]: number[]) {}`, which does not parse.

- [#1135](https://github.com/tsrx-org/tsrx/pull/1135)
  [`3603935`](https://github.com/tsrx-org/tsrx/commit/36039352946b9466f337f00dbc4e0662ba78a395)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A keyed Vue `@for`
  whose item is an array pattern, as in
  `@for (const [first, second] of rows; key first)`, now destructures each item
  through its iterator instead of reading `item[0]` and `item[1]`. A `Set`, a
  string with astral characters, or any other re-iterable item now renders its
  real values, defaults in the pattern work, and the loop stays on `<VaporFor>`,
  so keyed rows keep their state and still update in place. The key callback
  destructures the item too, so an item that can be iterated only once, such as a
  generator, still can't be keyed by a name its pattern binds. The slot imports
  `computed` from `vue` in a declaration of its own, beside any authored
  `import type` or `import * as` from `vue`. `Suspense`, which `@try … @pending`
  imports, no longer goes into an authored `import type` or `import * as` from
  `vue`, where it was erased or printed as invalid syntax, and is not imported a
  second time beside an authored `import { Suspense } from 'vue'`.

  A keyed Vue `@for` no longer rewrites type syntax that shares the loop
  variable's name: `function <item>(x: item) {}`, `type item = string`, an
  interface that mentions `item`, and the member name in `typeof Types.item` stay
  as written instead of becoming `item.value` and failing the build.

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

- [#1222](https://github.com/tsrx-org/tsrx/pull/1222)
  [`e0c07b5`](https://github.com/tsrx-org/tsrx/commit/e0c07b55b199acc4fe05b705255e79020b500376)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Solid now imports the
  components it generates for `@if`, `@for`, `@switch` and `@try` under private
  names (`__Show`, `__For`, `__Switch`, `__Match`, `__Errored`, `__Loading`), and
  Vue imports the `VaporFor` it generates for `@for` as `__VaporFor`. A module can
  declare its own binding with one of those names (an import from another module,
  a type-only import, a module or setup local, or a `@for (const Match of rows)`
  loop variable) without the build failing with "Identifier `Show` has already
  been declared", and the generated element no longer renders the authored binding
  in its place. An authored `import type { VaporFor } from 'vue-jsx-vapor'` now
  stays type-only beside the generated value imports. The compiler now counts a
  tag as a component whenever its name doesn't start with a lowercase letter, as
  JSX does, so a tag like `<_Card>` is treated as a component rather than a host
  element, and Solid doesn't hoist a static `@if`, `@switch` or `@pending` subtree
  that renders one of its private components.

  Vue's `defineVaporComponent` keeps its public name, because vue-jsx-vapor finds
  components by calls to that name. A Vue module that declares its own binding
  named `defineVaporComponent` (an import from another module, a module function
  or `const`, or a local in a component) now gets a compile error, `TSRX2032`,
  instead of a duplicate declaration or every component wrapped in the authored
  function. A type-only import of `defineVaporComponent` from `vue-jsx-vapor`
  becomes the value import the compiler needs.

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

- [#1280](https://github.com/tsrx-org/tsrx/pull/1280)
  [`190f797`](https://github.com/tsrx-org/tsrx/commit/190f7970cf968c978b3e5df37b4e3a97c4e7efa5)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On Solid and Vue, a
  `yield` in a template value that the target's JSX compiler moves into an effect,
  a getter or a callback is now a TSRX compile error, TSRX2034, at the authored
  `yield`:
  ``Solid TSRX does not support `yield` in this part of the template: Solid's JSX compiler evaluates it in an effect, a getter or a callback, which cannot yield from the enclosing generator. …``
  (and the same for Vue). Before, the build failed later in `babel-preset-solid`
  or `vue-jsx-vapor` output, with
  `A 'yield' expression is only allowed in a generator body.` or
  `The keyword 'yield' is reserved` pointing at compiled code. Yield the value
  first instead: `const title = yield bag.title;`.

  A `yield` those compilers leave in place still compiles, so code that builds
  today is unchanged. On Solid that is a static value (no member access, call,
  spread or `in`) in an attribute, a component prop or a lone component child, any
  event handler or non-array `ref` on an element without a spread (except a
  `[handler, data]` array on an event the compiler doesn't delegate, such as
  `onScroll`, which it wraps in a new listener), any attribute but `ref` beside a
  host spread unless it's dynamic, and an element nested in the returned one. A
  `class` or `style` object is split into one setting per key, as the compiler
  does, so only a dynamic key's value is reported, unless a method or accessor
  keeps the whole object. The check follows the compiler's folding of literal
  values and its dropping of an attribute that a later one of the same name
  replaces, of the children of a void element or a `<noscript>`, of a
  `<textarea>`'s children when a literal `value` or `defaultValue` (or a bare
  `value`) replaces them, of a `children` attribute on an element or component
  that has children (or an element that writes none), of an element's `$key`, and
  of an event array's elements after the first two, wherever the element is
  created, so a `yield` in a branch it drops, as in `false && (yield x)`,
  compiles. A `<select>`'s value is reported, since the compiler also assigns it
  in a microtask. On Vue, which wraps every element, it is a host spread, which
  TSRX evaluates before the element. A `yield` in a nested generator function or
  before the template is allowed on both. React, Preact and Hono evaluate
  templates eagerly and are unchanged.

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

- [#1238](https://github.com/tsrx-org/tsrx/pull/1238)
  [`07e262a`](https://github.com/tsrx-org/tsrx/commit/07e262afedaf6cf614ae78dc9649437ce34d66ef)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A static component used
  more than once now renders each time on Solid and Vue. These targets no longer
  hoist static JSX such as `<p class="b">plain</p>` to a module-level constant:
  Solid and Vue Vapor JSX evaluates to a DOM node, so the constant held one node
  that every use moved into place. `<Static />` twice rendered one `<p>`, and a
  static component in a three-row `@for` showed only in the last row. On Vue,
  which also hoisted inside `@for` and `@if` bodies, a static `@for` row rendered
  once for the whole list, and a static `@if` branch showed in only one instance
  of its component. Static JSX now stays in place, and each framework's compiler
  still parses each template once and clones it per use
  ([#1236](https://github.com/tsrx-org/tsrx/issues/1236),
  [#1240](https://github.com/tsrx-org/tsrx/issues/1240)).

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

- [#1126](https://github.com/tsrx-org/tsrx/pull/1126)
  [`aea883a`](https://github.com/tsrx-org/tsrx/commit/aea883a7ec7632ff467b9864052592ae948544b1)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Vue components now
  render their nested children through `props.children`, as on the other targets.
  vue-jsx-vapor passes nested children as the default slot, so `props.children`
  was always `undefined` and `<Card><p>child</p></Card>` rendered without the
  `<p>`. A read of `props.children`, or of a `children` binding destructured from
  the props parameter or from `props` at the top of the component
  (`const { children } = props`), now reads the default slot when the caller
  writes nested children and the `children` prop otherwise; nested children win
  over the prop, as on React, and a destructured default (`{ children = 'none' }`)
  applies only when neither is passed; like any destructuring default, it replaces
  only `undefined`, so `children={null}` stays `null`. Each place that renders the
  children renders the slot there, so they are set up when shown and torn down
  when hidden, as React mounts and unmounts them, and a read that only tests them
  (`props.children ? <div>{props.children}</div> : …`, `!props.children`,
  `props.children != null`, `Boolean(props.children)`) checks whether the slot
  exists instead of rendering it. Two Vue differences remain: a slot exists, and
  tests truthy, whenever the caller writes nested children, even when they render
  nothing, and `{...props}` does not forward nested children, so pass them on
  explicitly (`<Card {...props}>{props.children}</Card>`). The editor's type view
  still shows `props.children` as written.

- [#1125](https://github.com/tsrx-org/tsrx/pull/1125)
  [`c19818c`](https://github.com/tsrx-org/tsrx/commit/c19818ce37642c4508fb2ffd41a8325367d46c36)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - More Vue components are
  now wrapped in `defineVaporComponent`, and wrapped components can be read above
  their declaration:

  - An arrow component that contains a nested function, such as an inline
    `onClick={() => …}` handler or a `.map()` callback, is now wrapped. Before, it
    stayed a plain function, and mounting it as the app root threw
    `Cannot read properties of undefined (reading 'config')`.
  - A component that builds its JSX in a local variable and returns it
    (`const element = <div />; return element;`) is now wrapped. Before, its props
    never reached it and mounting it as the app root threw. A local binding counts
    when it holds JSX anywhere, the same rule already used for a returned
    expression, so a `function Config() { const c = { icon: <i /> }; return c; }`
    is wrapped just as `function Columns() { return [{ header: <b /> }]; }`
    already was.
  - A default-exported component (`export default function Card`) now compiles to
    `const Card = defineVaporComponent(…); export default Card;`, so the module
    keeps its `Card` binding. Before, one with a nested function compiled to the
    invalid `export default const …`, and `typeof Card` or `export { Card }` lost
    the binding.
  - A component read above its declaration while the module loads, as in
    `export const registry = { inner: Inner }` before `function Inner`, now loads:
    the compiler moves the wrapped `const` above that read when doing so changes
    nothing else. When the component's destructured prop defaults read a binding
    that the statements it would move past declare, assign or mutate
    (vue-jsx-vapor evaluates `{ label = PREFIX }` when the component is defined),
    the compiler reports the new TSRX2028 at the read and asks you to move the
    declaration up instead. That includes a binding mutated through a TypeScript
    wrapper, a destructuring target or `delete` (`(cfg as any).size = 2`,
    `cfg!.size = 2`, `[cfg.size] = [2]`), and an enum, namespace or `import x = …`
    alias declared in between, which sets its binding when it runs; a namespace's
    own `var`s don't count. Reads that do not run at load (in a function, a class
    instance field, a branch a constant condition skips, or a scope with its own
    binding of the name) move nothing. Calls are not followed: a read through a
    call or IIFE still hits the constant before it is initialized, and a call in
    between to a function that assigns a binding a default reads (`bump()` setting
    `size`) runs after the moved component captured the old value; reads from
    another `case` of the declaring `switch` or through a circular import cannot
    be seen either.
  - A destructured prop default that vue-jsx-vapor would silently drop now reports
    the new TSRX2029 at the default. vue-jsx-vapor turns those defaults into prop
    options and keeps only a string, number, boolean or `null` literal, an
    identifier, an object or array literal, or a function, so `{ s = cfg.size }`,
    `-1`, `SIZE + 1`, a call or a template literal left the prop `undefined` when
    the caller left it out. This applies to every wrapped component, including
    ones wrapped before this change; read the prop in the body instead
    (`const s = props.s ?? cfg.size`).

- [#1231](https://github.com/tsrx-org/tsrx/pull/1231)
  [`ab5a0ff`](https://github.com/tsrx-org/tsrx/commit/ab5a0ff13138746ade811808f27f52d34668ae3f)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Vue now reports a
  destructured prop that vue-jsx-vapor reads wrongly, instead of compiling a
  component that silently gets the wrong value:

  - The new TSRX2031 reports a key vue-jsx-vapor misreads. It reads a destructured
    prop by its key's name, so `function Card({ [k]: v })` read the prop `k`,
    whatever `k` held, and lost any default. It reads only keys that are names, so
    a binding at any other key (`{ 'a-b': v }`, `{ ['s']: v }`, `{ [1]: v }`)
    never got the prop: it was left out of the component, and a component with no
    key it reads got no prop options at all, so Vue passed it no props.
  - TSRX2031 also reports a props parameter with a default
    (`function Card({ s } = {})`), which vue-jsx-vapor skips, so the component got
    no props; remove the default, since Vue always passes a props object. And it
    reports a rest element inside a prop (`{ t: { a, ...r } }`,
    `{ t: [a, ...r] }`): vue-jsx-vapor gives the pattern's last rest element the
    component's attrs, an array's rest element the whole array, and any other the
    rest of `t` only as it was at setup, so `r` never followed the rest of `t`. A
    rest element of the props themselves (`{ s, ...rest }`) still compiles.
  - TSRX2029 now also reports a default inside a destructured prop
    (`{ s: { a = 3 } }`), which vue-jsx-vapor applies only when the whole prop is
    missing, so it was lost whenever `s` was passed without `a`.

  The errors suggest taking a `props` parameter and reading the prop where it is
  used, so it stays reactive: for example `{props.s === undefined ? 3 : props.s}`,
  which, like a default, replaces only `undefined`, or a `computed`. A kebab-case
  key is read by its camelized name (`props.aB`), and a value inside a prop with
  optional chaining (`props.t?.a`), since the prop can be missing. TSRX2029's
  existing advice, to read the prop once into a constant, changes the same way.
  The TSRX2028, TSRX2029 and TSRX2031 messages are now in `@tsrx/core/diagnostics`
  (`TSRX_ERRORS`).

- [#1296](https://github.com/tsrx-org/tsrx/pull/1296)
  [`00a238c`](https://github.com/tsrx-org/tsrx/commit/00a238cc95013ca90e1fc2bd5fbb47b80c942664)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - `@try` with `@pending`
  no longer reports TS2322 in the editor. `vue-jsx-vapor`'s JSX types reject the
  `_` slot flag that the type-only output passed to `Suspense`. Compiled output is
  unchanged.

- [#1108](https://github.com/tsrx-org/tsrx/pull/1108)
  [`04ef167`](https://github.com/tsrx-org/tsrx/commit/04ef16724d4c3d0a85cebef45fbd081673987fa0)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On Vue, a host spread
  now updates when its expression changes, as in `<button {...bag.value} />` after
  `bag.value = { disabled: true }`. Before, the compiler read the spread once in a
  setup declaration, so the element kept its first attributes and a button stayed
  enabled. The bag is now assigned where it is spread,
  `{...(bag = __normalize_spread_props_for_ref_attr(expr))}`, inside
  vue-jsx-vapor's render effect, which reads it again when it changes and sets the
  element's template ref after it.

  A new `jsx.refAfterProps` platform option says the compiled JSX applies an
  element's `ref` after its other attributes, so with the in-place binding the
  merged `ref` still goes last. Vue sets it.

- [#1101](https://github.com/tsrx-org/tsrx/pull/1101)
  [`41739c6`](https://github.com/tsrx-org/tsrx/commit/41739c6263df8ea48228c78a41c1e53d13bb4ec4)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The Vue and Solid Vite
  plugins now compile an import that resolves to a `.tsrx` file even when the
  specifier has no `.tsrx` extension, such as a package whose `exports` point at a
  `.tsrx` file. Before, the build failed with "Expected function body".

  The Vapor interop rewrite (`@tsrx/vue/interop`, used by the Vue Vite, Bun and
  Rspack integrations) now parses the module and changes only its real
  `import { createVaporApp } from 'vue'` declarations. Before, the same text
  inside a string, template literal, comment or regular expression was rewritten
  too, which broke the build with "Unterminated string", and a named import on the
  line before the Vue import (`import { a } from './a';`) kept the real import
  from being rewritten. A module the parser cannot read gets the previous
  text-based rewrite.

- [#1118](https://github.com/tsrx-org/tsrx/pull/1118)
  [`0246e95`](https://github.com/tsrx-org/tsrx/commit/0246e95f983c2efd83e3e99100d00a5ba24c9233)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On Vue, `@catch` now
  handles errors under `@pending`. When an async child's loader rejects, the
  `@catch` fallback replaces the `@pending` one instead of `@pending` staying up
  with an unhandled rejection
  ([#1078](https://github.com/tsrx-org/tsrx/issues/1078)), and `reset()` renders
  the body again after it threw while setting up
  ([#937](https://github.com/tsrx-org/tsrx/issues/937)); it did nothing before.

  The boundary also catches errors from child components when the app sets
  `app.config.errorHandler`, and in production builds, including a `@try` inside
  element children, which now compiles to a boundary component like every other
  `@try`. It used to rely on Vue re-throwing unhandled errors, which Vue does only
  in development and only when no `errorHandler` is set. As with Vue's
  `errorCaptured`, an error that `@catch` handles no longer reaches
  `app.config.errorHandler`.

  An error now goes to the boundary around the component it came from, even when
  another boundary is rendering at the time; `reset()` also recovers after a
  thrown `null`; and the boundary's `fallback` and `content` props no longer
  appear as attributes on the element it renders.

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
  [`1310e6a`](https://github.com/tsrx-org/tsrx/commit/1310e6acd55e46e539fca0c63065318cc9bde3bf),
  [`00a238c`](https://github.com/tsrx-org/tsrx/commit/00a238cc95013ca90e1fc2bd5fbb47b80c942664),
  [`04ef167`](https://github.com/tsrx-org/tsrx/commit/04ef16724d4c3d0a85cebef45fbd081673987fa0),
  [`0246e95`](https://github.com/tsrx-org/tsrx/commit/0246e95f983c2efd83e3e99100d00a5ba24c9233)]:
  - @tsrx/core@0.6.0
  - @tsrx/vue-runtime@0.2.0

## 0.3.5

### Patch Changes

- Updated dependencies
  [[`0a967fc`](https://github.com/tsrx-org/tsrx/commit/0a967fcc3df20b9e9e22921ca90d604dd93cf7ec),
  [`5d7314a`](https://github.com/tsrx-org/tsrx/commit/5d7314a0615d1dfcf5ba36cf832d7b4b656885e8),
  [`a420dd1`](https://github.com/tsrx-org/tsrx/commit/a420dd1bd2e3fe7d03d4e93eb666d7d070e7bdb5),
  [`5ce0b5f`](https://github.com/tsrx-org/tsrx/commit/5ce0b5fdff3f86abf578a685869d63b8dfb61f60)]:
  - @tsrx/core@0.5.5

## 0.3.4

### Patch Changes

- Updated dependencies
  [[`885adfb`](https://github.com/tsrx-org/tsrx/commit/885adfb87ddf6907d46e8a98267bdfdad5103d76),
  [`87dda2d`](https://github.com/tsrx-org/tsrx/commit/87dda2d5c8d6154ffe32e7494aaadfc8ac7a27aa),
  [`d2f42e8`](https://github.com/tsrx-org/tsrx/commit/d2f42e8e8403c1653c2928ac7b92c71ee04b9e42),
  [`7accf3c`](https://github.com/tsrx-org/tsrx/commit/7accf3c7fb0d56288827c1804a2d2c1fd1120bff)]:
  - @tsrx/core@0.5.4

## 0.3.3

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

- [#988](https://github.com/tsrx-org/tsrx/pull/988)
  [`f518cb9`](https://github.com/tsrx-org/tsrx/commit/f518cb91a120e8a368cece21efbc954135f99dfe)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Lower a `@catch` body once
  when the target renders it through a fallback component. For Vue, a `@try` with
  `@pending` and `@catch` no longer hoists a static catch body a second time for
  an inline fallback that is never used; the fallback renders the component
  instead.

  Type `TsrxErrorBoundary` as returning Vue's `Block`, so `<TsrxErrorBoundary>` in
  the type-only output for `@try` / `@catch` is a valid `vue-jsx-vapor` JSX
  element. Under `strict` it reported TS2786 because its declared return type
  included `undefined`.

- [#987](https://github.com/tsrx-org/tsrx/pull/987)
  [`12803d3`](https://github.com/tsrx-org/tsrx/commit/12803d3da7a8fddfbd9ec783213310e3e6520fff)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Stop generating an unused
  catch fallback component for `@try` / `@catch` without `@pending`. The component
  is only rendered by the `@pending` boundary, so without one the output had an
  extra `defineVaporComponent` and a second hoisted copy of a static catch body.
- Updated dependencies
  [[`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee),
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee),
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee),
  [`5abd474`](https://github.com/tsrx-org/tsrx/commit/5abd474b108bdd780cece1e88e02ccfec265aad4),
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee),
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee),
  [`f518cb9`](https://github.com/tsrx-org/tsrx/commit/f518cb91a120e8a368cece21efbc954135f99dfe)]:
  - @tsrx/core@0.5.3
  - @tsrx/vue-runtime@0.1.13

## 0.3.2

### Patch Changes

- Updated dependencies
  [[`a836f17`](https://github.com/tsrx-org/tsrx/commit/a836f1730d868f4a06b6de019d5c6ff1112db34e)]:
  - @tsrx/core@0.5.2

## 0.3.1

### Patch Changes

- Updated dependencies
  [[`b213995`](https://github.com/tsrx-org/tsrx/commit/b213995b75c1c294d76efc20445e450b3b876eb7)]:
  - @tsrx/core@0.5.1

## 0.3.0

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

## 0.2.9

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
  - @tsrx/vue-runtime@0.1.12

## 0.2.8

### Patch Changes

- Updated dependencies
  [[`ca86115`](https://github.com/tsrx-org/tsrx/commit/ca86115f91e9aec052bff27809b7439fd6fa7dbd),
  [`06a9c5c`](https://github.com/tsrx-org/tsrx/commit/06a9c5c699961c7ac1def5196229cc65704f358d)]:
  - @tsrx/core@0.3.3

## 0.2.7

### Patch Changes

- Updated dependencies
  [[`c426225`](https://github.com/tsrx-org/tsrx/commit/c42622548a877bc5a1d2741c96534447679f2ae5)]:
  - @tsrx/core@0.3.2

## 0.2.6

### Patch Changes

- Updated dependencies
  [[`b12105e`](https://github.com/tsrx-org/tsrx/commit/b12105e60a077559e55f59940cb25c0dd73eda8a)]:
  - @tsrx/core@0.3.1

## 0.2.5

### Patch Changes

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
  - @tsrx/vue-runtime@0.1.11

## 0.2.4

### Patch Changes

- Updated dependencies []:
  - @tsrx/core@0.2.4
  - @tsrx/vue-runtime@0.1.10

## 0.2.3

### Patch Changes

- Updated dependencies
  [[`ba0be2d`](https://github.com/tsrx-org/tsrx/commit/ba0be2dd06c7b707912a067c20e276c4428a905b)]:
  - @tsrx/core@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies
  [[`2d053f4`](https://github.com/tsrx-org/tsrx/commit/2d053f421f09c5c4936d8866bbeb44b924411dbb)]:
  - @tsrx/core@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies
  [[`33d6093`](https://github.com/tsrx-org/tsrx/commit/33d60939c720d7d0bb8ab03790486a4c033dde96)]:
  - @tsrx/core@0.2.1
  - @tsrx/vue-runtime@0.1.9

## 0.2.0

### Minor Changes

- [#110](https://github.com/tsrx-org/tsrx/pull/110)
  [`dcc0283`](https://github.com/tsrx-org/tsrx/commit/dcc0283a7470773f8a169c8750344ad147c30c99)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Stop accepting lazy
  destructuring (`&{ ... }` / `&[ ... ]`), which is removed from the TSRX language
  per [RFC #106](https://github.com/tsrx-org/tsrx/discussions/106). Write
  `({ name }: Props)` for React and Preact, `props.name` (or `splitProps`) for
  Solid, and `state.count` or `toRefs(state)` for Vue.

### Patch Changes

- Updated dependencies
  [[`dcc0283`](https://github.com/tsrx-org/tsrx/commit/dcc0283a7470773f8a169c8750344ad147c30c99),
  [`dcc0283`](https://github.com/tsrx-org/tsrx/commit/dcc0283a7470773f8a169c8750344ad147c30c99),
  [`dcc0283`](https://github.com/tsrx-org/tsrx/commit/dcc0283a7470773f8a169c8750344ad147c30c99),
  [`79c1359`](https://github.com/tsrx-org/tsrx/commit/79c1359650d7e74914e818bbf179b6a41d06370c)]:
  - @tsrx/core@0.2.0
  - @tsrx/vue-runtime@0.1.8

## 0.1.71

### Patch Changes

- [#98](https://github.com/tsrx-org/tsrx/pull/98)
  [`727d17f`](https://github.com/tsrx-org/tsrx/commit/727d17f1e535f68dc5e4478920f2de7ab71a3822)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Add validated web, iOS, and
  Android compile-time platform flags, early ordinary-if specialization for TSRX
  source and virtual TypeScript, automatic inherited/project-referenced tsconfig
  resolution, and matching definitions across every in-repo Vite, Rspack,
  Turbopack, and Bun integration, with conflict checks and chained source maps.

- Updated dependencies
  [[`727d17f`](https://github.com/tsrx-org/tsrx/commit/727d17f1e535f68dc5e4478920f2de7ab71a3822)]:
  - @tsrx/core@0.1.71

## 0.1.70

### Patch Changes

- Updated dependencies []:
  - @tsrx/core@0.1.70
  - @tsrx/vue-runtime@0.1.7

## 0.1.69

### Patch Changes

- Updated dependencies
  [[`ebba2e4`](https://github.com/tsrx-org/tsrx/commit/ebba2e4a249860242b9a25bccd2c2607c623a288)]:
  - @tsrx/core@0.1.69

## 0.1.68

### Patch Changes

- Updated dependencies []:
  - @tsrx/core@0.1.68
  - @tsrx/vue-runtime@0.1.6

## 0.1.67

### Patch Changes

- Updated dependencies
  [[`5369440`](https://github.com/tsrx-org/tsrx/commit/53694402cbc21c4195c201a4e4a70d32e212a9c2)]:
  - @tsrx/core@0.1.67

## 0.1.66

### Patch Changes

- Updated dependencies
  [[`b11381d`](https://github.com/tsrx-org/tsrx/commit/b11381dc10e71e2dae176c6477c4a79113a5bede),
  [`8efcbc8`](https://github.com/tsrx-org/tsrx/commit/8efcbc85bc3910531715f51c9f592588c2464f4c),
  [`8f5d3f0`](https://github.com/tsrx-org/tsrx/commit/8f5d3f0ac3ddc2454a5e3051e5b3cfd1dc797022),
  [`8efcbc8`](https://github.com/tsrx-org/tsrx/commit/8efcbc85bc3910531715f51c9f592588c2464f4c)]:
  - @tsrx/core@0.1.66
  - @tsrx/vue-runtime@0.1.5

## 0.1.65

### Patch Changes

- Updated dependencies []:
  - @tsrx/core@0.1.65
  - @tsrx/vue-runtime@0.1.4

## 0.1.64

### Patch Changes

- Updated dependencies
  [[`d22e79e`](https://github.com/tsrx-org/tsrx/commit/d22e79e1142c1ce55b893c56e20451ab0401be92),
  [`c21eb24`](https://github.com/tsrx-org/tsrx/commit/c21eb242086efb49bfb39f3013d533c22cb748de),
  [`09e6adf`](https://github.com/tsrx-org/tsrx/commit/09e6adfa932838c6542b2205846536dd98cbb889),
  [`e1a610a`](https://github.com/tsrx-org/tsrx/commit/e1a610ab16aeda0b6d6d98454609273bb3edc1e8),
  [`d23290e`](https://github.com/tsrx-org/tsrx/commit/d23290e3aba3ed52e620571e26180bb8561f0fd1)]:
  - @tsrx/core@0.1.64
  - @tsrx/vue-runtime@0.1.3

## 0.1.63

### Patch Changes

- Updated dependencies
  [[`decbe8f`](https://github.com/tsrx-org/tsrx/commit/decbe8fe82a1403e41a6dc020840c61aae719f13),
  [`cab7e94`](https://github.com/tsrx-org/tsrx/commit/cab7e94e000801d951b44cc1258e64d87f10e742)]:
  - @tsrx/core@0.1.63

## 0.1.62

### Patch Changes

- Updated dependencies
  [[`6c34d7d`](https://github.com/tsrx-org/tsrx/commit/6c34d7d44dc5bc12b76f0b4687357419fa9c4190)]:
  - @tsrx/core@0.1.62

## 0.1.61

### Patch Changes

- Updated dependencies
  [[`16a87b2`](https://github.com/tsrx-org/tsrx/commit/16a87b205dc75ce20aa06a1706b603bc4ebb9bcd)]:
  - @tsrx/core@0.1.61

## 0.1.60

### Patch Changes

- Updated dependencies
  [[`481d934`](https://github.com/Ripple-TS/ripple/commit/481d934aa17a275aa588d945b4c65b421076f89c)]:
  - @tsrx/core@0.1.60

## 0.1.59

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
- Updated dependencies
  [[`4fea7fc`](https://github.com/Ripple-TS/ripple/commit/4fea7fc9a1277abe47a5b5c67eeda2e253c9e6d5),
  [`2aa2b6f`](https://github.com/Ripple-TS/ripple/commit/2aa2b6f4beff43b61badd1fb7d11433e9e4f52b3),
  [`6d3417e`](https://github.com/Ripple-TS/ripple/commit/6d3417eb3852a9f0085b273f07079a3b12323712)]:
  - @tsrx/core@0.1.59
  - @tsrx/vue-runtime@0.1.1

## 0.1.58

### Patch Changes

- Updated dependencies
  [[`10c6c3d`](https://github.com/Ripple-TS/ripple/commit/10c6c3df0f5dfccf9be34c556afee1c87c678bde)]:
  - @tsrx/core@0.1.58

## 0.1.57

### Patch Changes

- Updated dependencies
  [[`2e65731`](https://github.com/Ripple-TS/ripple/commit/2e657313feb272ef7c32510f8e2aa3de1b53ccb3)]:
  - @tsrx/core@0.1.57

## 0.1.56

### Patch Changes

- Updated dependencies
  [[`f03a5af`](https://github.com/Ripple-TS/ripple/commit/f03a5af4c455135767a959f6b45eb3ddb7fadd8f)]:
  - @tsrx/core@0.1.56

## 0.1.55

### Patch Changes

- Updated dependencies
  [[`9b654b2`](https://github.com/Ripple-TS/ripple/commit/9b654b29339c14e79f8377491946c1419417a002),
  [`5e4b38e`](https://github.com/Ripple-TS/ripple/commit/5e4b38ec26c8268b60e3ca4319eb37f8a07b3078),
  [`7136920`](https://github.com/Ripple-TS/ripple/commit/7136920028537f336c9404493d8c9fde80105408)]:
  - @tsrx/core@0.1.55

## 0.1.54

### Patch Changes

- Updated dependencies
  [[`d85f9f3`](https://github.com/Ripple-TS/ripple/commit/d85f9f3a8a4f8ed8f77ce54f87fa4387d586884c)]:
  - @tsrx/core@0.1.54

## 0.1.53

### Patch Changes

- Updated dependencies
  [[`7eaf6e8`](https://github.com/Ripple-TS/ripple/commit/7eaf6e8b21f83b73845b8bcd6bc50cc9f8886871)]:
  - @tsrx/core@0.1.53

## 0.1.52

### Patch Changes

- Updated dependencies
  [[`7ec87d9`](https://github.com/Ripple-TS/ripple/commit/7ec87d910c62e39e0dc95c80daace036cc6f041c)]:
  - @tsrx/core@0.1.52

## 0.1.51

### Patch Changes

- [#1391](https://github.com/Ripple-TS/ripple/pull/1391)
  [`6eaa2f3`](https://github.com/Ripple-TS/ripple/commit/6eaa2f3e6cd18973d57df06eae770313dd061a1a)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Replace every `any` in
  `@tsrx/solid`, `@tsrx/vue`, `@tsrx/react` and `@tsrx/preact` with the real AST,
  compiler and framework types, and move each package's `@typedef` blocks into its
  `types/` declarations.

  `@tsrx/solid`'s transform carried the bulk of it: all 126 `any` annotations are
  gone, replaced by the parser's AST types plus a new `types/transform.d.ts`
  describing the shapes the Solid lowering passes around (`SolidRenderSource`,
  `SolidIfBranch`, `SolidLoweredList`, `SolidBranchArrow`, …).
  `is_solid_render_child` and `is_branch_arrow` are now type predicates,
  `to_jsx_child` declares that a render source always lowers to a JSX child, and
  the hand-built `JSXElement`/`JSXAttribute` object literals are built through the
  shared builders instead — so generated attributes carry the `shorthand` field
  the type requires. The two places where a statement list is still mid-lowering
  go through `lowered_block`/`lowered_switch_case`, which name that invariant
  instead of hiding it behind `any`. Three unreachable helpers
  (`get_if_consequent_body`, `negate_expression`, `TEMPLATE_FRAGMENT_ERROR`) were
  dropped.

  `@tsrx/vue`'s error boundary no longer casts the `vue` namespace to `any` at
  every call: the Vapor renderer's runtime-internal helpers are declared once in
  `types/vapor-runtime.d.ts` (`VaporRuntime`, `VaporBlock`, `VaporFragment`,
  `VaporComponentInstance`), the namespace is narrowed to that interface a single
  time, and `EffectScope` comes from `vue`'s own published export.
  `TsrxErrorBoundaryProps` describes its render callbacks as returning `unknown`
  rather than `any`, matching what the boundary actually does with them.

  The React and Preact error boundaries declare their props and state through
  `TsrxErrorBoundaryProps`/`TsrxErrorBoundaryState` instead of an `any`
  constructor parameter, Preact's `CompileOptions` typedef moved from
  `src/transform.js` to `types/index.d.ts` where the declaration already lived,
  and all four `compile` entry points return the shared `CompileResult` (a typed
  `map`) instead of an inline shape with `map: any`.

  `@tsrx/core`'s `BaseNodeMetaData` declares the two flags Solid's transform sets
  (`solid_render_control`, `is_branch_arrow`), alongside the Vue-specific flags
  already there.

- Updated dependencies
  [[`6404d3c`](https://github.com/Ripple-TS/ripple/commit/6404d3cc679fde2eb83ec85c9cd98b653f3f2fed),
  [`6025176`](https://github.com/Ripple-TS/ripple/commit/6025176000cafa50d924add8e9a878fe37c0c22b),
  [`7ad580e`](https://github.com/Ripple-TS/ripple/commit/7ad580efd24b338b4774add06afdcdd8876c954c),
  [`6eaa2f3`](https://github.com/Ripple-TS/ripple/commit/6eaa2f3e6cd18973d57df06eae770313dd061a1a),
  [`9ffd4ba`](https://github.com/Ripple-TS/ripple/commit/9ffd4ba3e5982acb79a02efe0379abdc14c092a1)]:
  - @tsrx/core@0.1.51

## 0.1.50

### Patch Changes

- Updated dependencies
  [[`98cc95c`](https://github.com/Ripple-TS/ripple/commit/98cc95ce2af7edcb9637ff56072bbeda5b837a30)]:
  - @tsrx/core@0.1.50

## 0.1.49

### Patch Changes

- Updated dependencies
  [[`979b230`](https://github.com/Ripple-TS/ripple/commit/979b2303a98cc85669c899bd3aff757f72a1e7c8)]:
  - @tsrx/core@0.1.49

## 0.1.48

### Patch Changes

- [#1380](https://github.com/Ripple-TS/ripple/pull/1380)
  [`81859da`](https://github.com/Ripple-TS/ripple/commit/81859da03464b8865304c70ea2b8b1245018af2c)
  Thanks [@trueadm](https://github.com/trueadm)! - Parse, preserve, and format
  static and dynamic deferred imports. Enable deferred-import evaluation in the
  Rspack integrations; static imports require Rspack 1.6 or newer and dynamic
  imports require Rspack 2 or newer.
- Updated dependencies
  [[`81859da`](https://github.com/Ripple-TS/ripple/commit/81859da03464b8865304c70ea2b8b1245018af2c)]:
  - @tsrx/core@0.1.48

## 0.1.47

### Patch Changes

- Updated dependencies
  [[`302dc74`](https://github.com/Ripple-TS/ripple/commit/302dc74143f4143ec7136c036510d258a7866c8a)]:
  - @tsrx/core@0.1.47

## 0.1.46

### Patch Changes

- [#1374](https://github.com/Ripple-TS/ripple/pull/1374)
  [`21a43da`](https://github.com/Ripple-TS/ripple/commit/21a43da09713f28c5d2ae73633e5ca56e4cd8d1f)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Add shared TSRX semantic
  analysis and report free-floating template output in normal function bodies and
  ordinary setup sections of `@{}` blocks. Runtime builds now fail when output
  would be discarded, while type-only and Volar compilation collect the diagnostic
  and continue. Return or retain template values, or make them part of a
  function's rendered output.

- Updated dependencies
  [[`21a43da`](https://github.com/Ripple-TS/ripple/commit/21a43da09713f28c5d2ae73633e5ca56e4cd8d1f)]:
  - @tsrx/core@0.1.46

## 0.1.45

### Patch Changes

- Updated dependencies
  [[`e9e122f`](https://github.com/Ripple-TS/ripple/commit/e9e122f8620c4b52671b294364a12a65091e0c98)]:
  - @tsrx/core@0.1.45

## 0.1.44

### Patch Changes

- Updated dependencies
  [[`c66215d`](https://github.com/Ripple-TS/ripple/commit/c66215dbd13313a45bc799d5643d2599b3d70d85)]:
  - @tsrx/core@0.1.44

## 0.1.43

### Patch Changes

- Updated dependencies
  [[`73f7eb4`](https://github.com/Ripple-TS/ripple/commit/73f7eb457dd9cc37364ba49b2ddfd56995fd07b0)]:
  - @tsrx/core@0.1.43

## 0.1.42

### Patch Changes

- [#1352](https://github.com/Ripple-TS/ripple/pull/1352)
  [`b36ec19`](https://github.com/Ripple-TS/ripple/commit/b36ec1930764f447585a6c31c17bc63b3596511a)
  Thanks [@leonidaz](https://github.com/leonidaz)! - various type, volar fixes and
  lib upgrades

- Updated dependencies
  [[`b36ec19`](https://github.com/Ripple-TS/ripple/commit/b36ec1930764f447585a6c31c17bc63b3596511a)]:
  - @tsrx/core@0.1.42

## 0.1.41

### Patch Changes

- Updated dependencies
  [[`5f5726d`](https://github.com/Ripple-TS/ripple/commit/5f5726d164926f480454143895bf035c9c30929b)]:
  - @tsrx/core@0.1.41

## 0.1.40

### Patch Changes

- Updated dependencies
  [[`586c6df`](https://github.com/Ripple-TS/ripple/commit/586c6df1dfe52f098d6b48fd94414f69d5e2020d)]:
  - @tsrx/core@0.1.40

## 0.1.39

### Patch Changes

- Updated dependencies
  [[`09efc09`](https://github.com/Ripple-TS/ripple/commit/09efc09d5149b8ffe9b6334c48ea6b2b4a1795dc)]:
  - @tsrx/core@0.1.39

## 0.1.38

### Patch Changes

- Updated dependencies
  [[`78502e4`](https://github.com/Ripple-TS/ripple/commit/78502e46929df2165d288dbb2483f48e9254ef35)]:
  - @tsrx/core@0.1.38

## 0.1.37

### Patch Changes

- Updated dependencies
  [[`a109586`](https://github.com/Ripple-TS/ripple/commit/a109586774227b4026ffbd813a956e231edb1005)]:
  - @tsrx/core@0.1.37

## 0.1.36

### Patch Changes

- Updated dependencies
  [[`1925074`](https://github.com/Ripple-TS/ripple/commit/1925074254de0e61c8578cba136c50ea8f89cd35)]:
  - @tsrx/core@0.1.36

## 0.1.35

### Patch Changes

- Updated dependencies
  [[`51eed86`](https://github.com/Ripple-TS/ripple/commit/51eed869b7ea26b5554893c9f8dd363f2d2121bc)]:
  - @tsrx/core@0.1.35

## 0.1.34

### Patch Changes

- Updated dependencies
  [[`cc95ffa`](https://github.com/Ripple-TS/ripple/commit/cc95ffaef3f3d3cd252176ea94308f89739f0212)]:
  - @tsrx/core@0.1.34

## 0.1.33

### Patch Changes

- Updated dependencies
  [[`ba498cd`](https://github.com/Ripple-TS/ripple/commit/ba498cde76e9f83235ce91da825f403a28441bff),
  [`313b351`](https://github.com/Ripple-TS/ripple/commit/313b3513e4a959dd80b546da41c798066c5ccb0f),
  [`35ac700`](https://github.com/Ripple-TS/ripple/commit/35ac70052d79efae41bb1df2440fee3f052ca115),
  [`bbe6e74`](https://github.com/Ripple-TS/ripple/commit/bbe6e7422c690558f0dfcb3abe5452d4f4cdde91),
  [`0e9f523`](https://github.com/Ripple-TS/ripple/commit/0e9f52358a615c2fc7759544e96c43dccb533c86),
  [`35ac700`](https://github.com/Ripple-TS/ripple/commit/35ac70052d79efae41bb1df2440fee3f052ca115),
  [`35ac700`](https://github.com/Ripple-TS/ripple/commit/35ac70052d79efae41bb1df2440fee3f052ca115),
  [`2b65285`](https://github.com/Ripple-TS/ripple/commit/2b65285bfcd4c6a0aa93d7fa0b25082e6ec74e1f),
  [`f55466b`](https://github.com/Ripple-TS/ripple/commit/f55466bde65d0cff00c0c4525af9d68ae794ffd2),
  [`b887deb`](https://github.com/Ripple-TS/ripple/commit/b887debf5f47e63d73184ac218ec8b3542a5e21c),
  [`3668c5f`](https://github.com/Ripple-TS/ripple/commit/3668c5fe9cdaca4862707d653d23af94780f42af)]:
  - @tsrx/core@0.1.33

## 0.1.32

### Patch Changes

- Updated dependencies
  [[`cc3176b`](https://github.com/Ripple-TS/ripple/commit/cc3176b4e40021021986830bdfa3295530715432),
  [`cc3176b`](https://github.com/Ripple-TS/ripple/commit/cc3176b4e40021021986830bdfa3295530715432)]:
  - @tsrx/core@0.1.32

## 0.1.31

### Patch Changes

- [#1269](https://github.com/Ripple-TS/ripple/pull/1269)
  [`8747e8f`](https://github.com/Ripple-TS/ripple/commit/8747e8f306628443d3c4d73bce0d79e986f5966e)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Disallow `return` statements
  inside `@try`/`@catch`/`@pending` blocks.

  `return` is only valid in the JS setup at the top of a `@{ … }` code block —
  never inside a `@`-directive block. `@if`/`@for`/`@switch` already rejected
  returns; `@try`/`@catch`/`@pending` previously allowed `return <markup>`
  (lowering it into a reactive boundary fallback). They now reject any `return`
  (with or without an argument) with the same
  `Return statements are not allowed inside TSRX templates` diagnostic,
  consistently across every target (ripple, react, preact, solid, vue). Render
  markup by writing it as the block's output instead of returning it. Returns
  inside nested ordinary functions are unaffected.

- Updated dependencies
  [[`8747e8f`](https://github.com/Ripple-TS/ripple/commit/8747e8f306628443d3c4d73bce0d79e986f5966e),
  [`8747e8f`](https://github.com/Ripple-TS/ripple/commit/8747e8f306628443d3c4d73bce0d79e986f5966e)]:
  - @tsrx/core@0.1.31

## 0.1.30

### Patch Changes

- Updated dependencies
  [[`b104604`](https://github.com/Ripple-TS/ripple/commit/b10460473fec0ee68b4963cbc2a3d9d5bb3bc633)]:
  - @tsrx/core@0.1.30

## 0.1.29

### Patch Changes

- [#1260](https://github.com/Ripple-TS/ripple/pull/1260)
  [`b1256fd`](https://github.com/Ripple-TS/ripple/commit/b1256fdb5bf279ee7dd20bf1a71dcfccc47e279c)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Make style scope hashes
  unique per style block and per file. The hash was derived from the style block's
  content alone, so two `<style>` blocks with identical CSS — in different
  components of the same file, or in different files — collided and shared a
  scope. The hash input now includes the filename and the line/column where the
  `<style>` tag starts. Because the filename may be an absolute path, the hash
  also switched from the reversible djb2 hash to the truncated SHA-256 hash so
  file structure can't be recovered from class names in the shipped bundle.

  The `filename` parameter of `parse`, `parseModule`, and the per-target `parse`
  wrappers is now required (typed as a non-empty string), and parsing a `<style>`
  element without one throws a clear error instead of silently seeding the hash
  with an empty name. The prettier plugin and eslint parser pass their host's file
  path through, falling back to a plugin-specific placeholder when formatting or
  linting in-memory text.

- Updated dependencies
  [[`67de047`](https://github.com/Ripple-TS/ripple/commit/67de047d103f39673b25910e1a97760278820999),
  [`1c645c8`](https://github.com/Ripple-TS/ripple/commit/1c645c8f854df23bb1271b3402d1885616b525cd),
  [`b1256fd`](https://github.com/Ripple-TS/ripple/commit/b1256fdb5bf279ee7dd20bf1a71dcfccc47e279c)]:
  - @tsrx/core@0.1.29

## 0.1.28

### Patch Changes

- [`87afc5d`](https://github.com/Ripple-TS/ripple/commit/87afc5d3f4c73e604cd245865e27d29e40435482)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Keep native template nodes in
  JSX-child shape inside synthetic fragments on JSX-emitting targets (react,
  preact, solid, vue). A fragment nested in an expression container could collapse
  to a bare expression placed directly in a fragment children list
  (`<>{a} <>{<>{b}</>}</></>` compiled to `<>{a}b</>`), which JSX reads as literal
  text — in both production output and the TS/Volar virtual code.
- Updated dependencies
  [[`f001849`](https://github.com/Ripple-TS/ripple/commit/f00184940979a77cbf6873a811caaaa436feab46),
  [`4af2591`](https://github.com/Ripple-TS/ripple/commit/4af259139d118a27d177531aa6a21435a3f3a015),
  [`87afc5d`](https://github.com/Ripple-TS/ripple/commit/87afc5d3f4c73e604cd245865e27d29e40435482),
  [`87afc5d`](https://github.com/Ripple-TS/ripple/commit/87afc5d3f4c73e604cd245865e27d29e40435482),
  [`f1a4c10`](https://github.com/Ripple-TS/ripple/commit/f1a4c10d2ad8ed604375f36f7ae3b653fe95ed1a)]:
  - @tsrx/core@0.1.28

## 0.1.27

### Patch Changes

- Updated dependencies
  [[`60a78c9`](https://github.com/Ripple-TS/ripple/commit/60a78c9def09eed6d706c42bc751d2d051d1d57f)]:
  - @tsrx/core@0.1.27

## 0.1.26

### Patch Changes

- [#1240](https://github.com/Ripple-TS/ripple/pull/1240)
  [`92982ee`](https://github.com/Ripple-TS/ripple/commit/92982ee5cd2e6d971b5b650ec1df70483c9716aa)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Add parser, formatter, and
  compiler support for `<{expr}>` dynamic element tags.

- [#1241](https://github.com/Ripple-TS/ripple/pull/1241)
  [`b826234`](https://github.com/Ripple-TS/ripple/commit/b8262342111a977ba5a0d44086154e386b06f4b9)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Treat dynamic tags
  (`<{expr}>`) like the runtime `Dynamic` helper during scoped CSS analysis on all
  targets: type selectors are no longer pruned (the tag can resolve to any
  element), the element's classes match scoped selectors, and the scope hash is
  applied to its class.

- [#1241](https://github.com/Ripple-TS/ripple/pull/1241)
  [`b826234`](https://github.com/Ripple-TS/ripple/commit/b8262342111a977ba5a0d44086154e386b06f4b9)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Remove the runtime `Dynamic`
  component exports; dynamic rendering is the `<{expr}>` tag syntax. The `Dynamic`
  type declarations remain so type-only output keeps type-checking, but the JS is
  gone: React and Preact production output now lowers dynamic tags to a scoped
  component alias (`const TsrxDynamic_N = expr;`), Ripple SSR uses the internal
  `_$_.dynamic_element` helper, and the imported-`Dynamic` detection for scoped
  CSS is removed (the element marking is now `metadata.dynamicElement`, set by the
  dynamic-tag lowering).

- [#1241](https://github.com/Ripple-TS/ripple/pull/1241)
  [`b826234`](https://github.com/Ripple-TS/ripple/commit/b8262342111a977ba5a0d44086154e386b06f4b9)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Lower dynamic tags
  (`<{expr}>`) for Solid and Vue production output to scoped component bindings
  instead of the `Dynamic` helper component. Solid binds
  `const TsrxDynamic_N = _tsrx_dynamic(() => expr)` (aliasing `dynamic` from
  `@solidjs/web`); Vue aliases the tag inside an import-free expression-child IIFE
  so vue-jsx-vapor's render block keeps it reactive. Declarations are placed in
  the scope that owns the expression (e.g. inside loop callbacks), and the
  type-only transform keeps the `<TsrxDynamic is={expr}>` shape with source
  mappings for both tag positions.
- Updated dependencies
  [[`92982ee`](https://github.com/Ripple-TS/ripple/commit/92982ee5cd2e6d971b5b650ec1df70483c9716aa),
  [`b826234`](https://github.com/Ripple-TS/ripple/commit/b8262342111a977ba5a0d44086154e386b06f4b9),
  [`b826234`](https://github.com/Ripple-TS/ripple/commit/b8262342111a977ba5a0d44086154e386b06f4b9),
  [`b826234`](https://github.com/Ripple-TS/ripple/commit/b8262342111a977ba5a0d44086154e386b06f4b9)]:
  - @tsrx/core@0.1.26

## 0.1.25

### Patch Changes

- Updated dependencies
  [[`d14ec84`](https://github.com/Ripple-TS/ripple/commit/d14ec84f26233e514be9e59ffc94e61db5089587),
  [`921fb9c`](https://github.com/Ripple-TS/ripple/commit/921fb9ce6485db41527b631f5236b7abbac74986),
  [`1693c9e`](https://github.com/Ripple-TS/ripple/commit/1693c9e6daf1421e71171fe3c50e37adfc858b69)]:
  - @tsrx/core@0.1.25

## 0.1.24

### Patch Changes

- [#1229](https://github.com/Ripple-TS/ripple/pull/1229)
  [`6fd49c9`](https://github.com/Ripple-TS/ripple/commit/6fd49c9dd737e889844e254763f66e13ea4a7241)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Replace the removed `<@...>`
  dynamic tag syntax with runtime `Dynamic` helpers. Ripple now exports `Dynamic`
  and reuses its composite runtime path for dynamic elements/components, while
  React, Preact, Solid, and Vue expose target-specific `Dynamic` helpers with
  typed `is` props.

  React, Preact, Solid, and Vue now mark imported runtime `Dynamic` elements
  during shared JSX analysis so scoped CSS classes are applied through aliases
  without treating local components named `Dynamic` as runtime elements.

  Dynamic component prop forwarding now uses a shared core runtime helper that
  excludes the internal `is` prop without snapshotting getter-backed reactive
  props.

  The TSRX parser, transforms, analyzers, prettier support, and related tests no
  longer recognize dynamic tag syntax. Stale JSX identifier `tracked` plumbing
  from that parser path has also been removed.

- Updated dependencies
  [[`6fd49c9`](https://github.com/Ripple-TS/ripple/commit/6fd49c9dd737e889844e254763f66e13ea4a7241)]:
  - @tsrx/core@0.1.24

## 0.1.23

### Patch Changes

- Updated dependencies
  [[`9eb4819`](https://github.com/Ripple-TS/ripple/commit/9eb4819cede6da7e93cbcd2bdf284bcb42d40464),
  [`88a254c`](https://github.com/Ripple-TS/ripple/commit/88a254c69953a5ace33bc10047f11052ec598672),
  [`ba3a7f6`](https://github.com/Ripple-TS/ripple/commit/ba3a7f6485ea163e60cc0750a8e8b06b50728009),
  [`ac6f358`](https://github.com/Ripple-TS/ripple/commit/ac6f3582ca0b2814004439c882d6aa735c8afe50),
  [`78ffa8d`](https://github.com/Ripple-TS/ripple/commit/78ffa8d90fd01e85bf34e5c6adef0e51caae8da7),
  [`16560cb`](https://github.com/Ripple-TS/ripple/commit/16560cb466430bdbe8749d9491bc79e69e58d02c),
  [`4be6e54`](https://github.com/Ripple-TS/ripple/commit/4be6e54bbfee20927adca473648a94aa173d7d77),
  [`2b67f83`](https://github.com/Ripple-TS/ripple/commit/2b67f83d7ed7eab7a39bc33524fcf73f737d977e),
  [`9918c52`](https://github.com/Ripple-TS/ripple/commit/9918c52e954f2b8e1a994892e7c555e8277f2d59),
  [`e8493be`](https://github.com/Ripple-TS/ripple/commit/e8493be0b3489f402105297251e1919c103c2360),
  [`c424675`](https://github.com/Ripple-TS/ripple/commit/c424675102a9edd4f1e356fb6db30124a9c2d885)]:
  - @tsrx/core@0.1.23

## 0.1.22

### Patch Changes

- [#1199](https://github.com/Ripple-TS/ripple/pull/1199)
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649)
  Thanks [@trueadm](https://github.com/trueadm)! - Add `@empty { ... }` fallbacks
  for TSRX `@for` loops, require prefixed template continuation clauses such as
  `@else`, `@empty`, `@pending`, `@catch`, `@case`, and `@default`, and reject
  direct `continue`, `break`, and `return` statements inside `@for` loop bodies
  and `@if` template branches.

- Updated dependencies
  [[`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649),
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649),
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649),
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649),
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649),
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649),
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649),
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649),
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649),
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649),
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649),
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649),
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649),
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649),
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649),
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649),
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649),
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649)]:
  - @tsrx/core@0.1.22

## 0.1.21

### Patch Changes

- [#1198](https://github.com/Ripple-TS/ripple/pull/1198)
  [`1de66b8`](https://github.com/Ripple-TS/ripple/commit/1de66b8f851849597b6078dab7af2699e49b0e21)
  Thanks [@trueadm](https://github.com/trueadm)! - Remove the unused namespaced
  TSX island feature and React bridge package.

- Updated dependencies
  [[`1de66b8`](https://github.com/Ripple-TS/ripple/commit/1de66b8f851849597b6078dab7af2699e49b0e21),
  [`e00f596`](https://github.com/Ripple-TS/ripple/commit/e00f5961d5668c054435c8a366ef2a6da6e4a381)]:
  - @tsrx/core@0.1.21

## 0.1.20

### Patch Changes

- Updated dependencies
  [[`0ea87fb`](https://github.com/Ripple-TS/ripple/commit/0ea87fb3cbef21c3c00d63cc2a1f3c9f34d01c24)]:
  - @tsrx/core@0.1.20

## 0.1.19

### Patch Changes

- [#1181](https://github.com/Ripple-TS/ripple/pull/1181)
  [`0574e73`](https://github.com/Ripple-TS/ripple/commit/0574e73830a549f515cef6aa8c0a1e38c79b06cc)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Map style expression
  assignments (`const styles = <style>…</style>`) to their source range in Volar
  type-only output so hovering the `<style>` tags shows intellisense.

- [#1181](https://github.com/Ripple-TS/ripple/pull/1181)
  [`0574e73`](https://github.com/Ripple-TS/ripple/commit/0574e73830a549f515cef6aa8c0a1e38c79b06cc)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Preserve template style
  blocks as embedded CSS regions in Volar type-only output.

- Updated dependencies
  [[`0574e73`](https://github.com/Ripple-TS/ripple/commit/0574e73830a549f515cef6aa8c0a1e38c79b06cc),
  [`0574e73`](https://github.com/Ripple-TS/ripple/commit/0574e73830a549f515cef6aa8c0a1e38c79b06cc)]:
  - @tsrx/core@0.1.19

## 0.1.18

### Patch Changes

- Updated dependencies
  [[`5c0b0ff`](https://github.com/Ripple-TS/ripple/commit/5c0b0ff031ddfb319bb048d627e2d2a2a49c1f1d)]:
  - @tsrx/core@0.1.18

## 0.1.17

### Patch Changes

- [#1177](https://github.com/Ripple-TS/ripple/pull/1177)
  [`054bd1e`](https://github.com/Ripple-TS/ripple/commit/054bd1e75347e395f6c096f8e293d1baf8e03549)
  Thanks [@trueadm](https://github.com/trueadm)! - Parse tags and bare fragments
  as native TSRX by default, remove `component` keyword parsing, and
  compile/format/lint function components that return native TSRX across the
  React, Preact, Solid, Vue, and Ripple targets. Ripple component compilation now
  only renders TSRX reachable from returned values and supports string and `null`
  component returns.

  Ripple now also preserves directly called PascalCase helpers as ordinary
  functions while still compiling renderable component functions used as
  components or render entries.

  The old explicit TSRX wrapper tag is no longer special; TSRX elements and
  fragments are the default expression syntax, and the tag name is treated like
  any ordinary element name.

  Ripple now exports a typed `Fragment` helper from its public runtimes and
  supports `innerHTML` on both host elements and `Fragment`. Ripple also treats
  `innerHTML` from element spreads as rendered content instead of serializing it
  as an `innerhtml` attribute.

  The `{html ...}` template directive has been removed. Use each target's native
  raw HTML prop instead, such as `innerHTML` for Ripple/Solid/Vue or
  `dangerouslySetInnerHTML` for React/Preact.

  The `{text ...}` template directive has also been removed. Text values now use
  ordinary `{expr}` containers, with explicit coercion written as JavaScript
  (`String(value)`, `value + ''`, or a typed string value). Ripple optimizes
  clearly string-shaped expressions and typed string props into text-node updates
  without requiring a TSRX-specific directive.

- Updated dependencies
  [[`054bd1e`](https://github.com/Ripple-TS/ripple/commit/054bd1e75347e395f6c096f8e293d1baf8e03549)]:
  - @tsrx/core@0.1.17

## 0.1.16

### Patch Changes

- Updated dependencies
  [[`d045396`](https://github.com/Ripple-TS/ripple/commit/d0453962cfe1df7a98a0981b0bf3e5729195a9ae)]:
  - @tsrx/core@0.1.16

## 0.1.15

### Patch Changes

- [#1172](https://github.com/Ripple-TS/ripple/pull/1172)
  [`d083ab8`](https://github.com/Ripple-TS/ripple/commit/d083ab8e802259fa6d8b7bf9bb64d4be899848c4)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Add verification-only Volar
  mappings for whole arrow functions.

- Updated dependencies
  [[`ea717f2`](https://github.com/Ripple-TS/ripple/commit/ea717f2ac20901aca59946c1cea8066c28a4220c),
  [`d083ab8`](https://github.com/Ripple-TS/ripple/commit/d083ab8e802259fa6d8b7bf9bb64d4be899848c4)]:
  - @tsrx/core@0.1.15

## 0.1.14

### Patch Changes

- [#1169](https://github.com/Ripple-TS/ripple/pull/1169)
  [`bf1cb96`](https://github.com/Ripple-TS/ripple/commit/bf1cb96f2ea9b325e30f5a051c451f92659d20f9)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Type host `ref={...}`
  attributes, named ref props, and generated ref keys so inline callbacks
  `{ref ...}` receive element-specific JSX types.

  Exclude `returnType` from the compiler types that use typeAnnotation instead due
  to the way `@sveltejs/acorn-typescript` parses them.

- Updated dependencies
  [[`1dc0331`](https://github.com/Ripple-TS/ripple/commit/1dc0331f7b7296545ee459dc31a92057871cbb0d),
  [`bf1cb96`](https://github.com/Ripple-TS/ripple/commit/bf1cb96f2ea9b325e30f5a051c451f92659d20f9)]:
  - @tsrx/core@0.1.14

## 0.1.13

### Patch Changes

- Updated dependencies
  [[`95c2976`](https://github.com/Ripple-TS/ripple/commit/95c2976b9ec2c20c4160ad13b636c1ed03e863ef)]:
  - @tsrx/core@0.1.13

## 0.1.12

### Patch Changes

- Updated dependencies
  [[`2acbbea`](https://github.com/Ripple-TS/ripple/commit/2acbbea9253ac8f516fe0d3a7a38331490e6fd8b),
  [`9df9fe3`](https://github.com/Ripple-TS/ripple/commit/9df9fe3a2d26978e69172db84994ac496761cd04)]:
  - @tsrx/core@0.1.12

## 0.1.11

### Patch Changes

- [#1145](https://github.com/Ripple-TS/ripple/pull/1145)
  [`0de733f`](https://github.com/Ripple-TS/ripple/commit/0de733f05800df5d3854eb69e012e9aeaf098f8a)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Add Vue Vapor support for
  TSRX `try/pending` by lowering pending blocks to Vue Suspense slots.

- [#1145](https://github.com/Ripple-TS/ripple/pull/1145)
  [`0de733f`](https://github.com/Ripple-TS/ripple/commit/0de733f05800df5d3854eb69e012e9aeaf098f8a)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Map Vue component
  declarations to their generated component function in Volar TSX instead of the
  `defineVaporComponent` wrapper.

- Updated dependencies
  [[`0de733f`](https://github.com/Ripple-TS/ripple/commit/0de733f05800df5d3854eb69e012e9aeaf098f8a)]:
  - @tsrx/core@0.1.11

## 0.1.10

### Patch Changes

- Updated dependencies
  [[`8c064c8`](https://github.com/Ripple-TS/ripple/commit/8c064c888b60e4fcf88f6828e51792b3bba5797a)]:
  - @tsrx/core@0.1.10

## 0.1.9

### Patch Changes

- [#1135](https://github.com/Ripple-TS/ripple/pull/1135)
  [`b1d6de0`](https://github.com/Ripple-TS/ripple/commit/b1d6de05912aca4cf40af68f291851eda706140c)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Support sole-child
  `{html ...}` raw HTML lowering for React, Preact, Solid and Vue targets, while
  keeping Ripple's existing child raw HTML behavior unchanged.

- Updated dependencies
  [[`b1d6de0`](https://github.com/Ripple-TS/ripple/commit/b1d6de05912aca4cf40af68f291851eda706140c)]:
  - @tsrx/core@0.1.9

## 0.1.8

### Patch Changes

- [`165703c`](https://github.com/Ripple-TS/ripple/commit/165703c588b52f3dc0d26c06187f21700d448693)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Use esrap 2.2.8 instead of
  carrying a local 2.2.7 patch.

- Updated dependencies
  [[`b54fdfc`](https://github.com/Ripple-TS/ripple/commit/b54fdfc3ebfea29ac613307b76732c5bf5f49ab5),
  [`165703c`](https://github.com/Ripple-TS/ripple/commit/165703c588b52f3dc0d26c06187f21700d448693)]:
  - @tsrx/core@0.1.8

## 0.1.7

### Patch Changes

- [#1123](https://github.com/Ripple-TS/ripple/pull/1123)
  [`e4a04dd`](https://github.com/Ripple-TS/ripple/commit/e4a04ddb4bbc8e21a9c7c2c65b179d764b72e4fb)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Nested lazy destructuring
  support for all tsrx targets. Ripple already fully supported it.
- Updated dependencies
  [[`2b1f746`](https://github.com/Ripple-TS/ripple/commit/2b1f7469ab31713140a5baf912a19fa8eedb9234),
  [`e4a04dd`](https://github.com/Ripple-TS/ripple/commit/e4a04ddb4bbc8e21a9c7c2c65b179d764b72e4fb)]:
  - @tsrx/core@0.1.7

## 0.1.6

### Patch Changes

- [`a59ccb8`](https://github.com/Ripple-TS/ripple/commit/a59ccb83b91257bf34fca2ba1415e77d1f815a7b)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Republish version with the
  new publish.yaml workflow

- Updated dependencies
  [[`a59ccb8`](https://github.com/Ripple-TS/ripple/commit/a59ccb83b91257bf34fca2ba1415e77d1f815a7b)]:
  - @tsrx/core@0.1.6

## 0.1.5

### Patch Changes

- [#1112](https://github.com/Ripple-TS/ripple/pull/1112)
  [`18b4aef`](https://github.com/Ripple-TS/ripple/commit/18b4aefa8127e56a9f1b3058da2d4d2172551579)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Support JavaScript `switch`
  fall-through semantics in component templates across the React, Preact, Solid,
  and Vue targets. When a `case` body has no `break` (or terminal `return`), each
  entry case now renders its own body plus every downstream body it would have
  fallen into — matching JS spec and the existing Ripple runtime behavior.

  All four targets reuse the same `create_hook_safe_helper` lift that hook-bearing
  case bodies already go through, orchestrated by a shared `plan_switch_lift`
  planner exported from `@tsrx/core`. Any case body that appears in more than one
  arm after fall-through analysis is hoisted into its own `StatementBodyHook`
  helper component, and each upstream arm chains into the next helper at the end
  of its body. Each case body therefore appears exactly once in the generated
  module regardless of how many arms reach it, keeping bundle size linear in case
  count and source mappings 1:1 for editor IntelliSense. Cases that terminate with
  `break` (or aren't reached via fall-through) stay inline as before.
  - **React, Preact, Vue** keep the JS `switch` and emit case arms that
    `return <Helper/>` for lifted bodies; inline arms append `<NextHelper/>` as
    the chain entry point.
  - **Solid** lowers each entry case to a `<Match>` whose body is the lifted
    helper element, or for inline arms a fragment of the inline JSX plus a chain
    `<NextHelper/>`.

  Vue's and Solid's client transforms now hoist all `StatementBodyHook` helpers —
  not just the fall-through ones — to module scope (Vue wraps each in
  `defineVaporComponent`). Every control flow that already went through the lift
  on React (hook-bearing `if`, `switch`, `try`, and `for-of` bodies) now produces
  a single top-level helper instead of a per-render lazy initializer.
  `compile_to_volar_mappings` opts back out via
  `moduleScopedHookComponents: false` so Volar's virtual TSX keeps helpers local —
  closure-captured bindings stay resolvable against the component body for type
  checking.

  Create map helper functions for for-of loops to be used in the future transforms

- Updated dependencies
  [[`de27e18`](https://github.com/Ripple-TS/ripple/commit/de27e182d002ea736aee992acca4cbf9873a307d),
  [`59e1e32`](https://github.com/Ripple-TS/ripple/commit/59e1e328607598fe342abbba35f76e5fadb9ca5c),
  [`1256569`](https://github.com/Ripple-TS/ripple/commit/12565695efaa3a4ad429245807721ea671c2ecb5),
  [`1256569`](https://github.com/Ripple-TS/ripple/commit/12565695efaa3a4ad429245807721ea671c2ecb5),
  [`18b4aef`](https://github.com/Ripple-TS/ripple/commit/18b4aefa8127e56a9f1b3058da2d4d2172551579)]:
  - @tsrx/core@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies
  [[`3e84758`](https://github.com/Ripple-TS/ripple/commit/3e847588027d6254c3999a87c717e9d58fb55a26),
  [`3e84758`](https://github.com/Ripple-TS/ripple/commit/3e847588027d6254c3999a87c717e9d58fb55a26),
  [`509170b`](https://github.com/Ripple-TS/ripple/commit/509170ba3cecc611ba1798575c70555070665736)]:
  - @tsrx/core@0.1.4

## 0.1.3

### Patch Changes

- [#1099](https://github.com/Ripple-TS/ripple/pull/1099)
  [`4f360f0`](https://github.com/Ripple-TS/ripple/commit/4f360f008edf61492cf85afa646c797c80a73f22)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Keep explicit return values
  in expression-position `<tsrx>` templates out of render control-flow lowering.

- [#1101](https://github.com/Ripple-TS/ripple/pull/1101)
  [`2ae792c`](https://github.com/Ripple-TS/ripple/commit/2ae792cdca7d466e552a330ea965cefec2b1f5a5)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Preserve JSX parser state for
  semicolon-free native TSRX returns inside callback props.

- Updated dependencies
  [[`5a59d73`](https://github.com/Ripple-TS/ripple/commit/5a59d73daf60b2652c86ffad2a4eaf3d801e40d7),
  [`4f360f0`](https://github.com/Ripple-TS/ripple/commit/4f360f008edf61492cf85afa646c797c80a73f22),
  [`c042672`](https://github.com/Ripple-TS/ripple/commit/c04267255d35945753ca8090006622c96fa0a14f),
  [`a9d640f`](https://github.com/Ripple-TS/ripple/commit/a9d640f0728996b3f21b452ffe6040e54d82609c),
  [`5a59d73`](https://github.com/Ripple-TS/ripple/commit/5a59d73daf60b2652c86ffad2a4eaf3d801e40d7),
  [`2ae792c`](https://github.com/Ripple-TS/ripple/commit/2ae792cdca7d466e552a330ea965cefec2b1f5a5),
  [`96360f3`](https://github.com/Ripple-TS/ripple/commit/96360f36306180e67ce69e464dd545773e57e8b1)]:
  - @tsrx/core@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies
  [[`2010290`](https://github.com/Ripple-TS/ripple/commit/20102904d68951b47dce3958f88ddd1fc150e7a1)]:
  - @tsrx/core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies
  [[`0fdf340`](https://github.com/Ripple-TS/ripple/commit/0fdf3408417a7565a00304b766e958b438b3c834)]:
  - @tsrx/core@0.1.1

## 0.1.0

### Minor Changes

- [#1088](https://github.com/Ripple-TS/ripple/pull/1088)
  [`2a85e9b`](https://github.com/Ripple-TS/ripple/commit/2a85e9bb73f4d82f2bd2273c33735b4dc7b82d5f)
  Thanks [@trueadm](https://github.com/trueadm)! - Add `<tsrx>...</tsrx>`
  expression fragments for inline native TSRX template values.

### Patch Changes

- Updated dependencies
  [[`2a85e9b`](https://github.com/Ripple-TS/ripple/commit/2a85e9bb73f4d82f2bd2273c33735b4dc7b82d5f)]:
  - @tsrx/core@0.1.0

## 0.0.23

### Patch Changes

- [#1071](https://github.com/Ripple-TS/ripple/pull/1071)
  [`b54a72f`](https://github.com/Ripple-TS/ripple/commit/b54a72f721adb5f08a5bf3e3d006780b7e1eb471)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Add named ref props with
  `prop_name={ref expr}` syntax and expose `isRefProp()` for runtime detection of
  named ref prop values.

- [#1071](https://github.com/Ripple-TS/ripple/pull/1071)
  [`b54a72f`](https://github.com/Ripple-TS/ripple/commit/b54a72f721adb5f08a5bf3e3d006780b7e1eb471)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Import ref helpers only when
  their generated calls are emitted.

- [#1071](https://github.com/Ripple-TS/ripple/pull/1071)
  [`b54a72f`](https://github.com/Ripple-TS/ripple/commit/b54a72f721adb5f08a5bf3e3d006780b7e1eb471)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Declare normalized host
  spread refs emitted from TSX expression blocks.

- [#1071](https://github.com/Ripple-TS/ripple/pull/1071)
  [`b54a72f`](https://github.com/Ripple-TS/ripple/commit/b54a72f721adb5f08a5bf3e3d006780b7e1eb471)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Suppress Vue host ref prop
  verification in type-only TSRX output without changing the generated ref
  expression.

- [#1071](https://github.com/Ripple-TS/ripple/pull/1071)
  [`b54a72f`](https://github.com/Ripple-TS/ripple/commit/b54a72f721adb5f08a5bf3e3d006780b7e1eb471)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Keep Vue named ref component
  props as direct attributes in type-only TSX so Volar can complete prop names.

- Updated dependencies
  [[`b54a72f`](https://github.com/Ripple-TS/ripple/commit/b54a72f721adb5f08a5bf3e3d006780b7e1eb471),
  [`b54a72f`](https://github.com/Ripple-TS/ripple/commit/b54a72f721adb5f08a5bf3e3d006780b7e1eb471),
  [`b54a72f`](https://github.com/Ripple-TS/ripple/commit/b54a72f721adb5f08a5bf3e3d006780b7e1eb471)]:
  - @tsrx/core@0.0.28

## 0.0.22

### Patch Changes

- [#1064](https://github.com/Ripple-TS/ripple/pull/1064)
  [`eae7b40`](https://github.com/Ripple-TS/ripple/commit/eae7b4047f4d8cc7a0278fb48ffe630d73a592c6)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Reject component declarations
  with more than one parameter. Previously, JSX targets passed extra parameters
  straight through into the generated function and ripple silently dropped them.
  Multi-parameter components now error in regular compile and are surfaced as
  collected diagnostics in the Volar editor pipeline.

- [#1061](https://github.com/Ripple-TS/ripple/pull/1061)
  [`29ac6d7`](https://github.com/Ripple-TS/ripple/commit/29ac6d757b376e4102c4c8c8d3d47f7ae3afdd00)
  Thanks [@trueadm](https://github.com/trueadm)! - Fix lone expression children
  inside fragment shorthand so they render from component, branch, and loop
  bodies.

- [#1057](https://github.com/Ripple-TS/ripple/pull/1057)
  [`b34b95a`](https://github.com/Ripple-TS/ripple/commit/b34b95a808ec801109d1818f4d24ae0bbc00f66b)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Enforces a stricter rule for
  components declared inside classes: they must be arrow-function class properties
  (including static), and class component foo() {} method-style declarations are
  no longer supported.

  Removes component method declarations support in favor of using as properties.

- [#1066](https://github.com/Ripple-TS/ripple/pull/1066)
  [`4cd0986`](https://github.com/Ripple-TS/ripple/commit/4cd0986201e960cd8544d0f789d17a217e93f954)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Introduces a typeOnly flag to
  transformers to compile for either production or editor support.

  Lazy transformations for typeOnly are not skipped, only the & is removed to make
  it look like a regular destructure.

- [#1063](https://github.com/Ripple-TS/ripple/pull/1063)
  [`a960343`](https://github.com/Ripple-TS/ripple/commit/a960343169aee906162211c502b6cc6b74e2a124)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Standardizes compile api
  across all packages, including forcing types to adhere to the standard. Adds
  more debug compile options to the playgrounds.

- [#1062](https://github.com/Ripple-TS/ripple/pull/1062)
  [`1d51061`](https://github.com/Ripple-TS/ripple/commit/1d51061890bc6dfc5f8e177455b91ab93977db1d)
  Thanks [@trueadm](https://github.com/trueadm)! - Lower Vue `for...of` templates
  to `VaporFor` so loop item and key callbacks preserve types. Update the Vue
  plugin bridge and peer floor for the `vue-jsx-vapor` runtime that provides
  `VaporFor`.

- Updated dependencies
  [[`eae7b40`](https://github.com/Ripple-TS/ripple/commit/eae7b4047f4d8cc7a0278fb48ffe630d73a592c6),
  [`29ac6d7`](https://github.com/Ripple-TS/ripple/commit/29ac6d757b376e4102c4c8c8d3d47f7ae3afdd00),
  [`b34b95a`](https://github.com/Ripple-TS/ripple/commit/b34b95a808ec801109d1818f4d24ae0bbc00f66b),
  [`cf60dba`](https://github.com/Ripple-TS/ripple/commit/cf60dbaf9c6be84d6e95f9c5d66b64d8927494c9),
  [`4cd0986`](https://github.com/Ripple-TS/ripple/commit/4cd0986201e960cd8544d0f789d17a217e93f954),
  [`a960343`](https://github.com/Ripple-TS/ripple/commit/a960343169aee906162211c502b6cc6b74e2a124)]:
  - @tsrx/core@0.0.27

## 0.0.21

### Patch Changes

- Updated dependencies
  [[`8125c73`](https://github.com/Ripple-TS/ripple/commit/8125c73b37e7b201dbb0a078e3583c022ceb7687)]:
  - @tsrx/core@0.0.26

## 0.0.20

### Patch Changes

- [#1047](https://github.com/Ripple-TS/ripple/pull/1047)
  [`d1acf12`](https://github.com/Ripple-TS/ripple/commit/d1acf129cdd0bf2ee596dbab26ec4df829a33880)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Support arrow syntax for
  anonymous component expressions and preserve anonymous component
  function-vs-arrow source form across TSRX and Ripple targets.

- [#1050](https://github.com/Ripple-TS/ripple/pull/1050)
  [`3928ac8`](https://github.com/Ripple-TS/ripple/commit/3928ac8816399f9eccfd40081d480042a9d74030)
  Thanks [@trueadm](https://github.com/trueadm)! - Parse direct double-quoted text
  in bare if/else branches and backtick-delimited fragment text as renderable
  template text.

- Updated dependencies
  [[`d1acf12`](https://github.com/Ripple-TS/ripple/commit/d1acf129cdd0bf2ee596dbab26ec4df829a33880),
  [`d1acf12`](https://github.com/Ripple-TS/ripple/commit/d1acf129cdd0bf2ee596dbab26ec4df829a33880),
  [`3928ac8`](https://github.com/Ripple-TS/ripple/commit/3928ac8816399f9eccfd40081d480042a9d74030)]:
  - @tsrx/core@0.0.25

## 0.0.19

### Patch Changes

- [#1042](https://github.com/Ripple-TS/ripple/pull/1042)
  [`f5a3c1b`](https://github.com/Ripple-TS/ripple/commit/f5a3c1b9e915c250c8cd1a7dcf4e80c44abe720f)
  Thanks [@trueadm](https://github.com/trueadm)! - Align component loop
  control-flow validation across TSRX targets and allow `continue` to skip
  `for...of` iterations.

- Updated dependencies
  [[`f5a3c1b`](https://github.com/Ripple-TS/ripple/commit/f5a3c1b9e915c250c8cd1a7dcf4e80c44abe720f),
  [`f5a3c1b`](https://github.com/Ripple-TS/ripple/commit/f5a3c1b9e915c250c8cd1a7dcf4e80c44abe720f)]:
  - @tsrx/core@0.0.24

## 0.0.18

### Patch Changes

- Updated dependencies
  [[`3b2eae2`](https://github.com/Ripple-TS/ripple/commit/3b2eae24dc955325a0379c4773631796865e0f38),
  [`5c6ee71`](https://github.com/Ripple-TS/ripple/commit/5c6ee71bfd4f5dc443c43eb34e631bb032606faf),
  [`83b19fd`](https://github.com/Ripple-TS/ripple/commit/83b19fd67aa27eb10e93205dd88c61b13ffbc523)]:
  - @tsrx/core@0.0.23

## 0.0.17

### Patch Changes

- [#1031](https://github.com/Ripple-TS/ripple/pull/1031)
  [`b4cc83f`](https://github.com/Ripple-TS/ripple/commit/b4cc83f07d8777d5882d1e853493941a3f6224ae)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Preserve generic type
  arguments on JSX component tags (e.g. `<RenderProp<User>>`). They were being
  silently dropped during prettier formatting, during the tsrx → JSX compile
  output for React/Preact/Solid/Vue, and in Ripple's `to_ts` virtual-code output
  used by the language server for typechecking.

- Updated dependencies
  [[`b4cc83f`](https://github.com/Ripple-TS/ripple/commit/b4cc83f07d8777d5882d1e853493941a3f6224ae)]:
  - @tsrx/core@0.0.22

## 0.0.16

### Patch Changes

- Updated dependencies
  [[`76fd362`](https://github.com/Ripple-TS/ripple/commit/76fd3622f3e6432787fadb1a96337541424b25aa)]:
  - @tsrx/core@0.0.21

## 0.0.15

### Patch Changes

- [#1014](https://github.com/Ripple-TS/ripple/pull/1014)
  [`31193f2`](https://github.com/Ripple-TS/ripple/commit/31193f23aa6b6b5b79cd858f57e8aca69cd44b6d)
  Thanks [@trueadm](https://github.com/trueadm)! - Add a `collect` compile option
  for collecting diagnostics and comments without enabling loose markup recovery.

- Updated dependencies
  [[`31193f2`](https://github.com/Ripple-TS/ripple/commit/31193f23aa6b6b5b79cd858f57e8aca69cd44b6d),
  [`31193f2`](https://github.com/Ripple-TS/ripple/commit/31193f23aa6b6b5b79cd858f57e8aca69cd44b6d)]:
  - @tsrx/core@0.0.20

## 0.0.14

### Patch Changes

- [#1009](https://github.com/Ripple-TS/ripple/pull/1009)
  [`7832be8`](https://github.com/Ripple-TS/ripple/commit/7832be8d1d2937e7f1005ab79e964329d42e0108)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Stop emitting a duplicate
  source mapping for the synthesized attribute name when shorthand JSX attributes
  (`<X {count} />`) are expanded to longhand (`<X count={count} />`). The
  generated `count=` does not exist in the source, so it should not carry a source
  mapping; previously editors showed duplicate hover/intellisense popups on the
  same `{count}` span.

- [#1009](https://github.com/Ripple-TS/ripple/pull/1009)
  [`7832be8`](https://github.com/Ripple-TS/ripple/commit/7832be8d1d2937e7f1005ab79e964329d42e0108)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Collect transform-time errors
  instead of throwing in loose mode for the JSX targets (React, Preact, Solid,
  Vue). Recoverable validation failures (component `await` without `"use server"`,
  `<tsx:kind>` mismatches, multiple `ref={...}` attributes, malformed `try`
  blocks, fragment-as-element, `for await...of`) now push onto `result.errors` so
  the typescript-plugin and other editor tooling can surface them as diagnostics
  on top of a still-valid virtual TSX, mirroring how `@tsrx/ripple` already
  behaves.

- [#1009](https://github.com/Ripple-TS/ripple/pull/1009)
  [`7832be8`](https://github.com/Ripple-TS/ripple/commit/7832be8d1d2937e7f1005ab79e964329d42e0108)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Add type declarations for the
  `./merge-refs` and `./error-boundary` subpath exports of `@tsrx/react`,
  `@tsrx/preact`, and `@tsrx/vue`, and for `@tsrx/core/runtime/merge-refs`.
  Previously these subpaths only declared a `default` export, so under
  `node16`/`nodenext`/`bundler` resolution TypeScript could not pick up types for
  `import { mergeRefs } from '@tsrx/react/merge-refs'` or the `TsrxErrorBoundary`
  re-exports.
- Updated dependencies
  [[`7832be8`](https://github.com/Ripple-TS/ripple/commit/7832be8d1d2937e7f1005ab79e964329d42e0108),
  [`7832be8`](https://github.com/Ripple-TS/ripple/commit/7832be8d1d2937e7f1005ab79e964329d42e0108),
  [`7832be8`](https://github.com/Ripple-TS/ripple/commit/7832be8d1d2937e7f1005ab79e964329d42e0108)]:
  - @tsrx/core@0.0.19

## 0.0.13

### Patch Changes

- [#994](https://github.com/Ripple-TS/ripple/pull/994)
  [`bce43be`](https://github.com/Ripple-TS/ripple/commit/bce43be304812ca04dd8d196e2439f28ea392237)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Compile-time merge for
  multiple ref expressions, plus a diagnostic for duplicate `ref={...}`
  attributes.

  **New rule**: an element may have at most one TSX-style `ref={...}` attribute.
  Multiple `ref={...}` on the same element is now a compile error — they would
  otherwise produce duplicate JSX props (last-wins at runtime, can't be typed
  cleanly). The error suggests the supported alternative.

  **Multiple `{ref expr}` keyword-form refs are still supported and merge into one
  ref**:
  - `@tsrx/react`, `@tsrx/preact`, and `@tsrx/vue` emit
    `ref={mergeRefs(a, b, ...)}`, importing the shared `mergeRefs` helper from
    `@tsrx/react/merge-refs`, `@tsrx/preact/merge-refs`, and
    `@tsrx/vue/merge-refs` respectively. The helper supports function refs,
    React-style `{ current }` ref objects, and Vue-style `{ value }` ref objects
    (e.g. from `ref()` / `useTemplateRef()`), and composes React 19 cleanup return
    values.
  - `@tsrx/solid` emits `ref={[a, b, ...]}`, which Solid's runtime iterates
    natively.

  A single `ref={...}` may be combined with any number of `{ref expr}` on the same
  element — they all merge together. Single-ref elements (either syntax) emit
  unchanged with no helper import.

  `@tsrx/vue` previously merged multiple `{ref expr}` into an inline arrow
  callback that only worked for function refs. Vue now uses the shared `mergeRefs`
  helper, which fixes Vue ref-object handling (`ref()` / `useTemplateRef()`) and
  the previously-broken combo case (`<el ref={a} {ref b} />`).

- Updated dependencies
  [[`088299c`](https://github.com/Ripple-TS/ripple/commit/088299ce94a6022c017ce2e56c7e1b59bd5973f7),
  [`bce43be`](https://github.com/Ripple-TS/ripple/commit/bce43be304812ca04dd8d196e2439f28ea392237)]:
  - @tsrx/core@0.0.18

## 0.0.12

### Patch Changes

- Updated dependencies
  [[`c631ab0`](https://github.com/Ripple-TS/ripple/commit/c631ab0076b7e2cb30f4998101b54c3a86e78c61)]:
  - @tsrx/core@0.0.17

## 0.0.11

### Patch Changes

- [#949](https://github.com/Ripple-TS/ripple/pull/949)
  [`f660969`](https://github.com/Ripple-TS/ripple/commit/f66096972bc8d2f03061e6018d03e40207761aaa)
  Thanks [@trueadm](https://github.com/trueadm)! - Fix Vue early-return lowering
  so continuation-local refs stay stable across parent updates.

  Also make `if (cond) return;` early returns in Vue components reactive after
  mount. Previously the early return was emitted as a setup-time `if` block, which
  only evaluated `cond` once when `setup()` ran and never again — so flipping the
  condition after mount didn't toggle the continuation.

  The lowering now picks one of two paths based on the continuation:
  - **Pure JSX continuation** — inlined as a render-time ternary
    (`cond ? null : <continuation/>`). Cheapest path, no extra component.
  - **Continuation with setup-time statements** (`provide`, `watch`,
    `watchEffect`, declarations, plain function calls, etc.) — moved into a
    `StatementBodyHook` helper component whose setup runs only when the helper
    mounts. This keeps those statements scoped to the continuation's lifecycle so
    e.g. `provide` is only visible to descendants while the continuation is
    active.

  React, Preact, and Solid lowering is unchanged: their bodies re-run on every
  render, so the existing setup-time `if` already behaves reactively.

- [#949](https://github.com/Ripple-TS/ripple/pull/949)
  [`f660969`](https://github.com/Ripple-TS/ripple/commit/f66096972bc8d2f03061e6018d03e40207761aaa)
  Thanks [@trueadm](https://github.com/trueadm)! - Add Vue `try/catch` component
  error boundary support.

- Updated dependencies
  [[`f660969`](https://github.com/Ripple-TS/ripple/commit/f66096972bc8d2f03061e6018d03e40207761aaa)]:
  - @tsrx/core@0.0.16
