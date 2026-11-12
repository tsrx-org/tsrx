---
'@tsrx/eslint-parser': minor
'@tsrx/eslint-plugin': patch
'@tsrx/core': patch
---

ESLint no longer crashes on a `.tsrx` file that uses `@switch` ([#913](https://github.com/tsrx-org/tsrx/issues/913)). The ESLint parser now gives ESLint the file's comments and tokens, so `eslint-disable` and other directive comments apply in `.tsrx` files ([#454](https://github.com/tsrx-org/tsrx/issues/454)), and rules that read tokens work: `no-unused-vars` reports an unused function parameter instead of crashing ([#228](https://github.com/tsrx-org/tsrx/issues/228)). `template-curly-spacing` and `indent` no longer crash on template literals and JSX children.

Give ESLint the loop of a `@for` as a real `ForOfStatement`, `ForInStatement` or `ForStatement`, in a new `loop` field of the `JSXForExpression`. Tools that read a `JSXForExpression`'s `left`, `right`, `await`, `init`, `test`, `update` or `body` read `loop.left`, `loop.body` and so on now. Its `index`, `key` and `empty` stay on the `JSXForExpression`. ESLint gets the arms of a `@switch` as `JSXSwitchCase` nodes, not `SwitchCase`, so selectors that match `SwitchCase` no longer match an `@case` or `@default`.

The parser also returns its own scope manager, built with `eslint-scope`, which is now a dependency of `@tsrx/eslint-parser`. `semi --fix` no longer rewrites a `@for` head into code that does not parse, and `init-declarations` no longer reports a `@for` variable. Core `no-undef` and `no-unused-vars` see the loop's `index`, `key` and `@empty` branch in the right scopes, so `no-undef` no longer reports a declared `index` ([#559](https://github.com/tsrx-org/tsrx/issues/559)). Loop rules such as `no-await-in-loop` and `guard-for-in` now apply to `@for` too.

A parse with `keywordTokens` records every token on the program as `tsrx_tokens`.
