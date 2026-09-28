---
'@tsrx/core': minor
---

Give a type parameter's name (`T` in `<T>`, a mapped type's key, `infer U`) as an `Identifier` with its position, as typescript-estree and Babel 8 do, not the string acorn-typescript keeps. Tools that read `TSTypeParameter.name` as a string read `name.name` now.
