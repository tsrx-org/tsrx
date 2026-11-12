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

## Related Packages

- [@tsrx/eslint-plugin](https://www.npmjs.com/package/@tsrx/eslint-plugin) -
  ESLint rules for TSRX
- [@tsrx/prettier-plugin](https://www.npmjs.com/package/@tsrx/prettier-plugin) -
  Prettier plugin for TSRX

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
