---
'@tsrx/zed-plugin': patch
---

The tree-sitter grammar now parses a `<style>` or `<script>` block wherever an expression can go. This includes the parenthesized form the formatter writes for an assigned theme (`const theme = (<style>…</style>);`), `export default`, a return, an arrow body and an argument. Before, it parsed a block only right after `=`, and anywhere else it read the CSS as JSX. A `<style>` body now also ends only at `</style>`, so CSS that contains `<`, such as `@media (width < 600px)` or `content: '<'`, parses.
