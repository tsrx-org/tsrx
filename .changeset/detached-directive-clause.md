---
'@tsrx/core': patch
'@tsrx/eslint-parser': patch
---

A directive's clause that no directive takes in element children is now an error, TSRX1012, at its keyword, in every mode: `@else` before `{` or `if`, `@empty` or `@pending` before `{`, `@catch` before `{` or `(`, `@case …:` and `@default:`, written after text, an element or an expression container (`@if (ok) { <i /> } note @else { <b /> }`), in the wrong order (`@try { … } @catch (e) { … } @pending { … }`), or with no directive before it. It compiled before as text, and its `{ … }` rendered whatever the directive did. A clause right after its block, with only comments between, is unchanged, and `&#64;else` writes the text.

`@tsrx/eslint-parser` reports TSRX1012 as a parse error, as it does a clause written without its `@` (TSRX1009).
