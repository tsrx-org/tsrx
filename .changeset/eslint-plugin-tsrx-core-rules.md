---
'@tsrx/eslint-plugin': patch
---

Add `tsrx/no-unused-vars`, `tsrx/no-await-in-loop` and `tsrx/no-unreachable`, which wrap ESLint's core rules of the same names and understand TSRX syntax ([#1154](https://github.com/tsrx-org/tsrx/issues/1154)). `tsrx/no-unused-vars` suggests removing the whole `; index i` clause of an unused `@for` index, instead of leaving `index )`, which doesn't parse. `tsrx/no-await-in-loop` also reports an `await` in a `@for` key. `tsrx/no-unreachable` treats the arms of a `@switch` as alternatives, so after an arm that throws it doesn't report the other arms or the code after the `@switch`. Every other report and suggestion is the core rule's.

A new `tsrx.configs.js` configuration, for `js.configs.recommended` users, turns off `no-unused-vars` and `no-unreachable` for `.tsrx` files and turns on their TSRX versions at `error`. List it after `js.configs.recommended`, and move any options you give the core rules to the TSRX rules. `recommended` and `strict` don't change. `tsrx/no-await-in-loop` stays opt-in: if you turn on `no-await-in-loop`, use `tsrx/no-await-in-loop` for `.tsrx` files instead.
