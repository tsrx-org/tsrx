---
'@tsrx/core': patch
---

A module can name what its `declare global` block declares in an export list,
as TypeScript allows: `declare global { class Model {} }` followed by
`export { Model };` no longer fails to compile with `Export 'Model' is not
defined`, and the editor no longer reports it. The parser ports the fix from
sveltejs/acorn-typescript#110 until a release includes it. It follows
TypeScript in what the block makes global: the names a destructuring `var`
declares, an `import … =` alias only when exported, and only exported
declarations when the block holds an export list. A block that isn't at the
top level of the file adds nothing, as before.
