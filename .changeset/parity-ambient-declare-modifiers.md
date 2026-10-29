---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

A declaration's modifiers now report only the error TypeScript reports, in a collecting parse (the editor) too. `declare public class A {}` in a `declare namespace` is TS1038 at the inner `declare`, without a TS1044 for `public`, and `public private class A {}` is TS1044 at `public` only. The formatter still refuses code whose modifiers the tree leaves out, which it now reads from the declaration's metadata.
