---
'@tsrx/core': patch
---

Read a JSX tag whose prop holds a generic arrow with a function-type constraint
(`<Box fn={<T extends () => void,>(x: T) => x} />`) as JSX. The generic-arrow
lookahead treated the `>` of `=>` as a closing angle bracket, so the outer tag
was tokenized as a type parameter list and parsing failed with
`Unexpected token`. The lookahead now scans an actual type parameter list
(`<[const] Name [extends Type] [= Type], ...>`), skipping strings, comments,
`=>`, and nested brackets, instead of counting angle brackets.
