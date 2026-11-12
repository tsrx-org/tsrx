# @tsrx/eslint-parser

[![npm version](https://img.shields.io/npm/v/%40tsrx%2Feslint-parser?logo=npm)](https://www.npmjs.com/package/@tsrx/eslint-parser)
[![npm downloads](https://img.shields.io/npm/dm/%40tsrx%2Feslint-parser?logo=npm&label=downloads)](https://www.npmjs.com/package/@tsrx/eslint-parser)

ESLint parser for TSRX files. This parser enables ESLint to understand and lint
`.tsrx` files by default, using the shared TSRX parser from `@tsrx/core`.

## Installation

```bash
pnpm add --save-dev '@tsrx/eslint-parser'
# or
npm install --save-dev '@tsrx/eslint-parser'
# or
yarn add --dev '@tsrx/eslint-parser'
```

## Usage

### Flat Config (ESLint 9+)

```js
// eslint.config.js
import tsrxParser from '@tsrx/eslint-parser';
import tsrxPlugin from '@tsrx/eslint-plugin';

export default [
  {
    files: ['**/*.tsrx'],
    languageOptions: {
      parser: tsrxParser,
    },
    plugins: {
      tsrx: tsrxPlugin,
    },
    rules: {
      ...tsrxPlugin.configs.recommended.rules,
    },
  },
];
```

### Legacy Config (.eslintrc)

```json
{
  "overrides": [
    {
      "files": ["*.tsrx"],
      "parser": "@tsrx/eslint-parser",
      "plugins": ["tsrx"],
      "extends": ["plugin:tsrx/recommended"]
    }
  ]
}
```

## How It Works

This parser uses the shared TSRX parser (`@tsrx/core`) to parse TSRX files into an
ESTree-compatible AST that ESLint can analyze.

The parser:

1. Parses the TSRX source code (`.tsrx`)
2. Normalizes the AST for ESLint traversal
3. Returns the ESTree AST to ESLint
4. Allows ESLint rules to analyze TSRX-specific patterns

### Dynamic Tags

Rules read an element's name as a JSX name. For a dynamic tag, they get one that
mirrors the tag's expression: `<{as}>` is the `JSXIdentifier` `as`, and
`<{ui.Box}>` is the `JSXMemberExpression` `ui.Box`. An expression that no JSX name
can show, such as `<{'div'}>`, `<{icons[name]}>` or `<{getTag()}>`, gets the
synthetic name `tsrx-dynamic-tag`. The name spans the braces, and the element
keeps `isDynamic: true`. The expression container moves to `tagExpression`, where
rules still lint the code and scope analysis reads it, so `no-unused-vars` and
`no-undef` see the variables it uses.

### Rule Fixes TSRX Can't Take

Some `eslint-plugin-react` fixes write JSX that TSRX reads differently than TSX
does. The parser can't prevent them:

- `react/jsx-curly-brace-presence` unwraps a string child into text. TSRX text can
  start a directive (`@if (`, `@for (`, `@switch (`) or a `//` comment, so
  `{'@for (item of items)'}` stops parsing, and `{'// note'}` on its own line
  becomes a comment. Use `tsrx/jsx-curly-brace-presence` from
  [`@tsrx/eslint-plugin`](https://github.com/tsrx-org/tsrx/tree/main/packages/eslint-plugin)
  instead: it has the same options, and keeps those braces. Its `react`
  configuration swaps it in for `.tsrx` files.
- `react/jsx-tag-spacing` with `closingSlash: 'always'` writes `< /p>`, which
  neither TSRX nor TypeScript reads as a closing tag. With
  `afterOpening: 'always'` it writes `< br />`, which TSRX reads as text inside an
  element. Keep both options at `'never'`, their default.

## Supported Syntax

The parser supports TSRX syntax including:

- Native TSRX elements and fragments as JavaScript expressions
- JSX statement containers with `@{ ... }` for setup plus one rendered output
- Template directives like `@if`, `@for`, `@switch`, and `@try`
- Function components that return TSRX, TSX, or standard JavaScript values
- All standard JavaScript/TypeScript syntax

## Example

Given a `.tsrx` file:

```tsrx
import { signal } from 'signals';

export function Counter() @{
  const count = signal(0);

  <button onClick={() => count.value++}>
    Increment
    <span>{count.value}</span>
  </button>
}
```

The parser will successfully parse this and allow ESLint rules (like those from
`@tsrx/eslint-plugin`) to check for:

- Missing statement-container markers
- Invalid rendering control flow
- And more

## Known Limitations

Some core ESLint rules miss part of what TSRX syntax does, and the parser can't
change that without misdescribing the source to other rules.
[`@tsrx/eslint-plugin`](https://www.npmjs.com/package/@tsrx/eslint-plugin) has
TSRX versions of these rules. Its `js` configuration, for `js.configs.recommended`
users, uses `tsrx/no-unused-vars` and `tsrx/no-unreachable` for `.tsrx` files:

- `no-unused-vars` reports an unused `@for` index, but its "Remove unused
  variable" suggestion deletes only the name, and `index )` doesn't parse.
  `tsrx/no-unused-vars` removes the whole `; index i` clause.
- `no-await-in-loop` doesn't report an `await` in a `@for` key, though the key
  runs once per item. `tsrx/no-await-in-loop` does: use it for `.tsrx` files if
  you turn on `no-await-in-loop`.
- Code path analysis runs the arms of a `@switch` one after another, not as
  alternatives. After an arm that ends in `throw`, `no-unreachable` reports the
  arms and code that follow it. `tsrx/no-unreachable` treats the arms as
  alternatives.

Other rules built on code paths still treat every `@switch` arm as always running.
For example, `react-hooks/rules-of-hooks` doesn't report a hook called in a
`@case` body. The arms of `@if` get their own code paths.

No TSRX rule covers these:

- Code path analysis runs the blocks of a `@try` one after another: the body,
  `@pending`, then `@catch`. In TSRX, a `@catch` renders when the `@try` body
  throws, and `@pending` shows while it suspends, so these reports can be false:
  - After a body that throws, `no-unreachable` reports `@pending`, the `@catch`
    and the code after the `@try`. After a `@pending` that throws, it reports the
    `@catch` and the code after the `@try`, and after a `@catch` that throws, such
    as one that rethrows, the code after the `@try`.
  - `no-unreachable-loop` reports a `@for` that holds a `@try` whose body or
    `@catch` throws, as if the loop could run only once.
  - `react-hooks/rules-of-hooks` reports as conditional a hook after a `@try`
    whose body or `@catch` throws.
  - `no-useless-assignment` treats an assignment in the body as overwritten by one
    in `@catch`. It also treats a value set before the `@try` as overwritten when
    the body or `@pending` assigns it, though the `@catch` reads it.

  `rules-of-hooks` also misses a hook such as `useState` called in `@catch`,
  though React fails on it. A `try` statement would fix these, but it would put
  the body inside a `try`, which the React, Preact and Hono output doesn't have.
  `rules-of-hooks` would then report as conditional every hook after the body's
  first call, member access or identifier, except `use()`, which react-hooks 6.1.1
  and 7.1.1 report anywhere in the body as inside a try/catch block.

  The React, Preact and Hono output differs from that model, so some of these
  reports hold there: it runs `@pending`'s code before the body on every render,
  and a throw in the body's own code, rather than in a component the body renders,
  ends the render without reaching the `@catch`.

- `curly` with `multi` or `multi-or-nest` removes the braces from an `@if`,
  `@else`, `@else if` or `@for` body that holds a single statement, such as
  `@if (n) { throw error; }`. TSRX needs them, so `--fix` leaves a file that
  doesn't parse. Use `all` or `multi-line`, which leave these bodies alone.
- A `@pending` block shows while the `@try` body suspends, but code path analysis
  runs it after the body. So `no-useless-assignment` can flag a value only
  `@pending` reads, when the body overwrites it or can't complete.

## Related Packages

- [@tsrx/eslint-plugin](https://www.npmjs.com/package/@tsrx/eslint-plugin) -
  ESLint rules for TSRX
- [@tsrx/prettier-plugin](https://www.npmjs.com/package/@tsrx/prettier-plugin) -
  Prettier plugin for TSRX

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
