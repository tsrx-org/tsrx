---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

The parser reads the import attributes of an import type, which failed with
`Unexpected token`: `import("./data.json", { with: { type: "json" } })`,
`import("pkg", { with: { "resolution-mode": "require" } }).Name`, and the same
after `typeof`. They go on the `TSImportType` node's `options`, the name
typescript-estree and acorn's `ImportExpression` use, and an import type
without them has `options: null`. As in TypeScript, the attributes are an
object literal, and neither argument takes a trailing comma. The compiled and
type-only TypeScript keep the attributes, and the editor maps them back to the
source.

The formatter prints the import attributes of an import type, like Prettier:
the module specifier and the attributes lay out like call arguments, without a
trailing comma.
