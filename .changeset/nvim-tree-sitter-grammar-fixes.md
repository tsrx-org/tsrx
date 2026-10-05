---
'@tsrx/nvim-plugin': patch
---

The tree-sitter grammar parses `<style>` and `<script>` blocks wherever an expression can go, including the parenthesized form the formatter writes for an assigned theme, and CSS that contains `<`. It also parses indexed access types, `typeof` and `keyof` in types, `readonly` array types, holes in arrays, typed `@catch` parameters, template string escapes, and JSX text with `<`, `@` or a leading `-` ([#1057](https://github.com/tsrx-org/tsrx/pull/1057)). `keyof` is highlighted as a keyword. After updating the plugin, rebuild the parser with `:TSInstall! tsrx`.
