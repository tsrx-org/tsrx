---
'@tsrx/prettier-plugin': minor
'@tsrx/eslint-plugin': minor
---

Remove lazy destructuring support per [RFC #106](https://github.com/tsrx-org/tsrx/discussions/106): the Prettier plugin no longer prints `&{ ... }` / `&[ ... ]` patterns, and the `tsrx/no-lazy-destructuring-in-modules` ESLint rule is removed from the plugin and its `recommended` and `strict` configs.
