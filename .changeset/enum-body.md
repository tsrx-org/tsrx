---
'@tsrx/core': minor
'@tsrx/prettier-plugin': patch
---

Give an enum's members in a `TSEnumBody` that spans its braces (`enum E { A }`'s `body.members`), as typescript-estree and Babel 8 do, not on the declaration as acorn-typescript keeps them. Tools that read `TSEnumDeclaration.members` read `body.members` now. `@tsrx/prettier-plugin` prints the body.
