---
'@tsrx/prettier-plugin': patch
'@tsrx/core': patch
---

Format parameters and type parameters like Prettier: a lone parameter typed as an intersection or a generic type with an object type argument (such as `props: Props<{ … }>`) no longer hugs the parentheses, and the parameter list breaks instead. A comment between a type parameter's name and its `extends`, `=`, or mapped type `in`, or between a `const`, `in`, or `out` modifier and the name, stays there. A comment after the parenthesized expression body of an arrow function moves after the statement's `;` in one pass.
