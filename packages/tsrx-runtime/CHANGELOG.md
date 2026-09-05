# @tsrx/runtime

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
