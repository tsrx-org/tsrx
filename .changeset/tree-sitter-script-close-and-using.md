---
'@tsrx/zed-plugin': patch
'@tsrx/nvim-plugin': patch
---

The tree-sitter grammar now ends a `<script>` body where the compiler does, at `</script` followed by optional whitespace (a line break included) and `>`. Before, `</script >` was not seen as the closing tag and the script body parsed with errors. It also parses `using` and `await using` declarations (`using_declaration`), in statements, template scopes, `for…of` heads and `@for` heads, and highlights `using` as a declaration keyword. Before, they were parse errors. `using` as a variable name (`using(x)`, `using.dispose()`) parses as before. After updating the Neovim plugin, rebuild the parser with `:TSInstall! tsrx`.
