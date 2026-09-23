---
'@tsrx/core': patch
---

`tsrx-tsc` and the editor now report errors in class type positions, such as
`value!: MissingType` failing with `Cannot find name 'MissingType'`. The
source-mapping walker skipped class field type annotations, class and method
type parameters, `extends Base<T>` type arguments, `implements` clauses, and
class and member decorators. Volar drops any diagnostic it cannot map back
to the source, so these files type-checked clean.
