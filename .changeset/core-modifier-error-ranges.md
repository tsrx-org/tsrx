---
'@tsrx/core': patch
---

An error the parser reports at a modifier now covers the whole modifier, as TypeScript reports it, where it covered the modifier's first character: TS1038 and TS1184 at `declare`, TS1242 at `abstract`, TS2668 at `export`, and the errors of a class member's modifiers (TS1028, TS1029, TS1030, TS1243 and others). In the editor, such an error on a modifier the editor's code leaves out shows on that modifier, where it showed on the code before it: TS1242 for `abstract namespace N {}` on a later line showed on the line before, TS1184 for `declare class C {}` in a block on the `{`, TS1038 for a `declare function` in a `declare namespace` on the namespace's name. TypeScript's own errors on the code after such a modifier no longer move onto the modifier.
