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

### With eslint-plugin-react

`react/jsx-curly-brace-presence` unwraps strings that TSRX text reads as syntax,
so its `--fix` can break a `.tsrx` file. The `react` configuration turns it off
for `.tsrx` files and turns on `tsrx/jsx-curly-brace-presence`, which keeps those
braces. List it after eslint-plugin-react's configurations, or a later one turns
the react rule back on:

```js
// eslint.config.js
import react from 'eslint-plugin-react';
import tsrx from '@tsrx/eslint-plugin';

export default [
  react.configs.flat.recommended,
  ...tsrx.configs.recommended,
  ...tsrx.configs.react,
];
```

`react.configs.flat.recommended` doesn't turn on `react/jsx-curly-brace-presence`,
so with it, `tsrx.configs.react` adds `tsrx/jsx-curly-brace-presence` as a new
rule at `error` rather than swapping one in. Leave `tsrx.configs.react` out if you
don't want the rule. To pass options, set them on `tsrx/jsx-curly-brace-presence`,
after `tsrx.configs.react`.

## Rules

- `tsrx/control-flow-jsx` requires template output in returned `@for` blocks.
- `tsrx/require-statement-container-body` detects component bodies that need the
  `@{ ... }` statement-container marker.
- `tsrx/valid-for-of-key` validates identifiers used in TSRX loop keys.
- `tsrx/jsx-curly-brace-presence` is `react/jsx-curly-brace-presence`, with the
  same options and messages, for TSRX text. It doesn't unwrap a child that TSRX
  would read differently: a directive such as `{'@for (item of items)'}`, a
  comment such as `{'// note'}`, text that would join a comment or a directive
  clause beside it, or the first child of a `<style>`. To tell, it parses the
  element around a child whose text could be TSRX syntax, before and after the
  unwrap, with the file's parser. Inside an expression container it parses the
  top-level statement, for at most 50 children per file, and keeps the braces past
  that. Each fix spans the text beside the child, so fixes that would touch the
  same text go in separate passes of one `--fix` run. See
  [With eslint-plugin-react](#with-eslint-plugin-react).
- `tsrx/no-return-in-component` is a deprecated no-op retained for compatibility.

Target runtime rules do not belong in the shared recommended configuration. For
example, Ripple-specific `track()` placement and DOM event guidance should be
provided by Ripple-owned tooling rather than applied to every TSRX target.

See the [TSRX documentation](https://tsrx.dev/) and
[`@tsrx/eslint-parser`](https://github.com/tsrx-org/tsrx/tree/main/packages/eslint-parser).
