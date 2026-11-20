---
'@tsrx/prettier-plugin': patch
---

Never print `{" "}` right after an `@` in text. Where Prettier breaks a line at a space after a word that ends in `@` (`… contact us@ <a>…`, or `handle@ ` at the end of a text), it printed `us@{" "}`, which TSRX reads as an `@{ … }` code block: the text lost its `@` and the space, and formatting again turned it into `@{ (" "); }`. The `{" "}` now starts the next line (`us@` and then `{" "}<a>…`), which keeps the text and the space. Likewise a line break between an `@` and a `{` (`@⏎{value}`) stays, where Prettier joined them into `@{value}`.
