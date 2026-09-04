# @tsrx/eslint-plugin

[![npm version](https://img.shields.io/npm/v/%40tsrx%2Feslint-plugin?logo=npm)](https://www.npmjs.com/package/@tsrx/eslint-plugin)
[![npm downloads](https://img.shields.io/npm/dm/%40tsrx%2Feslint-plugin?logo=npm&label=downloads)](https://www.npmjs.com/package/@tsrx/eslint-plugin)

ESLint rules and flat configurations for target-neutral TSRX syntax.

## Installation

```bash
pnpm add --save-dev eslint @tsrx/eslint-parser @tsrx/eslint-plugin
```

## Usage

```js
// eslint.config.js
import tsrx from '@tsrx/eslint-plugin';

export default [...tsrx.configs.recommended];
```

The recommended configuration:

- uses `@tsrx/eslint-parser` for `.tsrx` files when installed;
- uses `@typescript-eslint/parser` for `.ts` and `.tsx` files when installed;
- registers the plugin under the `tsrx` rule namespace;
- ignores declaration files, dependencies, and common build output folders.

Use the strict configuration to enable the same syntax rules at error severity:

```js
import tsrx from '@tsrx/eslint-plugin';

export default [...tsrx.configs.strict];
```

## Rules

- `tsrx/control-flow-jsx` requires template output in returned `@for` blocks.
- `tsrx/require-statement-container-body` detects component bodies that need the
  `@{ ... }` statement-container marker.
- `tsrx/valid-for-of-key` validates identifiers used in TSRX loop keys.
- `tsrx/no-lazy-destructuring-in-modules` prevents TSRX-only `&[]` and `&{}`
  syntax from leaking into ordinary TypeScript or JavaScript modules.
- `tsrx/no-style-in-control-flow` is an opt-in rule that reports a `<style>` block
  that authors CSS inside an `@if`, `@for`, `@switch`, or `@try` body. Enable it
  when you want that restriction; recommended and strict leave it off.
- `tsrx/no-return-in-component` is a deprecated no-op retained for compatibility.

To forbid `<style>` CSS inside control-flow branches (the CSS still ships even
when the branch does not render), turn the rule on yourself:

```js
// eslint.config.js
import tsrx from '@tsrx/eslint-plugin';

export default [
  ...tsrx.configs.recommended,
  {
    files: ['**/*.tsrx'],
    rules: {
      'tsrx/no-style-in-control-flow': 'error',
    },
  },
];
```

Self-closing `<style apply={theme} />` inside a branch is allowed: it stamps
classes and does not author CSS. Assigned `const theme = <style>…</style>` belongs
outside the branch.

Target runtime rules do not belong in the shared recommended configuration. For
example, Ripple-specific `track()` placement and DOM event guidance should be
provided by Ripple-owned tooling rather than applied to every TSRX target.

See the [TSRX documentation](https://tsrx.dev/) and
[`@tsrx/eslint-parser`](../eslint-parser/README.md).
