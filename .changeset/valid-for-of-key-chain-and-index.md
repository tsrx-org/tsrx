---
'@tsrx/eslint-plugin': patch
---

`tsrx/valid-for-of-key` accepts a loop's declared `index` as its key (`@for (const item of items; index i; key i)`) instead of reporting `Variable 'i' is not defined` ([#559](https://github.com/tsrx-org/tsrx/issues/559)). It also reports an undeclared variable anywhere in the key. Before, it missed one inside an optional chain (`key missing?.id`), a non-null assertion, an `as` or `satisfies` expression, a spread, a sequence, a tagged template, an assignment, an update, `new`, `import()`, or a function ([#860](https://github.com/tsrx-org/tsrx/issues/860)).
