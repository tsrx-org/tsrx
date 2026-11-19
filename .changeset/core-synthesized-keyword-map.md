---
'@tsrx/core': patch
---

A keyword the compiler prints from a node that doesn't start with it in the source no longer maps its end into other text. The `return` around a template's output, such as the root element of a `@{ … }` body or an `@if` output, and the `const` the Vue target writes for a component function or an `@catch` body, map no keyword end. A `switch`, `case`, `default` or `{` printed from `@switch`, `@case`, `@default` or `@{` now ends where that directive ends. The source map put those ends at the node's start plus the keyword's length: in a string, in the middle of a directive such as `@for`, or past the node. In the editor, an expression that started there, such as `{props.label}` in `@{ <div>{props.label}</div> }`, now maps from its own text, so a diagnostic on it covers the right text.
