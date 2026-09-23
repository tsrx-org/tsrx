---
'@tsrx/core': patch
---

Map TypeScript constructor parameter properties (`private readonly x: T`) and
bodyless class methods (overload signatures, `abstract` and optional methods)
in the source-mapping walker, which previously threw
`Unhandled AST node type in mapping walker` and dropped the file to raw text.
Also keep the `override` modifier on parameter properties in printed output.
