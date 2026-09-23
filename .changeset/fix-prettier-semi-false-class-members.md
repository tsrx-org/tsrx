---
'@tsrx/prettier-plugin': patch
---

Keep class members apart when formatting TSRX files with `semi: false`. A short
class no longer collapses onto one line when a field, index signature, or
bodiless method is followed by another member, so `class A { x = 1; y = 2 }`
no longer becomes the invalid `class A { x = 1 y = 2 }`. A field also keeps its
`;` when the next member would otherwise continue it: before a computed member,
an index signature, a generator method, or a member named `in` or
`instanceof`, and after a bare `static`, `get`, or `set` field. Previously
`x = a;` followed by `[k] = 1;` came back as `x = a` / `[k] = 1`, which reads
as `x = a[k] = 1`.
