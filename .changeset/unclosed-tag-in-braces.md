---
'@tsrx/core': patch
'@tsrx/solid': patch
---

An unclosed tag or `<>` inside `{…}` no longer breaks a collecting or loose compile. On React, Preact and Hono's server target, an element holding one was hoisted to a module-level static before the compile closed the tag, so `<div>{<>}</div>` threw `TypeError: Cannot read properties of null (reading 'type')`, which the editor showed at the start of the file, and `<div>{<b>}</div>` left the editor's code unclosed, so TypeScript added five errors to TSRX1001. Such an element is no longer hoisted: the compile reports TSRX1001 alone and the editor's code closes the tag. On Solid, the closing tag the editor's code adds for an unclosed tag in braces no longer maps back to the opening `<`, as on the other targets. Compiled output of valid files doesn't change.
