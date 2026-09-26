---
'@tsrx/prettier-plugin': patch
---

A `${…}` expression that breaks over several lines in a CSS, GraphQL, or HTML
template literal indents from the line the embedded code's printer puts its
`${` on, so a second pass no longer moves it. It used to indent from the line
it was written on, like Prettier's first pass, and the next pass indented it
again. The formatter now prints Prettier's stable layout at once, also in
template attributes (``class={css`…`}``). An expression on a line kept as written,
like one in a CSS comment or an HTML `<pre>`, still indents from that line.
