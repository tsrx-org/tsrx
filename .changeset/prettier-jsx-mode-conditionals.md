---
'@tsrx/prettier-plugin': patch
---

A conditional with an element in it now breaks like Prettier's JSX mode. When
the test or a branch of a conditional, or of a chain of nested conditionals, is
an element, a fragment, or a template value (`@if`, `@for`, `@switch`, `@try`,
or a `@{ … }` value), the chain doesn't indent and each branch breaks inside
parentheses of its own: `cond ? (`, the element, `) : (`, the other branch,
`)`. A `null` or `undefined` branch and a nested conditional alternate stay
bare, and a conditional that fits stays on one line.

A string in braces in an attribute (`title={'Hello'}`) now keeps its braces,
like Prettier, instead of becoming an attribute string (`title="Hello"`). The
string follows `singleQuote` like any other string, and a comment inside the
braces is no longer deleted.
