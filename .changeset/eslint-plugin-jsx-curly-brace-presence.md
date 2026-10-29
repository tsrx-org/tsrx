---
'@tsrx/eslint-plugin': patch
---

Add `tsrx/jsx-curly-brace-presence`, a TSRX version of `react/jsx-curly-brace-presence` with the same options and messages ([#1249](https://github.com/tsrx-org/tsrx/issues/1249)). It doesn't unwrap a child that TSRX would read differently: a directive such as `{'@for (item of items)'}`, a comment such as `{'// note'}`, text that would join a comment or a directive clause beside it, or the first child of a `<style>`. With the react rule, `--fix` turned those into a file that doesn't parse, or into a comment that silently drops the text. The new `tsrx.configs.react` configuration, listed after eslint-plugin-react's, turns `react/jsx-curly-brace-presence` off for `.tsrx` files and this rule on. `recommended` and `strict` don't change.
