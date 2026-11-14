---
'@tsrx/core': patch
'@tsrx/solid': patch
---

An unclosed tag or `<>` inside `{…}` no longer breaks a collecting or loose compile. On React, Preact and Hono's server target, an element holding one was hoisted to a module-level static before the compile closed the tag, so `<div>{<>}</div>` threw `TypeError: Cannot read properties of null (reading 'type')`, which the editor showed at the start of the file, and `<div>{<b>}</div>` left the editor's code unclosed, so TypeScript added five errors to TSRX1001. Such an element is no longer hoisted: the compile reports TSRX1001 alone and the editor's code closes the tag. The closing tag the editor's code adds to an unclosed tag has no mapping on Solid in braces and on every target for a dynamic tag (`<{Tag}>`), as for other tags, and the mapping of the braces around it no longer covers it, so TypeScript's error on it, such as TS2304 for an undefined `<Missing>`, isn't shown a second time at the end of the braces. Compiled output of valid files doesn't change.
