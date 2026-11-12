---
'@tsrx/core': patch
---

An export list inside a `declare namespace` or `declare module` body can now name a function declared in that body, such as `declare namespace Q { function f(): void; export { f }; }`, overloads and `export { f as g }` included. It can also name a declaration that comes later in the body, such as `declare namespace Q { export { c }; const c: number; }`. Before, both failed with `Export 'c' is not defined`. An export of a name that the body and the scopes around it don't declare is still reported, now also when a later export list in another body or namespace names a declaration of the same name.
