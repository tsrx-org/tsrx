# @tsrx/vue-runtime

## 0.2.0

### Minor Changes

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

- [#1127](https://github.com/tsrx-org/tsrx/pull/1127)
  [`1310e6a`](https://github.com/tsrx-org/tsrx/commit/1310e6acd55e46e539fca0c63065318cc9bde3bf)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On the Vue target,
  `ref={mergeRefs(a, b)}` now type-checks, and so does the merged ref the compiler
  writes for a host element with a spread and a `ref` in a plain expression
  position, such as a ternary arm. Before, the editor and `tsrx-tsc` reported
  TS2322, because Vue types a `ref` callback as receiving an element, a component
  instance or `null`, and the merged callback accepted only the element.
  `mergeRefs` from `@tsrx/vue/ref` and `@tsrx/vue-runtime/ref` now returns a
  callback that accepts all three.

  A merged ref's cleanups now run on Vue. Vue ignores what a function ref returns
  and calls it with `null` when it unsets the ref, so a callback's returned
  cleanup never ran; the merged ref now runs it (and clears ref objects) on that
  `null` call, or when a re-created merged ref replaces it on the same element,
  which Vue does without calling the old one.

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

## 0.1.13

### Patch Changes

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
