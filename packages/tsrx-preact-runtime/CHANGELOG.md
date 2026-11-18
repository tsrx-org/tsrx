# @tsrx/preact-runtime

## 0.2.0

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

### Patch Changes

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
