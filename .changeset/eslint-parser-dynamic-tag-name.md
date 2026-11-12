---
'@tsrx/eslint-parser': patch
---

ESLint rules no longer crash on a dynamic tag such as `<{as}>` ([#1205](https://github.com/tsrx-org/tsrx/issues/1205)). Before, `react/no-danger`, `react/forbid-component-props`, `jsx-a11y/alt-text` and `jsx-a11y/control-has-associated-label` threw on one, and other rules reported tags such as `'[object Object]' is not defined`. Rules now see the name as the JSX name it mirrors: `<{as}>` as `as`, and `<{ui.Box}>` as `ui.Box`. A tag that no JSX name can show, such as `<{'div'}>` or `<{icons[name]}>`, gets the synthetic name `tsrx-dynamic-tag`. The expression itself moves to the element's `tagExpression`, where rules still lint it.

`no-unused-vars` and `no-undef` now see the variables in a dynamic tag's expression in a self-closing tag and with `ecmaFeatures.jsx` enabled, and report an undefined one once per element. With `ecmaFeatures.jsx` enabled, `no-undef` also no longer reports `'style' is not defined` at every `</style>`.
