---
'@tsrx/core': patch
---

The editor's view of a `.tsrx` file now writes imports and the ends of statements as the source does. The compiled output is unchanged.

- An import is written as in the source, also over several lines, without spaces or with a trailing comma. On TypeScript 7, Organize Imports, Sort Imports and Remove Unused Imports now work when an import ends without `;` (#1023) or is written in another layout than the printer's (#1033).
- On TypeScript 5.9 and 6, removing one unused name from an import also removes the comma next to it, as in a `.tsx` file (#1025).
- A statement that ends without `;` in the source also ends without one in the editor's view, unless the next line could continue it. On TypeScript 7, auto-import now offers a name such as `useMemo` at the end of `const m = useMem` (#1064). On TypeScript 5.9 and 6, the code of an edit, such as the imports Sort Imports writes, uses `;` as the source does.
