---
'@tsrx/core': patch
---

In the editor's view of a `.tsrx` file, a `@ts-expect-error` or `@ts-ignore` directive above a statement written over several lines now covers only the first line of the statement, as in TypeScript (#1144). The view used to print such a statement on one line, so the directive also hid the errors of its later lines, and an unused directive went unreported. A directive above a long statement written on one line, which the view used to split, now covers all of it. The compiled output is unchanged.
