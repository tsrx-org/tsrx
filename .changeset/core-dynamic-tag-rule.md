---
'@tsrx/core': minor
'@tsrx/mcp': patch
---

A dynamic tag expression (`<{expr}>`) must now be one of three forms: an
identifier (`tag`), a member access (`props.as`, `this.tag`, `registry[name]`,
`items[0]`, where each computed key is an identifier, a string or number
literal, or a member access), or a string literal (`'section'`). Anything else
is reported as `tsrx-dynamic-tag-expression`, including code that compiled
before: a conditional, `||`, `??` or `&&` (`<{c ? A : B} />`), parentheses and
type-only wrappers (`<{tag as any} />`), optional member access, a template
literal, an arrow function, and an element. A non-self-closing element repeats
the expression in its closing tag, so compute the tag above the element
instead: `const Tag = c ? Child : Fallback;` followed by `<{Tag} />`.

Any expression parses, and the check doesn't change the tree. A normal compile
throws the error, and `collect` and `loose` mode record it once per element at
the part of the expression that isn't allowed and go on, so the editor
underlines the tag and keeps working. A call or a concatenation in a tag used
to fail the whole file in `collect` mode.
