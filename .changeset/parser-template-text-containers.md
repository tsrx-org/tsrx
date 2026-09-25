---
'@tsrx/core': patch
---

Template text in an element inside a `{…}` container or a `switch` case reads
as it does everywhere else:

- In an element inside a `{…}` container, a child container or an attribute
  value, the text after a closing tag keeps its leading space
  (`{x && <div><b>1</b> 2</div>}` rendered `12` instead of `1 2`), and a
  non-breaking space there no longer fails with `Unexpected character`. The
  same holds in an element in a control-flow body inside a container, after a
  closing tag or a child container.
- In an element in an `@switch` case, or in a `switch` case of a function
  (`case 1: return <div> 1<b /></div>;`), text is no longer read as code: its
  leading spaces are kept, a non-breaking space parses, and text before a tag
  (`<div>1<b /></div>`) no longer overflows the stack.

Template text that the parser can't read now fails with `Unexpected token`
instead of `Not enough stack space to parse input`.
