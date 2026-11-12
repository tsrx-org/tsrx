---
'@tsrx/core': patch
---

Text right before a tag now parses after a directive's block, as in `<p>@if (ok) {<b />}a<br /></p>` or `<p>@if (ok) {<b />}, write to me@x.dev<br /></p>`, and after an element that follows a directive in an element inside a `{ }` container, as in `{ok ? <p>@if (ok) {<b />}<i />x<em /></p> : null}`. Both used to fail with "Unexpected token", because the `<` after the text's last letter was read as the start of type arguments.
