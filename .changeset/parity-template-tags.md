---
'@tsrx/core': patch
---

A `<style>` body now ends at a closing tag with whitespace before its `>` (`</style >`, or `</style` and `>` on the next line), as JSX allows and as a `<script>` body already does. Before, the element was reported as unclosed. This also applies inside a CSS string or comment: `content: "</style >"` now ends the body there, as HTML and TSX end it, where only an exact `</style>` did before.

An element closed by a fragment's closing tag (`<b>x</>`) now reports `Expected '</b>' but found '</>'`, where the message said `found '</null>'`.
