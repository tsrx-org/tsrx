---
'@tsrx/core': patch
---

**Organize Imports**, **Sort Imports** and **Remove Unused Imports** now change `.tsrx` files in which a comment follows an import on the same line. As in a `.ts` file, the comment moves with its import, and Remove Unused Imports removes it with its import. Before, these actions did not change such a file. On TypeScript 7, they now also work when spaces end the line of an import, but the imports must still end with `;` (#1023).

`@tsrx/core` now exports `getLineCommentsAfter` and `isOrganizedImport`, so that a compiler with its own type-only printer can print these comments too.
