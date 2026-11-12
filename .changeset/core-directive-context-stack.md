---
'@tsrx/core': patch
---

Parse time now grows linearly with the number of sibling `@if`, `@for` and `@try` directives in an element or fragment. Before, each directive body left one entry on the tokenizer's context stack and every later directive copied that stack, so the time grew with the square of the sibling count. The parsed AST is unchanged.
