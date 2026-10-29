# @tsrx/eslint-plugin

[![npm version](https://img.shields.io/npm/v/%40tsrx%2Feslint-plugin?logo=npm)](https://www.npmjs.com/package/@tsrx/eslint-plugin)
[![npm downloads](https://img.shields.io/npm/dm/%40tsrx%2Feslint-plugin?logo=npm&label=downloads)](https://www.npmjs.com/package/@tsrx/eslint-plugin)

ESLint rules and flat configurations for target-neutral TSRX syntax.

## Installation

```bash
pnpm add --save-dev eslint @eslint/js @tsrx/eslint-parser @tsrx/eslint-plugin
```

## Usage

```js
// eslint.config.js
import js from '@eslint/js';
import tsrx from '@tsrx/eslint-plugin';

export default [
  js.configs.recommended,
  ...tsrx.configs.recommended,
  ...tsrx.configs.js,
];
```

List `tsrx.configs.js` after any configuration that turns on core `no-unused-vars`
or `no-unreachable`, such as `js.configs.recommended`. See
[With `js.configs.recommended`](#with-jsconfigsrecommended).

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
- `tsrx/no-return-in-component` is a deprecated no-op retained for compatibility.
- `tsrx/no-unused-vars` is ESLint's `no-unused-vars`, except that its suggestion
  for an unused `@for` index removes the whole `; index i` clause. The core rule's
  suggestion deletes only the name and leaves `index )`, which doesn't parse.
- `tsrx/no-await-in-loop` is ESLint's `no-await-in-loop`, and also reports an
  `await` in a `@for` key, which runs once per item, as the body does.
- `tsrx/no-unreachable` is ESLint's `no-unreachable`, with the arms of a `@switch`
  as alternatives. After an arm that throws, it doesn't report the other arms or
  the code after the `@switch`. It still reports unreachable code inside an arm:
  there it follows `throw`, `return`, `break`, `continue`, `try` and endless loops
  itself, since code path analysis has already given up on the arm. It can miss
  unreachable code there when a `break`, `continue` or `return` passes through a
  `finally` block. In generated arms with heavy `try`/`finally`, label and loop
  nesting, it missed some unreachable code in about 1 in 120 (0.8%). It never
  reported code that runs.

### With `js.configs.recommended`

`js.configs.recommended` turns on `no-unused-vars` and `no-unreachable`. The `js`
configuration turns those two off for `.tsrx` files and turns on
`tsrx/no-unused-vars` and `tsrx/no-unreachable` at `error`. Every other report and
suggestion is the core rule's. A configuration can't read the severity or options
another one gives the core rule, so:

- list `tsrx.configs.js` after `js.configs.recommended`, and after any other
  configuration that turns these core rules on. Listed before them, it leaves both
  versions on for `.tsrx` files, and each problem is reported twice;
- on its own, without `js.configs.recommended`, it turns the two TSRX rules on;
- give `tsrx/no-unused-vars` the options you give `no-unused-vars`, and set a
  `tsrx/` rule to `warn` or `off` to change its severity;
- name the TSRX rule in `eslint-disable` comments in `.tsrx` files:
  `// eslint-disable-next-line tsrx/no-unused-vars`.

`js.configs.recommended` leaves `no-await-in-loop` off, so no configuration turns
on `tsrx/no-await-in-loop`. If you turn on `no-await-in-loop`, use
`tsrx/no-await-in-loop` for `.tsrx` files instead:

```js
import js from '@eslint/js';
import tsrx from '@tsrx/eslint-plugin';

export default [
  js.configs.recommended,
  ...tsrx.configs.recommended,
  ...tsrx.configs.js,
  { rules: { 'no-await-in-loop': 'error' } },
  {
    files: ['**/*.tsrx'],
    rules: {
      'tsrx/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-await-in-loop': 'off',
      'tsrx/no-await-in-loop': 'error',
    },
  },
];
```

Target runtime rules do not belong in the shared recommended configuration. For
example, Ripple-specific `track()` placement and DOM event guidance should be
provided by Ripple-owned tooling rather than applied to every TSRX target.

See the [TSRX documentation](https://tsrx.dev/) and
[`@tsrx/eslint-parser`](https://github.com/tsrx-org/tsrx/tree/main/packages/eslint-parser).
