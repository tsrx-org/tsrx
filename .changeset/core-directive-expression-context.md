---
'@tsrx/core': patch
---

A control-flow directive used as a value in parentheses, as an argument, as a property value or inside a template literal's `${ }` no longer changes how the code after it is read. `(@if (c) { … }) / 2`, `foo(@for (…) { … }) <= y`, `` `${(@if (c) { … })}x` `` and `<div title={(@if (c) { … }) / 2} />` used to fail with "Unterminated regular expression", "Unexpected token" or "Unterminated template", because the token after the closing `)` or `}` was read as the start of a new expression. They now parse as the same code with an element in place of the directive does.
